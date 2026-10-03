/**
 * 开发速查表：HTTP 状态码 / MIME 类型 / 常用端口 / HTTP 方法 / Git 常用命令
 */

export const HTTP_STATUS = [
  { code: 100, name: 'Continue', group: '1xx 信息', note: '已收到请求头，客户端可以继续发送请求体' },
  { code: 101, name: 'Switching Protocols', group: '1xx 信息', note: '服务器同意切换协议，例如升级到 WebSocket' },
  { code: 200, name: 'OK', group: '2xx 成功', note: '最标准的成功响应' },
  { code: 201, name: 'Created', group: '2xx 成功', note: '资源创建成功，通常在 POST 后返回，并带 Location 头' },
  { code: 202, name: 'Accepted', group: '2xx 成功', note: '已接受但还没处理完，用于异步任务' },
  { code: 204, name: 'No Content', group: '2xx 成功', note: '成功但没有响应体，常用于 DELETE 和 PUT' },
  { code: 206, name: 'Partial Content', group: '2xx 成功', note: '断点续传、分片下载' },
  { code: 301, name: 'Moved Permanently', group: '3xx 重定向', note: '永久跳转，搜索引擎会更新索引，浏览器会缓存' },
  { code: 302, name: 'Found', group: '3xx 重定向', note: '临时跳转。历史上实现不规范，很多客户端会把 POST 变成 GET' },
  { code: 303, name: 'See Other', group: '3xx 重定向', note: '明确要求用 GET 去取另一个地址，PRG 模式常用' },
  { code: 304, name: 'Not Modified', group: '3xx 重定向', note: '内容没变，用本地缓存。配合 ETag / If-None-Match' },
  { code: 307, name: 'Temporary Redirect', group: '3xx 重定向', note: '临时跳转，且严格保持原方法（POST 还是 POST）' },
  { code: 308, name: 'Permanent Redirect', group: '3xx 重定向', note: '永久跳转且保持原方法' },
  { code: 400, name: 'Bad Request', group: '4xx 客户端错误', note: '请求本身有问题：参数格式错、JSON 解析失败等' },
  { code: 401, name: 'Unauthorized', group: '4xx 客户端错误', note: '未认证。名字有误导性，其实是「没登录」' },
  { code: 403, name: 'Forbidden', group: '4xx 客户端错误', note: '已认证但没权限。和 401 的区别：401 是不知道你是谁，403 是知道但不许' },
  { code: 404, name: 'Not Found', group: '4xx 客户端错误', note: '资源不存在。也常被用来隐藏「存在但无权限」' },
  { code: 405, name: 'Method Not Allowed', group: '4xx 客户端错误', note: '路径存在但不支持这个方法，响应要带 Allow 头' },
  { code: 406, name: 'Not Acceptable', group: '4xx 客户端错误', note: '服务端无法提供 Accept 里要求的格式' },
  { code: 408, name: 'Request Timeout', group: '4xx 客户端错误', note: '客户端迟迟没把请求发完' },
  { code: 409, name: 'Conflict', group: '4xx 客户端错误', note: '状态冲突，例如并发更新、唯一键重复' },
  { code: 410, name: 'Gone', group: '4xx 客户端错误', note: '资源曾经存在，现在永久删除了' },
  { code: 413, name: 'Content Too Large', group: '4xx 客户端错误', note: '请求体过大，通常是上传超限（RFC 9110 现名，旧规范 RFC 7231 里叫 Payload Too Large）' },
  { code: 415, name: 'Unsupported Media Type', group: '4xx 客户端错误', note: 'Content-Type 不是服务端认识的格式' },
  { code: 418, name: "I'm a teapot", group: '4xx 客户端错误', note: '愚人节玩笑（HTCPCP 协议），有些框架真的实现了' },
  { code: 422, name: 'Unprocessable Entity', group: '4xx 客户端错误', note: '格式对但字段校验不通过，表单报错常用' },
  { code: 429, name: 'Too Many Requests', group: '4xx 客户端错误', note: '触发限流，响应里通常会带 Retry-After' },
  { code: 500, name: 'Internal Server Error', group: '5xx 服务端错误', note: '服务端代码抛异常了，是最笼统的服务端错误' },
  { code: 501, name: 'Not Implemented', group: '5xx 服务端错误', note: '服务端不支持这个功能' },
  { code: 502, name: 'Bad Gateway', group: '5xx 服务端错误', note: '网关拿到了上游的无效响应。Nginx 报这个通常是后端挂了' },
  { code: 503, name: 'Service Unavailable', group: '5xx 服务端错误', note: '服务暂时不可用：过载、维护中' },
  { code: 504, name: 'Gateway Timeout', group: '5xx 服务端错误', note: '网关等上游超时。后端处理太久或卡死了' },
]

export const HTTP_METHODS = [
  { name: 'GET', safe: true, idempotent: true, note: '读取资源。不应有副作用，可被缓存' },
  { name: 'HEAD', safe: true, idempotent: true, note: '和 GET 一样但只返回响应头，用于探测资源是否存在' },
  { name: 'POST', safe: false, idempotent: false, note: '创建资源或提交数据，重复调用会重复创建' },
  { name: 'PUT', safe: false, idempotent: true, note: '整体替换资源，重复调用结果一致' },
  { name: 'PATCH', safe: false, idempotent: false, note: '局部更新，只改传了的字段' },
  { name: 'DELETE', safe: false, idempotent: true, note: '删除资源，重复删第二次也是「删掉了」' },
  { name: 'OPTIONS', safe: true, idempotent: true, note: '查询支持的通信选项，CORS 预检请求用它' },
  { name: 'TRACE', safe: true, idempotent: true, note: '回显请求，用于调试。出于安全考虑一般禁用' },
  { name: 'CONNECT', safe: false, idempotent: false, note: '建立隧道，HTTPS 代理使用' },
]

export const MIME_TYPES = [
  { ext: '.json', mime: 'application/json', note: 'JSON 数据，现代 API 默认' },
  { ext: '.xml', mime: 'application/xml', note: 'XML，注意 charset 一般写 utf-8' },
  { ext: '.html', mime: 'text/html', note: '网页' },
  { ext: '.css', mime: 'text/css', note: '样式表' },
  { ext: '.js', mime: 'text/javascript', note: '脚本，旧写法是 application/javascript' },
  { ext: '.mjs', mime: 'text/javascript', note: 'ES 模块' },
  { ext: '.txt', mime: 'text/plain', note: '纯文本' },
  { ext: '.csv', mime: 'text/csv', note: '逗号分隔数据' },
  { ext: '.md', mime: 'text/markdown', note: 'Markdown，早期也用过 text/x-markdown' },
  { ext: '.png', mime: 'image/png', note: 'PNG，支持透明' },
  { ext: '.jpg', mime: 'image/jpeg', note: 'JPEG，有损压缩照片' },
  { ext: '.gif', mime: 'image/gif', note: 'GIF，支持动图' },
  { ext: '.webp', mime: 'image/webp', note: 'WebP，比 JPEG 小 25% 左右' },
  { ext: '.svg', mime: 'image/svg+xml', note: '矢量图，本质是 XML' },
  { ext: '.ico', mime: 'image/x-icon', note: '网站图标' },
  { ext: '.mp3', mime: 'audio/mpeg', note: 'MP3 音频' },
  { ext: '.wav', mime: 'audio/wav', note: '无损音频，体积大' },
  { ext: '.mp4', mime: 'video/mp4', note: 'MP4 视频，兼容性最好' },
  { ext: '.webm', mime: 'video/webm', note: 'WebM 视频' },
  { ext: '.pdf', mime: 'application/pdf', note: 'PDF 文档' },
  { ext: '.zip', mime: 'application/zip', note: 'ZIP 压缩包' },
  { ext: '.gz', mime: 'application/gzip', note: 'gzip 压缩' },
  { ext: '.tar', mime: 'application/x-tar', note: 'tar 归档' },
  { ext: '.woff2', mime: 'font/woff2', note: 'Web 字体，压缩率高，首选' },
  { ext: '.woff', mime: 'font/woff', note: 'Web 字体' },
  { ext: '.ttf', mime: 'font/ttf', note: 'TrueType 字体' },
  { ext: '.apk', mime: 'application/vnd.android.package-archive', note: '安卓安装包' },
  { ext: '.wasm', mime: 'application/wasm', note: 'WebAssembly 模块' },
  { ext: '.form', mime: 'application/x-www-form-urlencoded', note: '表单提交（注意这是 Content-Type 不是文件类型）' },
  { ext: '（上传文件）', mime: 'multipart/form-data', note: '带文件的表单，必须用它才能传二进制' },
]

export const COMMON_PORTS = [
  { port: 21, name: 'FTP', note: '文件传输，明文，已被 SFTP 取代' },
  { port: 22, name: 'SSH', note: '安全登录，同时也是 SFTP 和 git over ssh 的端口' },
  { port: 23, name: 'Telnet', note: '明文远程登录，不要用' },
  { port: 25, name: 'SMTP', note: '邮件发送' },
  { port: 53, name: 'DNS', note: '域名解析，UDP 为主也支持 TCP' },
  { port: 80, name: 'HTTP', note: '默认 Web 端口' },
  { port: 110, name: 'POP3', note: '邮件接收（会下载到本地）' },
  { port: 143, name: 'IMAP', note: '邮件接收（保留在服务端）' },
  { port: 443, name: 'HTTPS', note: '加密 Web' },
  { port: 465, name: 'SMTPS', note: '加密邮件发送' },
  { port: 587, name: 'SMTP 提交', note: '邮件客户端提交邮件用' },
  { port: 993, name: 'IMAPS', note: '加密 IMAP' },
  { port: 1080, name: 'SOCKS 代理', note: '常见的代理端口' },
  { port: 1433, name: 'SQL Server', note: '微软数据库' },
  { port: 1521, name: 'Oracle', note: 'Oracle 数据库监听' },
  { port: 2181, name: 'ZooKeeper', note: '分布式协调' },
  { port: 2379, name: 'etcd', note: 'Kubernetes 的键值存储' },
  { port: 3000, name: 'Node / 前端 dev', note: '各种脚手架默认端口' },
  { port: 3306, name: 'MySQL', note: '最常用的关系型数据库' },
  { port: 3389, name: 'RDP', note: 'Windows 远程桌面' },
  { port: 4200, name: 'Angular dev', note: 'Angular CLI 默认' },
  { port: 5000, name: 'Flask / 通用', note: 'Flask 默认，macOS 上被 AirPlay 占用' },
  { port: 5173, name: 'Vite dev', note: 'Vite 默认端口' },
  { port: 5432, name: 'PostgreSQL', note: '功能强大的开源关系库' },
  { port: 5601, name: 'Kibana', note: 'Elasticsearch 的可视化界面' },
  { port: 5672, name: 'RabbitMQ', note: '消息队列（AMQP）' },
  { port: 6379, name: 'Redis', note: '缓存与键值存储' },
  { port: 7001, name: 'WebLogic', note: 'Oracle 中间件' },
  { port: 8000, name: 'Django / 通用', note: 'Django 默认' },
  { port: 8080, name: 'HTTP 备用', note: 'Tomcat 等中间件默认' },
  { port: 8443, name: 'HTTPS 备用', note: 'Tomcat 的 HTTPS' },
  { port: 8888, name: 'Jupyter', note: 'Notebook 默认' },
  { port: 9000, name: 'PHP-FPM / MinIO', note: 'FastCGI 或对象存储' },
  { port: 9092, name: 'Kafka', note: '消息队列' },
  { port: 9200, name: 'Elasticsearch', note: '搜索与日志' },
  { port: 11211, name: 'Memcached', note: '内存缓存' },
  { port: 27017, name: 'MongoDB', note: '文档型数据库' },
]

export const GIT_COMMANDS = [
  { cmd: 'git status', note: '看当前分支、暂存区与工作区状态' },
  { cmd: 'git diff', note: '看未暂存的改动' },
  { cmd: 'git diff --staged', note: '看已暂存的改动' },
  { cmd: 'git log --oneline --graph --all', note: '图形化看提交历史' },
  { cmd: 'git add -p', note: '分块挑选要提交的内容，提交前清理用' },
  { cmd: 'git commit --amend', note: '改写最近一次提交（会改 hash，已推送的要谨慎）' },
  { cmd: 'git checkout -b <分支>', note: '新建并切换分支' },
  { cmd: 'git switch -c <分支>', note: '新写法，语义更清楚' },
  { cmd: 'git restore <文件>', note: '丢弃工作区改动（旧写法 git checkout --）' },
  { cmd: 'git restore --staged <文件>', note: '把文件移出暂存区但保留改动' },
  { cmd: 'git reset --soft HEAD~1', note: '撤销最后一次提交但保留改动在暂存区' },
  { cmd: 'git reset --hard HEAD~1', note: '⚠️ 撤销提交并丢弃改动，不可恢复' },
  { cmd: 'git revert <commit>', note: '生成一个反向提交来撤销，推送过的分支应该用这个' },
  { cmd: 'git stash -u', note: '临时收起改动（含未跟踪文件）' },
  { cmd: 'git stash pop', note: '把收起的改动放回来' },
  { cmd: 'git cherry-pick <commit>', note: '把某个提交摘到当前分支' },
  { cmd: 'git rebase -i HEAD~3', note: '交互式整理最近 3 个提交' },
  { cmd: 'git fetch --prune', note: '拉取远端并清掉已删除的远程分支引用' },
  { cmd: 'git remote -v', note: '看远程仓库地址' },
  { cmd: 'git reflog', note: '看 HEAD 的移动历史，误操作后的救命工具' },
  { cmd: 'git clean -fd', note: '⚠️ 删除所有未跟踪的文件与目录' },
  { cmd: 'git bisect start', note: '二分查找引入 bug 的那次提交' },
  { cmd: 'git blame <文件>', note: '看每行最后是谁改的' },
  { cmd: 'git log -S "<字符串>"', note: '找出引入或删除某段代码的提交' },
]

export const GROUPS = [
  { key: 'status', name: '状态码', list: HTTP_STATUS },
  { key: 'method', name: 'HTTP 方法', list: HTTP_METHODS },
  { key: 'mime', name: 'MIME 类型', list: MIME_TYPES },
  { key: 'port', name: '常用端口', list: COMMON_PORTS },
  { key: 'git', name: 'Git 命令', list: GIT_COMMANDS },
]

/** 在某一组里搜索（状态码支持按数字前缀匹配） */
export function searchRef(groupKey, kw) {
  const g = GROUPS.find((x) => x.key === groupKey)
  if (!g) return []
  const q = String(kw || '').trim().toLowerCase()
  if (!q) return g.list
  return g.list.filter((item) => {
    const hay = [item.code, item.name, item.note, item.ext, item.mime, item.port, item.cmd]
      .filter((x) => x !== undefined)
      .join(' ')
      .toLowerCase()
    return hay.indexOf(q) > -1
  })
}
