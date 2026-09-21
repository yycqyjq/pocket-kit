/**
 * x509.js 自测：内置三个样例 + openssl 生成证书交叉对齐（序列号 / 指纹 / 有效期 / SAN）
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { useUtils, makeTest } from './harness.mjs'

const X = await useUtils('x509')
const T = makeTest('x509')

/* ---------- 内置样例：RSA 自签 ---------- */
const rsa = X.parseCertificate(X.SAMPLE_RSA_PEM)
T.eq('kind', rsa.kind, 'certificate')
T.eq('版本 v3', rsa.version, 3)
T.eq('主体 CN', rsa.subject.map.CN, 'example.test')
T.eq('自签（颁发者=主体）', rsa.selfSigned, true)
T.eq('是 CA', rsa.ca, true)
T.eq('SAN 存在', rsa.san.present, true)
T.ok('SAN DNS 两个', rsa.san.dns.indexOf('example.test') >= 0 && rsa.san.dns.indexOf('*.example.test') >= 0)
T.ok('SAN IP 127.0.0.1', rsa.san.ipv4.indexOf('127.0.0.1') >= 0)
T.eq('未过期', rsa.validity.status.key, 'valid')
T.ok('序列号是大写十六进制', /^[0-9A-F]+$/.test(rsa.serial.hex))
T.ok('sha256 指纹形状', /^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/.test(rsa.fingerprints.sha256))

/* ---------- 内置样例：EC 富扩展 ---------- */
const ec = X.parseCertificate(X.SAMPLE_EC_PEM)
T.eq('EC kind', ec.kind, 'certificate')
T.eq('P-256 位数', ec.publicKey.bits, 256)

/* ---------- 内置样例：已过期 ---------- */
const old = X.parseCertificate(X.SAMPLE_EXPIRED_PEM)
T.eq('过期状态', old.validity.status.key, 'expired')
T.ok('过期警告', old.warnings.join('\n').indexOf('已过期') >= 0)

/* ---------- 域名匹配（RFC 6125 实用子集） ---------- */
T.eq('SAN 全名命中', X.matchesHost(rsa, 'example.test').matched, true)
T.eq('大小写与根点归一', X.matchesHost(rsa, '  Example.Test. ').matched, true)
T.eq('通配命中一级子域', X.matchesHost(rsa, 'a.example.test').matched, true)
T.eq('通配不跨两段', X.matchesHost(rsa, 'a.b.example.test').matched, false)
T.eq('别的域名不命中', X.matchesHost(rsa, 'nope.test').matched, false)
T.eq('IP 字面命中', X.matchesHost(rsa, '127.0.0.1').matched, true)
T.eq('别的 IP 不命中', X.matchesHost(rsa, '127.0.0.2').matched, false)
T.throws('通配符输入被拒绝', () => X.matchesHost(rsa, '*.example.test'), /通配符/)
T.throws('带空格的输入被拒绝', () => X.matchesHost(rsa, 'a b.test'), /空格/)

/* ---------- parseAny 分发与报错 ---------- */
T.eq('parseAny 认出证书', X.parseAny(X.SAMPLE_RSA_PEM).pemLabel, 'CERTIFICATE')
T.throws('非 PEM 报错', () => X.parseAny('随便一段文字'), /不是 PEM/)
T.throws('空输入报错', () => X.parseAny('   '), /请先粘贴/)
T.throws('缺结束行报错', () => X.pemDecode('-----BEGIN CERTIFICATE-----\nAAAA\n'), /截断/)

/* ---------- openssl 生成证书交叉对齐 ---------- */
const dir = mkdtempSync(path.join(os.tmpdir(), 'pk-x509-'))
try {
  const certPath = path.join(dir, 'c.pem')
  execFileSync(
    'openssl',
    ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(dir, 'k.pem'), '-out', certPath,
     '-subj', '/CN=gen.pk.test/O=PocketKit Check', '-days', '365', '-sha256',
     '-addext', 'subjectAltName=DNS:gen.pk.test,DNS:*.gen.pk.test,IP:127.0.0.1'],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  )
  const pem = readFileSync(certPath, 'utf8')
  const cert = X.parseCertificate(pem)
  T.eq('生成证书 CN', cert.subject.map.CN, 'gen.pk.test')
  T.eq('生成证书 O', cert.subject.map.O, 'PocketKit Check')
  T.ok('生成 SAN DNS', cert.san.dns.indexOf('gen.pk.test') >= 0 && cert.san.dns.indexOf('*.gen.pk.test') >= 0)
  T.ok('生成 SAN IP', cert.san.ipv4.indexOf('127.0.0.1') >= 0)
  const osslSerial = execFileSync('openssl', ['x509', '-in', certPath, '-noout', '-serial']).toString().trim().replace('serial=', '').toUpperCase()
  T.eq('序列号与 openssl 一致', cert.serial.hex, osslSerial)
  const fp = execFileSync('openssl', ['x509', '-in', certPath, '-noout', '-fingerprint', '-sha256']).toString().trim().split('=')[1].toUpperCase()
  T.eq('sha256 指纹与 openssl 一致', cert.fingerprints.sha256.replace(/:/g, ''), fp.replace(/:/g, ''))
  const dates = execFileSync('openssl', ['x509', '-in', certPath, '-noout', '-startdate', '-enddate']).toString()
  const nb = dates.match(/notBefore=(.*)/)[1].trim()
  const na = dates.match(/notAfter=(.*)/)[1].trim()
  T.ok('notBefore 与 openssl 一致（±2 分钟）', Math.abs(cert.validity.notBefore.ms - Date.parse(nb)) < 120000)
  T.ok('notAfter 与 openssl 一致', Math.abs(cert.validity.notAfter.ms - Date.parse(na)) < 120000)
  T.eq('生成证书有效', cert.validity.status.key, 'valid')
  T.eq('SAN 命中生成域名', X.matchesHost(cert, 'gen.pk.test').matched, true)
  T.eq('通配命中子域', X.matchesHost(cert, 'a.gen.pk.test').matched, true)
} finally {
  rmSync(dir, { recursive: true, force: true })
}

T.done()
