// GET  /api/avatar       - 取当前用户头像 (需登录)
// POST /api/avatar       - 上传头像 (需登录) - 前端必须先压缩到 256x256 base64
// DELETE /api/avatar     - 删头像 (需登录)
// 头像走 D1 base64 (方案 C, 不依赖 R2)
// 限制: avatar_b64 <= 200KB (压缩后通常 14-40KB, 远低于 1MB D1 单行限制)

import { getAuthUser, json, err } from '../../_lib/db.js';

const MAX_B64_LEN = 200 * 1024; // 200KB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export async function onRequestGet(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env) });

  // GET 鉴权: 优先 Authorization header, 备选 ?token=xxx (用于浏览器 <img> / background-image 加载)
  let user = await getAuthUser(request, env);
  if (!user) {
    const url = new URL(request.url);
    const qToken = url.searchParams.get('token');
    if (qToken) {
      const { verifyJwt } = await import('../../_lib/crypto.js');
      const payload = await verifyJwt(qToken, env.JWT_SECRET);
      if (payload && payload.sub) user = { id: payload.sub };
    }
  }
  if (!user) return err('unauthorized', '未登录', 401, env);

  const row = await env.DB.prepare('SELECT avatar_b64, avatar_content_type FROM users WHERE id = ?').bind(user.id).first();
  if (!row || !row.avatar_b64) return err('no_avatar', '未设置头像', 404, env);

  const bytes = base64ToBytes(row.avatar_b64);
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': row.avatar_content_type || 'image/jpeg',
      // 不缓存, URL 带 token, 防止 CDN 跨用户命中
      'Cache-Control': 'private, no-store, max-age=0'
    }
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env) });
  const user = await getAuthUser(request, env);
  if (!user) return err('unauthorized', '未登录', 401, env);

  let body;
  try { body = await request.json(); } catch (e) { return err('invalid_body', '需要 JSON', 400, env); }
  if (!body || !body.dataUrl) return err('invalid_body', '需要 dataUrl 字段', 400, env);

  const m = /^data:([a-zA-Z0-9/+\-.]+);base64,(.+)$/.exec(body.dataUrl);
  if (!m) return err('invalid_data_url', 'dataUrl 格式错误', 400, env);
  const contentType = m[1].toLowerCase();
  const b64 = m[2];
  if (!ALLOWED_TYPES.includes(contentType)) return err('invalid_type', '仅支持 PNG / JPEG / WebP', 415, env);
  if (b64.length > MAX_B64_LEN) return err('file_too_large', '头像过大, 请压缩到 200KB 以下', 413, env);

  await env.DB.prepare('UPDATE users SET avatar_b64 = ?, avatar_content_type = ?, avatar_size = ?, updated_at = ? WHERE id = ?')
    .bind(b64, contentType, Math.floor(b64.length * 3 / 4), Date.now(), user.id).run();

  return json({ ok: true, avatarUrl: '/api/avatar', size: Math.floor(b64.length * 3 / 4) }, 200, env);
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env) });
  const user = await getAuthUser(request, env);
  if (!user) return err('unauthorized', '未登录', 401, env);

  await env.DB.prepare('UPDATE users SET avatar_b64 = NULL, avatar_content_type = NULL, avatar_size = NULL, updated_at = ? WHERE id = ?')
    .bind(Date.now(), user.id).run();
  return json({ ok: true }, 200, env);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}
