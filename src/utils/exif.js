/**
 * EXIF / 图片元数据解析（手写 JPEG 段扫描 + TIFF/APP1 解码）
 * =====================================================================
 * 零依赖：段标记表、TIFF IFD 读取、有符号与有理数解码、Base64 与十六进制
 * 全部在本文件内实现，不引 exif-js 之类的第三方库。
 *
 * 输入是「本机图片文件的字节」。视图层用 FileReader / fetch(blob:URL) /
 * plus.io 把用户相册里选中的文件读成 Uint8Array —— 读的是本地文件，
 * 全程不发起任何网络请求，也不上传任何字节（见 readImageBytes 的白名单）。
 *
 * 能力边界（视图层要如实转述，不要夸大）：
 *   1. 只解析 JPEG 的 APP1/Exif；PNG 只读 IHDR / pHYs / tEXt / iTXt / zTXt / eXIf
 *      （PNG 那段是单独的最小实现，结果里用 format='PNG' 与 pngNote 标注）。
 *   2. WebP / GIF / HEIC 不支持，返回 supported:false 的友好结果，不抛栈。
 *   3. MakerNote 是厂商私有格式，只报「有多少条/多少字节」，不解读内容。
 *   4. 清除元数据不是字节级保留：靠 canvas 重绘再编码输出，属于重新压缩，
 *      会有轻微画质损失，并丢掉原始位深与 ICC 等描述块。
 *
 * 防御：TIFF 里所有 offset / count 都当不可信输入处理。越界、长度撒谎、
 * 类型不认识、IFD 循环引用都有上限（MAX_* 常量）与 visited 集合兜住，
 * 异常统一抛中文 Error 或收进 warnings，绝不死循环、绝不越界读。
 */

/** 单个 IFD 允许的最大条目数（真实相机一般 20~60 条） */
export const MAX_TIFF_ENTRIES = 480
/** 子 IFD 嵌套深度上限 */
export const MAX_IFD_DEPTH = 5
/** 整份 TIFF 块里最多处理多少个 IFD */
export const MAX_IFDS = 12
/** 单个标签值允许声明的元素个数 */
export const MAX_VALUE_COUNT = 4096
/** 只处理 40 MB 以内的文件 */
export const MAX_IMAGE_BYTES = 40 * 1024 * 1024
/** JPEG 段扫描最多走多少段 */
export const MAX_SEGMENTS = 4096

/* =====================================================================
 * 一、JPEG 段标记表
 * ===================================================================== */

const MARKER_CN = {
  0x01: 'TEM 临时',
  0xc0: 'SOF0 基线',
  0xc1: 'SOF1 扩展',
  0xc2: 'SOF2 渐进',
  0xc3: 'SOF3 无损',
  0xc4: 'DHT 哈夫曼表',
  0xc5: 'SOF5 差分',
  0xc6: 'SOF6',
  0xc7: 'SOF7',
  0xc8: 'JPG 预留',
  0xc9: 'SOF9 算术',
  0xca: 'SOF10',
  0xcb: 'SOF11',
  0xcc: 'DAC 算术表',
  0xcd: 'SOF13',
  0xce: 'SOF14',
  0xcf: 'SOF15',
  0xd0: 'RST0', 0xd1: 'RST1', 0xd2: 'RST2', 0xd3: 'RST3',
  0xd4: 'RST4', 0xd5: 'RST5', 0xd6: 'RST6', 0xd7: 'RST7',
  0xd8: 'SOI 图像起始',
  0xd9: 'EOI 图像结束',
  0xda: 'SOS 开始扫描',
  0xdb: 'DQT 量化表',
  0xdc: 'DNL 行数',
  0xdd: 'DRI 重启间隔',
  0xe0: 'APP0（JFIF）',
  0xe1: 'APP1（EXIF/XMP）',
  0xe2: 'APP2（MPF/ICC）',
  0xe3: 'APP3', 0xe4: 'APP4', 0xe5: 'APP5', 0xe6: 'APP6', 0xe7: 'APP7',
  0xe8: 'APP8', 0xe9: 'APP9', 0xea: 'APP10', 0xeb: 'APP11', 0xec: 'APP12',
  0xed: 'APP13（Photoshop）',
  0xee: 'APP14',
  0xef: 'APP15',
  0xfe: 'COM 注释',
}

/** SOI / EOI / RSTn / TEM 没有长度字段 */
function isStandalone(m) {
  return m === 0xd8 || m === 0xd9 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)
}

/* =====================================================================
 * 二、TIFF 类型表 + 标签中文名 + 枚举含义
 * ===================================================================== */

const TIFF_TYPES = {
  1: { name: 'BYTE', size: 1, kind: 'bytes' },
  2: { name: 'ASCII', size: 1, kind: 'text' },
  3: { name: 'SHORT', size: 2, kind: 'short' },
  4: { name: 'LONG', size: 4, kind: 'long' },
  5: { name: 'RATIONAL', size: 8, kind: 'ratio', signed: false },
  6: { name: 'SRATIONAL', size: 8, kind: 'ratio', signed: true },
  7: { name: 'UNDEFINED', size: 1, kind: 'bytes' },
  9: { name: 'SLONG', size: 4, kind: 'slong' },
  10: { name: 'SRATIONAL', size: 8, kind: 'ratio', signed: true },
  // FLOAT / DOUBLE 在相机 EXIF 里几乎不出现，只标注不解析
  11: { name: 'FLOAT', size: 4, kind: 'opaque' },
  12: { name: 'DOUBLE', size: 8, kind: 'opaque' },
}

/** 子 IFD 指针：不在列表里重复展示，避免「见下方」刷屏 */
const POINTER_TAGS = new Set([0x8769, 0x8825, 0xa005, 0x014a])

/**
 * 标签中文名与说明，按来源 IFD 分组（同一 tag 号在 IFD0 与 Exif 子 IFD
 * 里含义不同，必须分组）。未收录的标签原样显示 tag 号并标「未收录」。
 */
export const EXIF_TAGS = {
  IFD0: {
    0x0100: { name: '图像宽度', note: '编码时的像素宽' },
    0x0101: { name: '图像高度', note: '编码时的像素高' },
    0x0102: { name: '位深', note: 'BitsPerSample，每通道位数' },
    0x0103: { name: '压缩方式', note: 'Compression' },
    0x0106: { name: '色彩解释', note: 'PhotometricInterpretation' },
    0x010e: { name: '图片描述', note: 'ImageDescription，有时写标题' },
    0x010f: { name: '相机品牌', note: 'Make' },
    0x0110: { name: '相机型号', note: 'Model' },
    0x0112: { name: '方向', note: 'Orientation，画面朝向' },
    0x0115: { name: '通道数', note: 'SamplesPerPixel' },
    0x011a: { name: '水平分辨率', note: 'XResolution' },
    0x011b: { name: '垂直分辨率', note: 'YResolution' },
    0x011c: { name: '行内预测', note: 'Predictor' },
    0x0128: { name: '分辨率单位', note: 'ResolutionUnit' },
    0x0131: { name: '处理软件', note: 'Software，导出/修图软件会写这条' },
    0x0132: { name: '修改时间', note: 'DateTime，写文件的时间' },
    0x014a: { name: 'SubIFD 指针', note: '缩略图常放在这里' },
    0x8298: { name: '版权', note: 'Copyright' },
    0x8769: { name: 'Exif 子 IFD 指针', note: '指向拍摄参数表' },
    0x8825: { name: 'GPS 子 IFD 指针', note: '指向位置信息表' },
  },
  Exif: {
    0x0201: { name: '缩略图位置', note: 'JPEGInterchangeFormat，TIFF 块内偏移' },
    0x0202: { name: '缩略图长度', note: 'JPEGInterchangeFormatLength' },
    0x829a: { name: '曝光时间', note: 'ExposureTime，单位秒' },
    0x829d: { name: '光圈值', note: 'FNumber' },
    0x8773: { name: '色彩描述块', note: 'InterColorProfile，ICC 原数据' },
    0x8822: { name: '曝光程序', note: 'ExposureProgram' },
    0x8824: { name: '光谱灵敏度', note: 'SpectralSensitivity' },
    0x8827: { name: 'ISO', note: '感光度' },
    0x8830: { name: '感光度类型', note: 'SensitivityType' },
    0x9000: { name: 'Exif 版本', note: '版本四字节' },
    0x9003: { name: '拍摄时间', note: 'DateTimeOriginal，隐私敏感度最高' },
    0x9004: { name: '数字化时间', note: 'DateTimeDigitized' },
    0x9101: { name: '分量配置', note: 'ComponentsConfiguration' },
    0x9102: { name: '分量采样比', note: 'MatchSequence' },
    0x9201: { name: '快门速度值', note: 'APEX 表示，需换算成秒' },
    0x9202: { name: '光圈值（APEX）', note: 'ApertureValue' },
    0x9203: { name: '亮度值', note: 'BrightnessValue，APEX' },
    0x9204: { name: '曝光偏差', note: 'ExposureBiasValue，单位 EV' },
    0x9205: { name: '最大光圈', note: 'MaxApertureValue（APEX）' },
    0x9206: { name: '对焦距离', note: 'SubjectDistance，单位米' },
    0x9207: { name: '测光模式', note: 'MeteringMode' },
    0x9208: { name: '光源', note: 'LightSource' },
    0x9209: { name: '闪光灯', note: 'Flash，位域' },
    0x920a: { name: '焦距', note: 'FocalLength，实际毫米数' },
    0x9214: { name: '测光框', note: 'SubjectArea' },
    0x927f: { name: '厂商私有数据', note: 'MakerNote，格式不公开，不解读' },
    0x9286: { name: '用户注释', note: 'UserComment，可能藏路径/机型' },
    0x9290: { name: '子秒时间', note: '拍摄时间的毫秒小数' },
    0x9291: { name: '子秒原时间', note: 'SubsecTimeOriginal' },
    0xa000: { name: 'FlashPix 版本', note: 'FlashpixVersion' },
    0xa001: { name: '色彩空间', note: 'ColorSpace，65536 = sRGB' },
    0xa002: { name: '画面宽度', note: 'PixelXDimension，重编码后的实际宽' },
    0xa003: { name: '画面高度', note: 'PixelYDimension' },
    0xa004: { name: '相关声音文件', note: 'RelatedSoundFile' },
    0xa005: { name: 'Interop 子 IFD 指针', note: '指向互操作表' },
    0xa20b: { name: '闪光灯能量', note: 'FlashEnergy' },
    0xa217: { name: '镜头品牌', note: 'LensMake' },
    0xa300: { name: '文件来源', note: 'FileSource' },
    0xa301: { name: '场景来源', note: 'SceneType' },
    0xa401: { name: '感光度类型', note: 'SensitivityType' },
    0xa402: { name: '曝光模式', note: 'ExposureMode' },
    0xa403: { name: '白平衡', note: 'WhiteBalance' },
    0xa404: { name: '数码变焦比', note: 'DigitalZoomRatio' },
    0xa405: { name: '等效 35mm 焦距', note: 'FocalLengthIn35mmFilm' },
    0xa406: { name: '场景类型', note: 'SceneCaptureType' },
    0xa407: { name: '增益控制', note: 'GainControl' },
    0xa408: { name: '对比度', note: 'Contrast' },
    0xa409: { name: '饱和度', note: 'Saturation' },
    0xa40a: { name: '锐度', note: 'Sharpness' },
    0xa40b: { name: '设备设置', note: 'DeviceSettingDescription' },
    0xa40c: { name: '对焦距离范围', note: 'SubjectDistanceRange' },
    0xa420: { name: '图片唯一 ID', note: 'ImageUniqueID，隐私字段' },
    0xa430: { name: '机身序列号', note: 'CameraSerialNumber，隐私字段' },
    0xa432: { name: '感光器宽', note: 'FocalPlaneXResolution' },
    0xa433: { name: '感光器高', note: 'FocalPlaneYResolution' },
    0xa434: { name: '镜头型号', note: 'LensModel，最容易被忽略的隐私' },
    0xa435: { name: '镜头序列号', note: 'LensSerialNumber，隐私字段' },
  },
  GPS: {
    0x0000: { name: 'GPS 版本', note: 'GPSVersionID' },
    0x0001: { name: '纬度半球', note: 'N 北纬 / S 南纬' },
    0x0002: { name: '纬度', note: '度/分/秒三段有理数' },
    0x0003: { name: '经度半球', note: 'E 东经 / W 西经' },
    0x0004: { name: '经度', note: '度/分/秒三段有理数' },
    0x0005: { name: '海拔参考', note: '0 高于海平面 / 1 低于' },
    0x0006: { name: '海拔', note: 'GPSAltitude，单位米' },
    0x0007: { name: 'GPS 时间', note: '时/分/秒，世界时' },
    0x0008: { name: '卫星编号', note: 'GPSSatellites' },
    0x0009: { name: '定位状态', note: 'A 有效 / V 无效' },
    0x000a: { name: '测量模式', note: 'GPSMeasureMode' },
    0x000b: { name: '定位精度稀释', note: 'GPSDOP，值越大约不准' },
    0x000c: { name: '速度单位', note: 'GPSSpeedRef：K 公里/时 M 英里/时 N 节' },
    0x000d: { name: '移动速度', note: 'GPSSpeed' },
    0x000e: { name: '航向参考', note: 'GPSTrackRef：T 真北 M 磁北' },
    0x000f: { name: '行进航向', note: 'GPSTrack，角度' },
    0x0010: { name: '拍摄朝向参考', note: 'GPSImgDirectionRef：T 真北 M 磁北' },
    0x0011: { name: '拍摄朝向', note: 'GPSImgDirection，镜头朝向角度' },
    0x0012: { name: '地图基准', note: 'GPSMapDatum，常见 WGS-84' },
    0x0013: { name: '目标纬度参考', note: 'GPSDestLatitudeRef' },
    0x0014: { name: '目标纬度', note: 'GPSDestLatitude' },
    0x0015: { name: '目标经度参考', note: 'GPSDestLongitudeRef' },
    0x0016: { name: '目标经度', note: 'GPSDestLongitude' },
    0x0017: { name: '目标方位参考', note: 'GPSDestBearingRef' },
    0x0018: { name: '目标方位', note: 'GPSDestBearing，角度' },
    0x0019: { name: '目标距离单位', note: 'GPSDestDistanceRef：K M N' },
    0x001a: { name: '目标距离', note: 'GPSDestDistance' },
    0x001b: { name: '定位方法', note: 'GPSProcessingMethod，可能写芯片/运营商' },
    0x001c: { name: '区域信息', note: 'GPSAreaInformation' },
    0x001d: { name: 'GPS 日期', note: 'GPSDateStamp，隐私字段' },
    0x001e: { name: '差分校正', note: 'GPSDifferential：0 未差分 1 已差分' },
    0x001f: { name: '水平定位误差', note: 'GPSHPositioningError，单位米' },
  },
  Interop: {
    0x0001: { name: '互操作索引', note: '常见 R98（Exif 兼容缩略图）' },
    0x0002: { name: '互操作版本', note: 'InteropVersion' },
    0x1000: { name: '相关图像宽度', note: 'RelatedImageWidth' },
    0x1001: { name: '相关图像格式', note: 'RelatedImageFormat' },
    0x1002: { name: '相关图像长度', note: 'RelatedImageLength' },
  },
}

/** 枚举含义：键为「分组:tag 十六进制」，避免不同 IFD 的同号标签串味 */
const ENUMS = {
  'IFD0:0x0103': { 1: '无压缩', 2: 'CCITT R4', 6: 'JPEG（旧 T6）', 7: 'JPEG', 8: 'Deflate', 32773: 'PackBits' },
  'IFD0:0x0106': { 0: '白底 0=黑', 1: '黑底 0=白', 2: 'RGB', 3: '调色板', 4: '透明度掩膜', 5: 'CMYK', 6: 'YCbCr' },
  'IFD0:0x0128': { 1: '没有单位', 2: '英寸', 3: '厘米' },
  'Exif:0x8822': {
    0: '未定义', 1: '手动', 2: '程序自动', 3: '光圈优先', 4: '快门优先',
    5: '创意（景深优先）', 6: '动作（快门速度优先）', 7: '人像（大光圈）', 8: '风景（小光圈）',
    9: '自拍', 10: '运动', 11: '人群', 12: '夜景', 13: '全景',
  },
  'Exif:0x9207': {
    0: '未知', 1: '平均测光', 2: '中央重点平均', 3: '点测光', 4: '分区测光',
    5: '多点测光', 6: '图案测光', 255: '其他',
  },
  'Exif:0x9208': {
    1: '日光', 2: '荧光灯', 3: '白炽灯', 4: '闪光灯', 9: '阴天', 10: '阴影',
    11: '蓝色天空', 12: '宽谱荧光', 255: '其他',
  },
  'Exif:0xa001': { 1: '未校准', 2: 'Adobe RGB', 65534: 'ICC 描述', 65535: 'sRGB', 65536: 'sRGB（部分软件按 65536 写）' },
  'Exif:0xa402': { 0: '自动曝光', 1: '手动曝光', 2: '自动包围曝光', 3: '手动包围曝光' },
  'Exif:0xa403': { 0: '自动白平衡', 1: '手动白平衡' },
  'Exif:0xa406': { 0: '标准', 1: '风景', 2: '夜景', 3: '运动/人物' },
  'Exif:0xa407': { 0: '无增益', 1: '弱增益', 2: '强增益', 3: '弱增益', 4: '强增益' },
  'Exif:0xa408': { 0: '普通', 1: '弱', 2: '强' },
  'Exif:0xa409': { 0: '普通', 1: '低', 2: '高' },
  'Exif:0xa40a': { 0: '普通', 1: '软', 2: '硬' },
  'Exif:0xa40c': { 0: '未知', 1: '微距', 2: '近景', 3: '远景' },
  'Exif:0xa300': { 3: '直接数字相机' },
  'Exif:0xa301': { 1: '直接拍摄' },
  'Exif:0x8830': { 0: '未知', 1: '标准输出感量', 2: '推荐曝光指数', 3: '两者', 4: '闪光灯感量', 5: '两者' },
  'Exif:0xa401': { 0: '未知', 1: '标准输出感量', 2: '推荐曝光指数', 3: '两者', 4: '闪光灯感量', 5: '两者' },
  'GPS:0x0005': { 0: '高于海平面', 1: '低于海平面' },
  'GPS:0x0009': { A: '定位有效', V: '定位无效（可能是上次缓存）' },
  'GPS:0x000a': { 1: '2 个定位点', 2: '2D 定位', 3: '3D 定位' },
  'GPS:0x000c': { K: '公里/时', M: '英里/时', N: '节' },
  'GPS:0x000e': { T: '真北', M: '磁北' },
  'GPS:0x0010': { T: '真北', M: '磁北' },
  'GPS:0x0017': { T: '真北', M: '磁北' },
  'GPS:0x0019': { K: '公里', M: '英里', N: '海里' },
  'GPS:0x001e': { 0: '未差分', 1: '已差分' },
}

/** Orientation → 中文含义 + 摆正画面需要的操作（顺时针角度 + 是否镜像） */
export const ORIENTATIONS = {
  1: { cn: '正常', rotate: 0, flip: '', hint: '不用转' },
  2: { cn: '水平镜像', rotate: 0, flip: '水平', hint: '需左右翻转' },
  3: { cn: '上下颠倒', rotate: 180, flip: '', hint: '需顺时针转 180°' },
  4: { cn: '垂直镜像', rotate: 0, flip: '垂直', hint: '需上下翻转' },
  5: { cn: '镜像后顺时针 270°', rotate: 270, flip: '水平', hint: '需水平镜像 + 顺时针 270°' },
  6: { cn: '竖拍（右侧为起点）', rotate: 90, flip: '', hint: '需顺时针转 90°' },
  7: { cn: '镜像后顺时针 90°', rotate: 90, flip: '水平', hint: '需水平镜像 + 顺时针 90°' },
  8: { cn: '竖拍（左侧为起点）', rotate: 270, flip: '', hint: '需顺时针转 270°' },
}

/* =====================================================================
 * 三、通用字节工具
 * ===================================================================== */

/** 常见输入 → Uint8Array（独立副本，避免后续 subarray 语义变化） */
export function toBytes(x) {
  if (x instanceof Uint8Array) return x
  if (typeof ArrayBuffer !== 'undefined' && x instanceof ArrayBuffer) return new Uint8Array(x)
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(x)) {
    return new Uint8Array(x.buffer.slice(x.byteOffset, x.byteOffset + x.byteLength))
  }
  if (Array.isArray(x)) {
    const out = new Uint8Array(x.length)
    for (let i = 0; i < x.length; i++) out[i] = Number(x[i]) & 0xff
    return out
  }
  throw new Error('只能接收 Uint8Array / ArrayBuffer / 字节数组，别的类型读不了')
}

/** 字节 → 大写十六进制串 */
export function hexBytes(bytes, sep) {
  const s = sep === undefined ? ' ' : sep
  const out = []
  for (let i = 0; i < bytes.length; i++) out.push(('0' + (bytes[i] & 0xff).toString(16).toUpperCase()).slice(-2))
  return out.join(s)
}

const B64CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** 字节 → Base64：缩略图数据必须走字节级，套字符串通道会改字节 */
export function bytesToBase64(bytes) {
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]
    out += B64CH[(n >> 18) & 63] + B64CH[(n >> 12) & 63] + B64CH[(n >> 6) & 63] + B64CH[n & 63]
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const n = bytes[i] << 16
    out += B64CH[(n >> 18) & 63] + B64CH[(n >> 12) & 63] + '=='
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8)
    out += B64CH[(n >> 18) & 63] + B64CH[(n >> 12) & 63] + B64CH[(n >> 6) & 63] + '='
  }
  return out
}

/** 洗掉控制字符，避免 EXIF 里的脏字节把界面弄乱 */
function printable(str, max) {
  const s = String(str).replace(/\u0000+$/, '').replace(/[\r\n]+/g, ' / ')
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    out += c === 9 ? ' ' : c < 32 || c === 127 ? '·' : s[i]
    if (max && out.length >= max) break
  }
  return out
}

/** EXIF 的 ASCII 标签名义上是 latin-1 */
function textOf(bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  const cut = s.indexOf('\u0000')
  if (cut > -1) s = s.slice(0, cut)
  return printable(s, 300)
}

function utf8ish(bytes) {
  try {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes)
  } catch (e) {
    /* 兜底走 latin-1 */
  }
  return textOf(bytes)
}

/* =====================================================================
 * 四、数值与文本格式化
 * ===================================================================== */

function num(v, digits) {
  if (v === null || v === undefined || v === '' || isNaN(v)) return '—'
  const d = digits === undefined ? 4 : digits
  let s = Number(v).toFixed(d)
  if (s.indexOf('.') > -1) s = s.replace(/0+$/, '').replace(/\.$/, '')
  return s
}

/** 有理数：1/250 这类优先写成倒数，更贴近快门读法 */
function ratioText(r) {
  if (!r) return '—'
  if (r.den === 0) return '无效（分母为 0）'
  if (r.num === 0) return '0'
  if (r.num === 1) return '1/' + r.den
  if (Math.abs(r.num) < Math.abs(r.den)) {
    const inv = r.den / r.num
    if (inv >= 2) return '1/' + num(inv, 1)
  }
  return num(r.val, 4)
}

/** APEX → 常规值 */
function apexToAperture(v) {
  return Math.pow(Math.SQRT2, v)
}
function apexToShutter(v) {
  return Math.pow(2, -v)
}

/** '2024:05:01 13:20:11' → '2024-05-01 13:20:11' */
function prettyDateTime(s) {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(s))
  if (!m) return printable(s, 40)
  return m[1] + '-' + m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5] + ':' + m[6]
}

/** 内部值形状 → number（有理数取商，数组取第一个） */
function toNumber(v) {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = Number(v)
    return isNaN(n) ? null : n
  }
  if (Array.isArray(v)) return v.length ? toNumber(v[0]) : null
  if (typeof v === 'object' && v.den !== undefined) return v.den === 0 ? NaN : v.val
  return null
}

function toNumbers(v) {
  if (v === null || v === undefined) return []
  if (Array.isArray(v)) return v.map(toNumber).filter((x) => x !== null)
  const n = toNumber(v)
  return n === null ? [] : [n]
}

/** 度分秒（三段有理数或三段数字）→ 十进制度，S/W 取负 */
export function dmsToDecimal(items, ref) {
  const list = Array.isArray(items) ? items : [items]
  const d = toNumber(list[0])
  const m = toNumber(list.length > 1 ? list[1] : null)
  const s = toNumber(list.length > 2 ? list[2] : null)
  if (d === null) return null
  let v = d + (m || 0) / 60 + (s || 0) / 3600
  const tag = String(ref || '').trim().toUpperCase()
  if (tag === 'S' || tag === 'W') v = -v
  return Math.round(v * 1e6) / 1e6
}

/** 度分秒的人话写法 */
function dmsText(list, ref, suffix) {
  const n = toNumbers(list)
  const deg = n[0] === undefined ? '—' : num(n[0], 0)
  const min = n[1] === undefined ? '—' : num(n[1], 0)
  const sec = n[2] === undefined ? '—' : num(n[2], 2)
  const dec = dmsToDecimal(list, ref)
  const half = String(ref || '').toUpperCase()
  const cn = half === 'N' ? '北纬' : half === 'S' ? '南纬' : half === 'E' ? '东经' : half === 'W' ? '西经' : half || '?'
  return deg + '° ' + min + '′ ' + sec + '″ ' + cn + (dec === null ? '' : '（十进制 ' + dec.toFixed(6) + (suffix || '') + '）')
}

function orientText(v) {
  const o = ORIENTATIONS[v]
  if (!o) return num(v, 0) + '（未定义的方向值，别乱转）'
  const parts = []
  if (o.rotate) parts.push('顺时针 ' + o.rotate + '°')
  if (o.flip) parts.push(o.flip + '镜像')
  return v + '（' + o.cn + '；摆正要 ' + (parts.length ? parts.join(' + ') : '什么都不做') + '）'
}

function flashText(v) {
  if (typeof v !== 'number') return null
  const fired = v & 1
  const ret = (v >> 1) & 3
  const auto = (v >> 3) & 1
  const func = (v >> 4) & 1
  const redEye = (v >> 5) & 1
  const parts = [fired ? '已闪光' : '未闪光']
  if (ret === 1) parts.push('未检测到回光')
  else if (ret === 2) parts.push('检测到回光')
  if (auto) parts.push('自动模式')
  if (func) parts.push('闪光灯未就绪')
  if (redEye) parts.push('防红眼')
  return v + '（' + parts.join('，') + '）'
}

/* =====================================================================
 * 五、TIFF 读取器（大端/小端 + 越界兜底）
 * ===================================================================== */

function mkReader(bytes, start, end) {
  const len = end - start
  if (len < 8) throw new Error('EXIF 里的 TIFF 块只有 ' + len + ' 字节，连头部都不完整')
  const a = bytes[start]
  const b = bytes[start + 1]
  let le
  if (a === 0x49 && b === 0x49) le = true
  else if (a === 0x4d && b === 0x4d) le = false
  else throw new Error('EXIF 头部认不出字节序：前两字节既不是 II（小端）也不是 MM（大端）')

  function need(off, n, what) {
    if (off < 0 || n < 0 || off + n > len) {
      throw new Error('TIFF 偏移越界：' + what + ' 想读 ' + n + ' 字节，块内一共只有 ' + len + ' 字节')
    }
  }
  function u16(off) {
    need(off, 2, '16 位整数')
    const x = bytes[start + off]
    const y = bytes[start + off + 1]
    return le ? x | (y << 8) : (x << 8) | y
  }
  function u32(off) {
    need(off, 4, '32 位整数')
    const w = bytes[start + off]
    const x = bytes[start + off + 1]
    const y = bytes[start + off + 2]
    const z = bytes[start + off + 3]
    return (le ? w | (x << 8) | (y << 16) | (z << 24) : (w << 24) | (x << 16) | (y << 8) | z) >>> 0
  }
  function s32(off) {
    const v = u32(off)
    return v > 0x7fffffff ? v - 0x100000000 : v
  }
  function slice(off, n) {
    need(off, n, '数据段')
    return bytes.subarray(start + off, start + off + n)
  }
  function ratio(off, signed) {
    const n = signed ? s32(off) : u32(off)
    const d = signed ? s32(off + 4) : u32(off + 4)
    return { num: n, den: d, val: d === 0 ? NaN : n / d }
  }
  const magic = u16(2)
  if (magic !== 42) throw new Error('EXIF 头里的 TIFF 魔数是 ' + magic + '，不是 42，这段数据不可信')
  return { le, len, u8: (o) => (need(o, 1, '单字节'), bytes[start + o]), u16, u32, s32, slice, ratio, need }
}

/** 值的位置：<=4 字节内联在条目第 9~12 字节，否则第 9~12 字节是块内偏移 */
function dataOffsetOf(r, at, size) {
  if (size <= 4) {
    r.need(at + 8 + size, 0, '内联值')
    return at + 8
  }
  const off = r.u32(at + 8)
  r.need(off, size, '标签值数据')
  return off
}

function readValue(r, at, t, count, size) {
  const dataAt = dataOffsetOf(r, at, size)
  if (t.kind === 'text') return textOf(r.slice(dataAt, size))
  if (t.kind === 'bytes' || t.kind === 'opaque') {
    const data = r.slice(dataAt, size)
    const shown = Math.min(data.length, 96)
    if (t.name === 'BYTE' && count === 1) return data.length ? data[0] : null
    return { hex: hexBytes(data.subarray(0, shown)), truncated: data.length > shown, bytes: size }
  }
  if (t.kind === 'ratio') {
    const out = []
    for (let i = 0; i < count; i++) out.push(r.ratio(dataAt + i * 8, !!t.signed))
    return out.length === 1 ? out[0] : out
  }
  const out = []
  for (let i = 0; i < count; i++) {
    const p = dataAt + i * t.size
    if (t.kind === 'short') out.push(r.u16(p))
    else if (t.kind === 'long') out.push(r.u32(p))
    else if (t.kind === 'slong') out.push(r.s32(p))
    else out.push(r.u8(p))
  }
  return out.length === 1 ? out[0] : out
}

function keyOf(group, tag) {
  // 表里的键统一小写十六进制，tagHex 对外显示用大写
  return group + ':' + hex4(tag).toLowerCase()
}
function hex4(tag) {
  return '0x' + ('0000' + Number(tag).toString(16).toUpperCase()).slice(-4)
}

/**
 * 解析一个 TIFF 块（APP1 里 'Exif\0\0' 之后那段，或 PNG 的 eXIf 块）。
 * 支持大端/小端、IFD0 与 Exif/GPS/Interop 子 IFD、IFD 顺链与缩略图。
 */
export function parseTiff(bytes, start, end) {
  const r = mkReader(bytes, start, end)
  const fields = []
  const warnings = []
  const visited = new Set()
  const jobs = [{ off: r.u32(4), group: 'IFD0', depth: 0 }]
  const thumbRef = {}
  let ifdCount = 0

  if (jobs[0].off + 2 > r.len) {
    throw new Error('TIFF 首个 IFD 偏移非法：声明在 ' + jobs[0].off + '，块内只有 ' + r.len + ' 字节')
  }

  function readOne(job) {
    r.need(job.off, 2, 'IFD 条目数')
    const n = r.u16(job.off)
    if (n > MAX_TIFF_ENTRIES) {
      throw new Error('IFD 声明了 ' + n + ' 个条目，超过安全上限 ' + MAX_TIFF_ENTRIES + '，这份数据不可信')
    }
    if (job.off + 2 + n * 12 + 4 > r.len) {
      throw new Error('IFD 条目越界：偏移 ' + job.off + ' 处要放 ' + n + ' 条，但块只剩 ' + (r.len - job.off - 2) + ' 字节')
    }

    for (let i = 0; i < n; i++) {
      const at = job.off + 2 + i * 12
      const tag = r.u16(at)
      const typeId = r.u16(at + 2)
      const count = r.u32(at + 4)
      const tagHex = hex4(tag)
      const t = TIFF_TYPES[typeId]
      if (!t) {
        warnings.push(tagHex + ' 用了未支持的 TIFF 类型 ' + typeId + '，只记录条目号')
        continue
      }
      if (count > MAX_VALUE_COUNT) {
        throw new Error('标签 ' + tagHex + ' 声明了 ' + count + ' 个值，超过上限 ' + MAX_VALUE_COUNT)
      }
      const size = t.size * count
      if (size > r.len) {
        throw new Error('标签 ' + tagHex + ' 的值长度撒谎：' + count + ' × ' + t.size + ' = ' + size + ' 字节，比整个 TIFF 块还大')
      }
      let value
      try {
        value = readValue(r, at, t, count, size)
      } catch (e) {
        warnings.push(tagHex + '（' + t.name + '）取值失败：' + e.message)
        continue
      }
      fields.push({ group: job.group, tag, tagHex, type: t.name, count, value })

      const ptr = toNumber(value)
      const push = (off, group, depth) => {
        if (typeof off !== 'number' || !isFinite(off) || off < 8) {
          warnings.push(hex4(tag) + ' 指向的子 IFD 偏移非法（' + off + '），已忽略')
          return
        }
        jobs.push({ off, group, depth })
      }
      if (job.group === 'IFD0' && tag === 0x8769) push(ptr, 'Exif', 1)
      else if (job.group === 'IFD0' && tag === 0x8825) push(ptr, 'GPS', 1)
      else if (job.group === 'Exif' && tag === 0xa005) push(ptr, 'Interop', 2)
      else if (tag === 0x014a && Array.isArray(value)) value.forEach((v) => push(v, 'IFD1', 1))
      else if (job.group === 'Exif' && tag === 0x0201) thumbRef.off = ptr
      else if (job.group === 'Exif' && tag === 0x0202) thumbRef.len = ptr
    }

    const next = r.u32(job.off + 2 + n * 12)
    if (next !== 0) {
      if (next + 2 > r.len) warnings.push('IFD 后继指针 ' + next + ' 越界，已停止顺链')
      else jobs.push({ off: next, group: job.group === 'IFD0' ? 'IFD1' : job.group, depth: job.depth + 1 })
    }
  }

  while (jobs.length) {
    const job = jobs.shift()
    if (job.group !== 'IFD0' && job.depth > MAX_IFD_DEPTH) {
      warnings.push('子 IFD 嵌套超过 ' + MAX_IFD_DEPTH + ' 层，后面的引用已忽略')
      continue
    }
    if (visited.has(job.off)) {
      warnings.push('偏移 ' + job.off + ' 的 IFD 被重复引用，判定为循环引用并跳过')
      continue
    }
    if (ifdCount >= MAX_IFDS) {
      warnings.push('IFD 数量达到上限 ' + MAX_IFDS + '，剩余引用已忽略')
      break
    }
    visited.add(job.off)
    ifdCount++
    try {
      readOne(job)
    } catch (e) {
      // IFD0 读不动就是整份数据不可信；子 IFD 坏了只降级，别把已读到的字段一起丢掉
      if (job.depth === 0) throw e
      warnings.push('「' + job.group + '」子 IFD 解析失败：' + e.message)
    }
  }

  let thumbnail = null
  if (thumbRef.off && thumbRef.len) {
    try {
      const raw = r.slice(thumbRef.off, thumbRef.len)
      if (raw.length > 2 && raw[0] === 0xff && raw[1] === 0xd8) {
        thumbnail = { mime: 'image/jpeg', bytes: raw.length, base64: bytesToBase64(raw) }
      } else {
        warnings.push('缩略图数据开头不是 FF D8，没当 JPEG 缩略图展示')
      }
    } catch (e) {
      warnings.push('缩略图取不出来：' + e.message)
    }
  }

  return { fields, warnings, thumbnail, byteOrder: r.le ? '小端 II' : '大端 MM' }
}

/* =====================================================================
 * 六、TIFF 条目 → 中文行
 * ===================================================================== */

function tagDef(group, tag) {
  const own = EXIF_TAGS[group]
  if (own && own[tag]) return own[tag]
  if (EXIF_TAGS.IFD0 && EXIF_TAGS.IFD0[tag]) return EXIF_TAGS.IFD0[tag]
  for (const k in EXIF_TAGS) {
    if (EXIF_TAGS[k][tag]) return EXIF_TAGS[k][tag]
  }
  return null
}

/** 单值枚举：拿第一个数字/字符去查表 */
function enumText(key, value) {
  const table = ENUMS[key]
  if (!table) return null
  const v = Array.isArray(value) && typeof value[0] !== 'string' ? value[0] : toNumber(value)
  const probe = v === null ? (typeof value === 'string' ? value.trim().toUpperCase() : null) : v
  const cn = table[probe]
  return cn === undefined ? null : num(v, 0) + '（' + cn + '）'
}

/** 需要特殊话术的标签：签名 (f, ctx) → 文本或 null */
const SPECIALS = {
  'IFD0:0x0112': (f) => orientText(toNumber(f.value)),
  'IFD1:0x0112': (f) => orientText(toNumber(f.value)),
  'Exif:0x829a': (f) => {
    const n = toNumber(f.value)
    if (n === null) return null
    return n >= 1 ? num(n, 3) + ' 秒' : n > 0 ? '1/' + Math.round(1 / n) + ' 秒（' + num(n, 5) + '）' : '0 秒'
  },
  'Exif:0x829d': (f) => {
    const n = toNumber(f.value)
    return n === null ? null : 'f/' + num(n, 2)
  },
  'Exif:0x9202': (f) => apexAperture(f),
  'Exif:0x9205': (f) => apexAperture(f),
  'Exif:0x9201': (f) => {
    const n = toNumber(f.value)
    return n === null ? null : 'APEX ' + num(n, 2) + ' ≈ ' + num(apexToShutter(n), 5) + ' 秒'
  },
  'Exif:0x9203': (f) => {
    const n = toNumber(f.value)
    return n === null ? null : 'EV ' + num(n, 2)
  },
  'Exif:0x9204': (f) => {
    const n = toNumber(f.value)
    return n === null ? null : (n > 0 ? '+' : '') + num(n, 2) + ' EV'
  },
  'Exif:0x9206': (f) => {
    const n = toNumber(f.value)
    return n === null ? null : n >= 100 ? '∞（合到无穷远）' : num(n, 2) + ' 米'
  },
  'Exif:0x9209': (f) => flashText(toNumber(f.value)),
  'Exif:0x920a': (f) => {
    const n = toNumber(f.value)
    return n === null ? null : num(n, 1) + ' mm'
  },
  'Exif:0xa405': (f) => {
    const n = toNumber(f.value)
    return n === null ? null : num(n, 1) + ' mm（等效 35mm）'
  },
  'Exif:0xa404': (f) => {
    const n = toNumber(f.value)
    return n === null ? null : num(n, 2) + '×'
  },
  'Exif:0x8827': (f) => toNumbers(f.value).join(' / '),
  'Exif:0x927f': (f) => '厂商私有数据，格式不公开，本工具不解读',
  'Exif:0x8773': () => 'ICC 色彩描述块（二进制，不展开）',
  'Exif:0x0201': (f) => 'TIFF 块内偏移 ' + num(toNumber(f.value), 0),
  'Exif:0x0202': (f) => num(toNumber(f.value), 0) + ' 字节',
  'Exif:0x9003': (f) => prettyDateTime(f.value),
  'Exif:0x9004': (f) => prettyDateTime(f.value),
  'IFD0:0x0132': (f) => prettyDateTime(f.value),
  'IFD1:0x0132': (f) => prettyDateTime(f.value),
  'GPS:0x0001': (f) => refText(f.value, 'N 北纬', 'S 南纬'),
  'GPS:0x0003': (f) => refText(f.value, 'E 东经', 'W 西经'),
  'GPS:0x0002': (f, ctx) => dmsText(f.value, ctx.gpsRef(0x0001), '，北纬/南纬'),
  'GPS:0x0004': (f, ctx) => dmsText(f.value, ctx.gpsRef(0x0003), '，东经/西经'),
  'GPS:0x0006': (f, ctx) => {
    const n = toNumber(f.value)
    if (n === null) return null
    const below = String(ctx.gpsRef(0x0005)) === '1'
    return num(n, 1) + ' 米' + (below ? '（低于海平面）' : '')
  },
  'GPS:0x0007': (f) => toNumbers(f.value).map((x) => ('0' + Math.round(x)).slice(-2)).join(':'),
  'GPS:0x001d': (f) => printable(f.value, 40),
  'Exif:0xa002': (f) => num(toNumber(f.value), 0) + ' px',
  'Exif:0xa003': (f) => num(toNumber(f.value), 0) + ' px',
  'IFD0:0x0100': (f) => num(toNumber(f.value), 0) + ' px',
  'IFD0:0x0101': (f) => num(toNumber(f.value), 0) + ' px',
  'IFD0:0x0102': (f) => toNumbers(f.value).join(' / ') + ' bit',
  'IFD0:0x0115': (f) => num(toNumber(f.value), 0) + ' 通道',
  'IFD0:0x011a': (f) => num(toNumber(f.value), 2) + ' px',
  'IFD0:0x011b': (f) => num(toNumber(f.value), 2) + ' px',
}

function apexAperture(f) {
  const n = toNumber(f.value)
  return n === null ? null : 'APEX ' + num(n, 2) + ' ≈ f/' + num(apexToAperture(n), 2)
}
function refText(v, a, b) {
  const s = (typeof v === 'string' ? v : Array.isArray(v) ? v.map((x) => (typeof x === 'number' ? String.fromCharCode(x) : String(x))).join('') : String(v)).trim()
  const up = s.toUpperCase()
  if (up === a.split(' ')[0]) return s + '（' + a.split(' ')[1] + '）'
  if (up === b.split(' ')[0]) return s + '（' + b.split(' ')[1] + '）'
  return printable(s, 8) || '—'
}

/** 把一条 TIFF 条目变成人话；未收录标签也给出可读文本 */
function describeField(f, ctx) {
  if (f.pre) return Object.assign({}, f)
  const def = tagDef(f.group, f.tag)
  const key = keyOf(f.group, f.tag)
  const out = {
    group: f.group,
    tag: f.tagHex || hex4(f.tag),
    type: f.type,
    name: def ? def.name : '未收录标签',
    known: !!def,
    note: def ? def.note || '' : 'EXIF_TAGS 里没有这个 tag 号，原样输出',
    text: '',
  }
  try {
    const sp = SPECIALS[key]
    if (sp) {
      const t = sp(f, ctx)
      if (t) out.text = t
      else genericText(f, out)
    } else {
      const e = enumText(key, f.value)
      if (e) out.text = e
      else if (f.group === 'Exif' && f.tag === 0xa001 && toNumber(f.value) === 65536) out.text = '65536（sRGB）'
      else genericText(f, out)
    }
  } catch (e) {
    out.text = '这一条格式化失败：' + e.message
  }
  if (!out.text) out.text = '—'
  return out
}

function genericText(f, out) {
  const v = f.value
  if (typeof v === 'string') {
    out.text = printable(v, 200)
    return
  }
  if (v && typeof v === 'object' && !Array.isArray(v) && v.hex !== undefined) {
    out.text = f.type + ' 二进制 ' + f.count + ' 字节：' + v.hex + (v.truncated ? '…' : '')
    return
  }
  if (Array.isArray(v)) {
    if (v.length && typeof v[0] === 'object' && v[0] && v[0].den !== undefined) {
      out.text = v.map((x) => ratioText(x)).join(' , ')
    } else {
      out.text = v.slice(0, 24).map((x) => num(x, 4)).join(', ') + (v.length > 24 ? '…（共 ' + v.length + ' 个值）' : '')
    }
    return
  }
  if (v && typeof v === 'object' && v.den !== undefined) {
    out.text = ratioText(v)
    return
  }
  out.text = num(v, 4)
}

/* =====================================================================
 * 七、JPEG 段扫描
 * ===================================================================== */

/**
 * 扫描 JPEG 段（SOI / APPn / DQT / DHT / SOF0-3 / SOS / EOI），
 * 从 APP1 + 'Exif\0\0' 里取 TIFF 块并解析。异常抛中文 Error。
 */
export function parseJpeg(bytes) {
  const b = toBytes(bytes)
  if (b.length < 4) throw new Error('字节太少（' + b.length + ' 字节），不是一张 JPEG')
  if (b[0] !== 0xff || b[1] !== 0xd8) {
    throw new Error('不是 JPEG：文件开头没有 SOI 标记 FF D8，而是 ' + hexBytes(b.subarray(0, 2), ' '))
  }

  const segments = [{ marker: 'FFD8', name: MARKER_CN[0xd8], size: 0 }]
  const warnings = []
  let fields = []
  let thumbnail = null
  let hasExif = false
  let sawSos = false
  let byteOrder = ''
  let exifBytes = 0
  let width = 0
  let height = 0
  let precision = 0
  let components = 0

  let pos = 2
  let guard = 0
  let inScan = false
  while (pos < b.length) {
    if (++guard > MAX_SEGMENTS * 2) {
      warnings.push('段/标记数量超过 ' + MAX_SEGMENTS + '，已停止扫描')
      break
    }
    if (inScan) {
      // SOS 之后是熵编码数据：只有 FF00 / FFFF 填充是合法的，
      // 遇到 FF + 非 0 就是下一个段标记（渐进 JPEG 会有 DHT / RSTn，最后才是 EOI）
      let i = pos
      while (i + 1 < b.length && !(b[i] === 0xff && b[i + 1] !== 0x00 && b[i + 1] !== 0xff)) i++
      if (i + 1 >= b.length) {
        warnings.push('一路找到文件尾都没有下一个段标记，图像数据可能被截断')
        break
      }
      pos = i
      inScan = false
      continue
    }
    if (b[pos] !== 0xff) {
      throw new Error('JPEG 段结构异常：偏移 ' + pos + ' 处应为 FF 段标记，实际是 ' + hexBytes(b.subarray(pos, pos + 1)) + '，文件可能被改坏或已截断')
    }
    let p = pos
    while (p < b.length && b[p] === 0xff) p++
    if (p >= b.length) {
      warnings.push('文件末尾是一串 FF，没有真正的段标记，按截断处理')
      break
    }
    const marker = b[p]
    p++
    if (marker === 0xd9) {
      segments.push({ marker: 'FFD9', name: MARKER_CN[0xd9], size: 0 })
      break
    }
    if (isStandalone(marker)) {
      if (marker !== 0xd8) segments.push({ marker: 'FF' + ('0' + marker.toString(16).toUpperCase()).slice(-2), name: MARKER_CN[marker] || '未知段', size: 0 })
      // RSTn 后面还是熵编码数据，得重新回到扫描态
      inScan = sawSos && marker >= 0xd0 && marker <= 0xd7
      pos = p
      continue
    }
    if (p + 1 >= b.length) throw new Error('JPEG 在偏移 ' + (p - 1) + ' 处被截断：连段长度字段都不完整')
    const segLen = (b[p] << 8) | b[p + 1]
    if (segLen < 2) throw new Error('段长度非法：' + hexBytes(b.subarray(p - 1, p + 1)) + ' 声明长度 ' + segLen)
    const payload = segLen - 2
    if (p + 2 + payload > b.length) {
      throw new Error('JPEG 段长度撒谎：偏移 ' + p + ' 处的段声明 ' + payload + ' 字节数据，但文件只剩 ' + (b.length - p - 2) + ' 字节')
    }
    segments.push({
      marker: 'FF' + ('0' + marker.toString(16).toUpperCase()).slice(-2),
      name: MARKER_CN[marker] || '未知段 0x' + marker.toString(16).toUpperCase(),
      size: payload,
      offset: p + 2,
    })

    if (marker >= 0xc0 && marker <= 0xc3) {
      if (payload < 6) throw new Error('SOF 段太短，读不出宽高')
      precision = b[p + 2]
      height = (b[p + 3] << 8) | b[p + 4]
      width = (b[p + 5] << 8) | b[p + 6]
      components = b[p + 7]
    }
    if (marker === 0xe1 && payload >= 6) {
      const isExif = b[p + 2] === 0x45 && b[p + 3] === 0x78 && b[p + 4] === 0x69 && b[p + 5] === 0x66 && b[p + 6] === 0x00 && b[p + 7] === 0x00
      if (isExif) {
        hasExif = true
        byteOrder = (b[p + 8] === 0x49 ? '小端 II' : b[p + 8] === 0x4d ? '大端 MM' : '')
        const tiff = parseTiff(b, p + 8, p + 2 + payload)
        fields = fields.concat(tiff.fields)
        warnings.push.apply(warnings, tiff.warnings)
        byteOrder = tiff.byteOrder
        exifBytes = payload - 6
        if (tiff.thumbnail) thumbnail = tiff.thumbnail
      } else if (b[p + 2] === 0x78 && b[p + 3] === 0x6d && b[p + 4] === 0x70 && b[p + 5] === 0x00) {
        warnings.push('APP1 里是 XMP 而不是 Exif，本工具不解析 XMP')
      }
    }
    if (marker === 0xda) {
      // 熵编码数据开始：跳过后才能看见 DHT / RSTn / EOI
      sawSos = true
      inScan = true
      pos = p + 2 + payload
      continue
    }
    pos = p + 2 + payload
    if (sawSos) inScan = true // 渐进 JPEG 在 SOS 之后还会插 DHT / DAC
  }

  const res = {
    format: 'JPEG',
    supported: true,
    size: b.length,
    segments,
    width,
    height,
    precision,
    components,
    hasExif,
    sawSos,
    byteOrder,
    exifBytes,
    fields,
    warnings,
    thumbnail,
  }
  buildSummary(res)
  return res
}

/* =====================================================================
 * 八、PNG 最小解析（单独一段，结论要单独标注，别和相机 EXIF 混谈）
 * ===================================================================== */

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const PNG_TEXT_CHUNKS = { tEXt: 1, iTXt: 1, zTXt: 1, eXIf: 1 }
const PNG_COLOR_TYPE = { 0: '灰度', 2: 'RGB', 3: '调色板', 4: '灰度+透明', 6: 'RGBA' }

/** PNG：只读 IHDR / pHYs / tEXt / iTXt / zTXt / eXIf，够看清「这张图带了什么文字」 */
export function parsePng(bytes) {
  const b = toBytes(bytes)
  if (b.length < 8) throw new Error('字节太少，不是一张 PNG')
  for (let i = 0; i < 8; i++) {
    if (b[i] !== PNG_SIG[i]) throw new Error('不是 PNG：签名不匹配（前 8 字节应为 89 50 4E 47 0D 0A 1A 0A）')
  }
  const rows = []
  const warnings = []
  let thumbnail = null
  let hasExif = false
  let width = 0
  let height = 0
  let depth = 0
  let colorType = 0
  let pos = 8
  let guard = 0

  while (pos + 8 <= b.length) {
    if (++guard > 2000) {
      warnings.push('PNG 块数量异常（>2000），已停止扫描')
      break
    }
    const len = ((b[pos] << 24) | (b[pos + 1] << 16) | (b[pos + 2] << 8) | b[pos + 3]) >>> 0
    const type = String.fromCharCode(b[pos + 4], b[pos + 5], b[pos + 6], b[pos + 7])
    const dataAt = pos + 8
    if (len > b.length - dataAt) {
      throw new Error('PNG 块 ' + type + ' 声明 ' + len + ' 字节，但文件只剩 ' + (b.length - dataAt) + ' 字节')
    }
    const data = b.subarray(dataAt, dataAt + len)
    if (type === 'IHDR' && len >= 13) {
      width = ((data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3]) >>> 0
      height = ((data[4] << 24) | (data[5] << 16) | (data[6] << 8) | data[7]) >>> 0
      depth = data[8]
      colorType = data[9]
    } else if (type === 'pHYs' && len >= 9) {
      const xu = ((data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3]) >>> 0
      const yu = ((data[4] << 24) | (data[5] << 16) | (data[6] << 8) | data[7]) >>> 0
      rows.push(preRow('PNG', 'pHYs', 'LONG', xu + ' × ' + yu + ' px/' + (data[8] === 1 ? '米（约 ' + Math.round(xu * 0.0254) + ' DPI）' : '无单位'), '物理像素密度'))
    } else if (PNG_TEXT_CHUNKS[type]) {
      if (type === 'eXIf') {
        try {
          const t = parseTiff(b, dataAt, dataAt + len)
          rows.push.apply(rows, t.fields)
          warnings.push.apply(warnings, t.warnings)
          hasExif = true
          if (t.thumbnail) thumbnail = t.thumbnail
          rows.push(preRow('PNG', 'eXIf', 'UNDEFINED', 'PNG 的 eXIf 块里确实有 TIFF/EXIF，已按同一套解析器读出 ' + t.fields.length + ' 条', 'PNG 携带 EXIF 较少见'))
        } catch (e) {
          warnings.push('eXIf 块解析失败：' + e.message)
        }
      } else {
        const kv = pngText(data, type)
        rows.push(preRow('PNG', type, 'TEXT', (kv.keyword ? kv.keyword + ' = ' : '') + kv.text, 'PNG 文本块，不是相机 EXIF'))
      }
    }
    if (type === 'IEND') break
    pos = dataAt + len + 4 // 跳过数据与 CRC
  }

  const res = {
    format: 'PNG',
    supported: true,
    size: b.length,
    width,
    height,
    hasExif,
    fields: rows,
    warnings,
    thumbnail,
    pngNote: 'PNG 一般不写相机 EXIF。这里的 tEXt / iTXt 是软件写入的文本块（标题、授权、生成工具等），canvas 重绘同样会丢掉；只有 eXIf 块才是标准 EXIF。',
    pngInfo: {
      bitDepth: depth,
      colorType: PNG_COLOR_TYPE[colorType] || '类型 ' + colorType,
      alpha: colorType === 4 || colorType === 6,
    },
  }
  buildSummary(res)
  return res
}

function preRow(group, tag, type, text, note) {
  return { pre: true, group, tag, type, text, note, known: true }
}

/** tEXt: keyword\0 text；iTXt: keyword\0 flag method lang\0 translated\0 text */
function pngText(data, type) {
  let i = 0
  let keyword = ''
  while (i < data.length && data[i] !== 0) {
    keyword += String.fromCharCode(data[i])
    i++
  }
  let text = ''
  if (type === 'iTXt') {
    let j = i + 3 // 跳过 compressionFlag + compressionMethod
    for (let k = 0; k < 2; k++) {
      while (j < data.length && data[j] !== 0) j++
      j++
    }
    text = utf8ish(data.subarray(j))
  } else {
    text = textOf(data.subarray(i + 1))
  }
  return { keyword: printable(keyword, 60), text: printable(text, 200) }
}

/* =====================================================================
 * 九、汇总：分组行、概览、方向、GPS 与隐私提示
 * ===================================================================== */

function fieldOf(fields, group, tag) {
  for (let i = 0; i < fields.length; i++) {
    if (fields[i].group === group && fields[i].tag === tag) return fields[i]
  }
  return null
}
function valueOf(fields, groups, tag) {
  for (const g of groups) {
    const f = fieldOf(fields, g, tag)
    if (f) return f.value
  }
  return null
}
function strOf(fields, groups, tag) {
  const v = valueOf(fields, groups, tag)
  if (typeof v === 'string') return v.trim()
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0].trim()
  return ''
}
function numOf(fields, groups, tag) {
  return toNumber(valueOf(fields, groups, tag))
}

/** 给解析结果补上分组行、概览字段、方向、GPS 与隐私提示 */
function buildSummary(res) {
  const raw = res.fields
  const ctx = {
    gpsRef(tag) {
      const v = valueOf(raw, ['GPS'], tag)
      if (typeof v === 'string') return v.trim()
      if (typeof v === 'number') return String.fromCharCode(v)
      return ''
    },
  }
  const described = raw.map((f) => describeField(f, ctx))
  res.rows = described

  const buckets = [
    { id: 'IFD0', title: '基础与设备' },
    { id: 'Exif', title: '拍摄参数' },
    { id: 'GPS', title: '位置信息（隐私）' },
    { id: 'Interop', title: '互操作' },
    { id: 'IFD1', title: '缩略图 IFD' },
    { id: 'PNG', title: 'PNG 文本块' },
  ]
  const isPointer = (r) => POINTER_TAGS.has(typeof r.tag === 'number' ? r.tag : parseInt(String(r.tag).replace(/^0x/i, ''), 16))
  res.groups = []
  for (const bk of buckets) {
    const items = described.filter((r) => r.group === bk.id && r.known && !isPointer(r))
    if (items.length) res.groups.push({ id: bk.id, title: bk.title, items })
  }
  const others = described.filter((r) => !r.known || isPointer(r))
  if (others.length) {
    others.forEach((r) => {
      if (isPointer(r)) r.note = '子 IFD 指针，内容已展开到对应分组'
    })
    res.groups.push({ id: 'other', title: '未收录标签（原样给出 tag 号）', items: others })
  }

  const G_IFD = ['IFD0', 'IFD1']
  const G_EXIF = ['Exif']
  const rowText = (groups, tag) => {
    for (const g of groups) {
      const f = fieldOf(raw, g, tag)
      if (!f) continue
      const d = described[raw.indexOf(f)]
      if (d && d.text && d.text !== '—') return d.text
    }
    return ''
  }
  const summary = {
    make: strOf(raw, G_IFD, 0x010f),
    model: strOf(raw, G_IFD, 0x0110),
    software: strOf(raw, G_IFD, 0x0131),
    lens: strOf(raw, G_EXIF, 0xa434) || strOf(raw, G_EXIF, 0xa217),
    dateTime: prettyDateTime(strOf(raw, G_IFD, 0x0132)),
    dateTimeOriginal: prettyDateTime(strOf(raw, G_EXIF, 0x9003)),
    exposure: numOf(raw, G_EXIF, 0x829a),
    exposureText: rowText(G_EXIF, 0x829a),
    fNumber: numOf(raw, G_EXIF, 0x829d),
    iso: toNumbers(valueOf(raw, G_EXIF, 0x8827))[0],
    focal: numOf(raw, G_EXIF, 0x920a),
    focal35: numOf(raw, G_EXIF, 0xa405),
    metering: rowText(G_EXIF, 0x9207),
    program: rowText(G_EXIF, 0x8822),
    wb: rowText(G_EXIF, 0xa403),
    flash: rowText(G_EXIF, 0x9209),
    bias: numOf(raw, G_EXIF, 0x9204),
    colorSpace: rowText(G_EXIF, 0xa001) || rowText(G_IFD, 0xa001),
    copyright: strOf(raw, G_IFD, 0x8298),
    serial: strOf(raw, G_EXIF, 0xa430) || strOf(raw, G_EXIF, 0xa435) || strOf(raw, G_EXIF, 0xa420),
    orientation: null,
    width: 0,
    height: 0,
    pixels: '',
    shot: '',
  }
  const ov = numOf(raw, G_IFD, 0x0112)
  if (ov !== null) {
    const o = ORIENTATIONS[ov] || { cn: '未定义方向值', rotate: null, flip: '', hint: '含义未知，别乱转' }
    summary.orientation = { value: ov, cn: o.cn, rotate: o.rotate, flip: o.flip, hint: o.hint, text: orientText(ov) }
  }
  const w = res.width || numOf(raw, G_IFD, 0x0100) || numOf(raw, G_EXIF, 0xa002) || 0
  const h = res.height || numOf(raw, G_IFD, 0x0101) || numOf(raw, G_EXIF, 0xa003) || 0
  summary.width = w
  summary.height = h
  summary.pixels = w && h ? w + ' × ' + h : '—'
  const bits = strOf(raw, G_IFD, 0x0102)
  summary.shot =
    [summary.exposureText || (summary.exposure !== null ? num(summary.exposure, 4) + ' 秒' : ''), summary.fNumber !== null ? 'f/' + num(summary.fNumber, 2) : '', summary.iso ? 'ISO ' + summary.iso : '', summary.focal !== null ? num(summary.focal, 1) + ' mm' : ''].filter(Boolean).join(' · ')

  // GPS：度分秒 → 十进制
  const latF = fieldOf(raw, 'GPS', 0x0002)
  const lonF = fieldOf(raw, 'GPS', 0x0004)
  const latRef = ctx.gpsRef(0x0001)
  const lngRef = ctx.gpsRef(0x0003)
  if (latF || lonF) {
    const lat = latF ? dmsToDecimal(Array.isArray(latF.value) ? latF.value : [latF.value], latRef) : null
    const lng = lonF ? dmsToDecimal(Array.isArray(lonF.value) ? lonF.value : [lonF.value], lngRef) : null
    res.gps = {
      lat,
      lng,
      latRef: latRef || '?',
      lngRef: lngRef || '?',
      alt: numOf(raw, ['GPS'], 0x0006),
      date: strOf(raw, ['GPS'], 0x001d),
      time: rowText(['GPS'], 0x0007),
      direction: rowText(['GPS'], 0x0011),
      decimal: lat !== null && lng !== null ? lat.toFixed(6) + ', ' + lng.toFixed(6) : '',
      dms: rowText(['GPS'], 0x0002) + ' / ' + rowText(['GPS'], 0x0004),
    }
  } else {
    res.gps = null
  }

  const notices = []
  if (res.gps && res.gps.lat !== null && res.gps.lng !== null) {
    notices.push({ level: 'warn', text: '含 GPS 经纬度 ' + res.gps.decimal + '，6 位小数≈几米精度，转出去等于报位置' })
  }
  if (summary.dateTimeOriginal || summary.dateTime) {
    notices.push({ level: 'warn', text: '含精确到秒的拍摄时间 ' + (summary.dateTimeOriginal || summary.dateTime) + '，配合光线角度能反推大致地点' })
  }
  if (summary.serial) notices.push({ level: 'warn', text: '含机身/镜头序列号或图片 ID，可把多张照片关联到同一台设备' })
  if (notices.length === 0 && res.hasExif) {
    notices.push({ level: 'info', text: '没看到 GPS 与序列号，但拍摄参数仍会暴露机型与拍摄习惯' })
  }
  if (res.hasExif && res.thumbnail) notices.push({ level: 'info', text: '内嵌缩略图也是元数据的一部分，重绘后同样不会保留' })
  res.notices = notices
  res.summary = summary
  res.fieldCount = raw.length
  res.hasThumbnail = !!res.thumbnail
  res.bitsInfo = bits
  return res
}

/** 「复制全部字段」用的纯文本 */
export function fieldsToText(res) {
  if (!res) return ''
  const L = ['随身匣 · 图片元数据']
  L.push('格式 ' + res.format + (res.size ? '（' + res.size + ' 字节）' : ''))
  if (res.width && res.height) L.push('编码尺寸 ' + res.width + ' × ' + res.height)
  if (res.byteOrder) L.push('TIFF 字节序 ' + res.byteOrder)
  if (res.segments && res.segments.length) L.push('JPEG 段 ' + res.segments.length + ' 个')
  L.push('字段 ' + (res.fieldCount || 0) + ' 条')
  L.push('')
  for (const g of res.groups || []) {
    L.push('【' + g.title + '】')
    for (const it of g.items) {
      L.push(it.name + ' = ' + it.text + (it.known ? '' : '（' + it.tag + ' 未收录）'))
    }
    L.push('')
  }
  if (res.gps && res.gps.decimal) {
    L.push('【GPS 十进制坐标】')
    L.push(res.gps.decimal)
    L.push('')
  }
  if (res.notices && res.notices.length) {
    L.push('【隐私提示】')
    res.notices.forEach((n) => L.push('- ' + n.text))
    L.push('')
  }
  if (res.warnings && res.warnings.length) {
    L.push('【解析告警】')
    res.warnings.forEach((w) => L.push('- ' + w))
  }
  return L.join('\n').replace(/\n+$/, '')
}

/* =====================================================================
 * 十、入口：按文件头分派
 * ===================================================================== */

function unsupported(name, message, size) {
  return {
    format: name,
    supported: false,
    message,
    size: size || 0,
    hasExif: false,
    fields: [],
    rows: [],
    groups: [],
    warnings: [message],
    notices: [],
    summary: {},
    thumbnail: null,
    hasThumbnail: false,
    gps: null,
    fieldCount: 0,
    segments: [],
    width: 0,
    height: 0,
  }
}

/** 嗅探格式并解析（视图只调这一个） */
export function parseImageMeta(bytes) {
  const b = toBytes(bytes)
  if (!b.length) throw new Error('读到的字节是空的，可能选图被取消或没有文件权限')
  if (b.length > MAX_IMAGE_BYTES) {
    throw new Error('文件 ' + (b.length / 1048576).toFixed(1) + ' MB 太大，只处理 ' + Math.round(MAX_IMAGE_BYTES / 1048576) + ' MB 以内的图片')
  }
  if (b[0] === 0xff && b[1] === 0xd8) return parseJpeg(b)
  if (b[0] === 0x89 && b[1] === 0x50) return parsePng(b)
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    return unsupported('GIF', '暂不支持 GIF：它的注释块与调色板不属于 EXIF 体系。canvas 重绘仍会丢掉大部分 GIF 私有数据。', b.length)
  }
  if (ascii4(b, 0) === 'RIFF' && ascii4(b, 8) === 'WEBP') {
    return unsupported('WebP', '暂不支持 WebP：WebP 的 EXIF 放在 RIFF 的 EXIF 分块里，本次未实现该解析，只保证不报错。', b.length)
  }
  if (ascii4(b, 4) === 'ftyp' || (b[2] === 0x68 && b[3] === 0x65)) {
    return unsupported('HEIC / MP4', '暂不支持 HEIC 这类 ISO-BMFF 容器。可先在系统相册里另存为 JPEG，再回来读取。', b.length)
  }
  throw new Error('认不出图片格式：文件头是 ' + hexBytes(b.subarray(0, 4), ' ') + '，这里只支持 JPEG（完整 EXIF）与 PNG（文本块）')
}

function ascii4(b, i) {
  return String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3])
}

/* =====================================================================
 * 十一、把本地图片读成字节（H5 与 App 两条路）
 * ===================================================================== */

/** 只允许本机路径：blob: / file: / data: / 绝对或 _doc 相对路径 */
function localPathOk(path) {
  const s = String(path)
  if (/^(blob:|file:|content:|data:)/i.test(s)) return true
  if (/^https?:\/\//i.test(s)) return false // 明确拒绝远程地址，保证不联网
  return /^[/_~.]/.test(s) || s.indexOf('/') === 0
}

/**
 * 读取用户选中图片的原始字节。
 * 这条路径读的是本机相册导出的临时文件（File 对象 / blob: URL / _doc 路径），
 * 不是网络请求：既不外发数据，也不依赖任何后端，符合项目「全程离线」约束。
 */
export async function readImageBytes(chosen) {
  const file = chosen && chosen.file
  const path = chosen && chosen.path
  if (file && typeof FileReader !== 'undefined') {
    const buf = await new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result)
      r.onerror = () => reject(new Error('读取本地文件失败'))
      try {
        r.readAsArrayBuffer(file)
      } catch (e) {
        reject(new Error('这个文件读不了：' + (e && e.message ? e.message : '类型不支持')))
      }
    })
    if (!buf || !buf.byteLength) throw new Error('读到的字节是空的')
    return toBytes(buf)
  }
  if (!path) throw new Error('没有拿到图片路径或文件对象')
  if (!localPathOk(path)) throw new Error('出于离线原则，只读取本机文件的字节，不访问远程地址')
  if (typeof fetch !== 'undefined') {
    let res
    try {
      res = await fetch(String(path))
    } catch (e) {
      throw new Error('读不到这张图的字节：本地路径打不开（' + (e && e.message ? e.message : '未知原因') + '）')
    }
    if (!res.ok) throw new Error('读本地文件失败：HTTP ' + res.status)
    const buf = await res.arrayBuffer()
    if (!buf || !buf.byteLength) throw new Error('读到的字节是空的')
    return toBytes(buf)
  }
  // #ifdef APP-PLUS
  if (typeof plus !== 'undefined' && plus.io) {
    return await new Promise((resolve, reject) => {
      plus.io.resolveLocalFileSystemURL(
        String(path),
        (entry) => {
          entry.file(
            (f) => {
              const r = new plus.io.FileReader()
              r.onloadend = (e) => {
                const buf = e && e.target ? e.target.result : null
                if (buf && buf.byteLength) resolve(toBytes(buf))
                else reject(new Error('读到的字节是空的'))
              }
              r.onerror = () => reject(new Error('App 端读取图片字节失败'))
              try {
                r.readAsArrayBuffer(f)
              } catch (e) {
                reject(new Error('App 端不支持这种读取方式'))
              }
            },
            () => reject(new Error('打不开图片文件'))
          )
        },
        () => reject(new Error('图片路径无法访问'))
      )
    })
  }
  // #endif
  throw new Error('当前环境读不到图片字节，换一张普通 JPEG/PNG 再试')
}
