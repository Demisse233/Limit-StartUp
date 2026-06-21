// 密码哈希 + JWT 签发/校验 (Web Crypto API)
// Cloudflare Workers 不支持 bcrypt 原生 binding, 用 PBKDF2 替代 (内置, 无依赖)

const ITERATIONS = 100000;
const SALT_LEN = 16;
const KEY_LEN = 32;

// 字符串 -> Uint8Array
function strToBytes(str) {
  return new TextEncoder().encode(str);
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// 生成随机 salt (hex)
export function genSalt() {
  const salt = new Uint8Array(SALT_LEN);
  crypto.getRandomValues(salt);
  return bytesToHex(salt);
}

// 密码哈希: PBKDF2-SHA256
export async function hashPassword(password, saltHex) {
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map(h => parseInt(h, 16)));
  const key = await crypto.subtle.importKey(
    'raw', strToBytes(password), { name: 'PBKDF2' }, false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    key, KEY_LEN * 8
  );
  return bytesToHex(new Uint8Array(bits));
}

// 校验密码
export async function verifyPassword(password, saltHex, expectedHash) {
  const h = await hashPassword(password, saltHex);
  // 常量时间比较
  if (h.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  return diff === 0;
}

// JWT (HS256) - 纯 JS 实现
async function hmacSha256(key, data) {
  const k = await crypto.subtle.importKey(
    'raw', strToBytes(key),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', k, strToBytes(data));
  return bytesToBase64(new Uint8Array(sig)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64urlEncode(bytes) {
  return bytesToBase64(bytes).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return base64ToBytes(str);
}

// 读取 JWT 过期时间 (秒), 默认 7 天
function getJwtExpiresIn() {
  // 可被环境变量 JWT_EXPIRES_IN 覆盖, 例如 "7d" / "24h" / "3600"
  const v = (typeof globalThis !== 'undefined' && globalThis.__JWT_EXPIRES_IN__) || '7d';
  return parseDuration(v, 7 * 24 * 3600);
}
function parseDuration(v, fallbackSec) {
  if (typeof v === 'number' && v > 0) return v;
  if (typeof v !== 'string') return fallbackSec;
  const m = /^(\d+)([smhd]?)$/i.exec(v.trim());
  if (!m) return fallbackSec;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const mult = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
  return n * mult;
}

export async function signJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const exp = now + getJwtExpiresIn();
  const jti = genJti();
  const fullPayload = { iat: now, exp, jti, ...payload };
  const headerB64 = b64urlEncode(strToBytes(JSON.stringify(header)));
  const payloadB64 = b64urlEncode(strToBytes(JSON.stringify(fullPayload)));
  const sigInput = headerB64 + '.' + payloadB64;
  const sig = await hmacSha256(secret, sigInput);
  return sigInput + '.' + sig;
}

function genJti() {
  // 22 字符 URL-safe base64 (足够唯一)
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return b64urlEncode(bytes);
}

export async function verifyJwt(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sig] = parts;
  const expected = await hmacSha256(secret, headerB64 + '.' + payloadB64);
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64)));
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

// 邮箱规范化
export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

// 邮箱格式校验
export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// 密码强度 (8-128 位, 字母 + 数字)
export function isValidPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8 || pw.length > 128) return false;
  return /[a-zA-Z]/.test(pw) && /\d/.test(pw);
}

// 生成 UUID
export function genUuid() {
  // 现代 crypto.randomUUID (CF Workers 支持)
  return crypto.randomUUID();
}
