// POST /api/auth/reset
// 已登录用户改密: 需要旧密码 + 新密码
// 改完前端会清除 localStorage token, 强制用新密码重新登录
import { hashPassword, verifyPassword } from '../../_lib/crypto.js';
import { getAuthUser, readJson, json, err } from '../../_lib/db.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env) });
  const user = await getAuthUser(request, env);
  if (!user) return err('unauthorized', '未登录', 401, env);
  const body = await readJson(request);
  if (!body) return err('invalid_body', '请求体必须是 JSON', 400, env);
  const { oldPassword, newPassword } = body;
  if (!oldPassword || !newPassword) return err('missing_fields', '缺少 oldPassword 或 newPassword', 400, env);
  if (oldPassword === newPassword) return err('same_password', '新密码不能与旧密码相同', 400, env);

  const row = await env.DB.prepare('SELECT password_salt, password_hash FROM users WHERE id = ?').bind(user.id).first();
  if (!row) return err('user_not_found', '用户不存在', 404, env);

  const ok = await verifyPassword(oldPassword, row.password_salt, row.password_hash);
  if (!ok) return err('invalid_old_password', '旧密码错误', 401, env);

  const { isValidPassword, genSalt } = await import('../../_lib/crypto.js');
  if (!isValidPassword(newPassword)) return err('weak_password', '密码需 8-128 位, 含字母和数字', 400, env);

  const newSalt = genSalt();
  const newHash = await hashPassword(newPassword, newSalt);
  const now = Date.now();
  await env.DB.prepare('UPDATE users SET password_salt = ?, password_hash = ?, updated_at = ? WHERE id = ?').bind(newSalt, newHash, now, user.id).run();

  return json({ ok: true }, 200, env);
}

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}
