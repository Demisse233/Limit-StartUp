// Cloudflare Turnstile 验证 + KV 限流
// 部署时需要:
//   - 环境变量 TURNSTILE_SECRET (Cloudflare 后台设置)
//   - KV namespace binding "RL" (wrangler kv namespace create RL)
// 默认值 (本地开发) 为 Cloudflare 官方 test key, 永远通过

const TEST_SECRET = '1x0000000000000000000000000000000AA';

export async function verifyTurnstile(token, env, remoteIp) {
  const secret = env.TURNSTILE_SECRET || TEST_SECRET;
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set('remoteip', remoteIp);
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: body
    });
    const j = await r.json();
    return j.success === true;
  } catch (e) {
    console.warn('[turnstile] verify failed', e);
    return false;
  }
}

// KV 限流: 同 key 在 windowSec 秒内允许 max 次
export async function rateLimit(env, key, max, windowSec) {
  // 本地开发没 KV, 跳过
  if (!env.RL) return { ok: true, count: 0 };
  const k = 'rl:' + key;
  try {
    const cur = parseInt((await env.RL.get(k)) || '0', 10);
    if (cur >= max) return { ok: false, count: cur };
    await env.RL.put(k, String(cur + 1), { expirationTtl: windowSec });
    return { ok: true, count: cur + 1 };
  } catch (e) {
    console.warn('[ratelimit] failed', e);
    return { ok: true, count: 0 };
  }
}

export function getClientIp(request) {
  return request.headers.get('cf-connecting-ip') || '0.0.0.0';
}
