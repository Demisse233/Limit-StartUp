// Public display data only. Credentials are Cloudflare secret bindings.
const CACHE_KEY = 'limitrss:afdian:sponsors:v1';
const RETRY_KEY = `${CACHE_KEY}:retry`;
const HOUR = 3600000;
let pending;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': status === 200 ? 'public, max-age=60' : 'no-store',
  }});
}

export function onRequestOptions() { return new Response(null, {status: 204, headers: {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS'}}); }

export function publicList(rows) {
  const users = new Map();
  for (const row of rows) {
    const user = row?.user;
    if (typeof user?.user_id !== 'string' || typeof user?.name !== 'string') continue;
    const id = user.user_id.trim();
    const name = user.name.trim().slice(0, 100);
    if (!id || !name) continue;
    let avatar = null;
    try {
      const url = new URL(user.avatar);
      if (url.protocol === 'https:' && (url.hostname === 'afdiancdn.com' || url.hostname.endsWith('.afdiancdn.com')) && !url.username && !url.password) avatar = url.href;
    } catch {}
    const time = Number(row.last_pay_time) || 0;
    if (!users.has(id) || users.get(id).time < time) users.set(id, { name, avatar, time });
  }
  return [...users.values()].sort((a, b) => b.time - a.time || a.name.localeCompare(b.name)).map(({name, avatar}) => ({name, avatar}));
}

export async function syncSponsors(env) {
  if (!env.AFDIAN_USER_ID || !env.AFDIAN_API_TOKEN) throw new Error('Sponsor credentials unavailable');
  const rows = [];
  let total = 1;
  for (let page = 1; page <= total; page++) {
    const params = JSON.stringify({page});
    const ts = Math.floor(Date.now() / 1000);
    const input = `${env.AFDIAN_API_TOKEN}params${params}ts${ts}user_id${env.AFDIAN_USER_ID}`;
    const digest = await crypto.subtle.digest('MD5', new TextEncoder().encode(input));
    const sign = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
    const response = await fetch('https://afdian.com/api/open/query-sponsor', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({user_id: env.AFDIAN_USER_ID, params, ts, sign}),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Sponsor upstream HTTP');
    const result = await response.json();
    if (result.ec !== 200 || !Array.isArray(result.data?.list)) throw new Error('Sponsor upstream response');
    total = result.data.total_page;
    // Never publish a partial snapshot or loop indefinitely on malformed pages.
    if (!Number.isInteger(total) || total < 0 || total > 100) throw new Error('Sponsor pagination limit');
    rows.push(...result.data.list);
  }
  const data = {schemaVersion: 1, updatedAt: new Date().toISOString(), sponsors: publicList(rows)};
  await env.RL.put(CACHE_KEY, JSON.stringify(data));
  return data;
}

function refresh(env) {
  if (!pending) {
    pending = (async () => {
      // Also throttle failures; old snapshots remain available indefinitely.
      await env.RL.put(RETRY_KEY, '1', {expirationTtl: 300});
      return syncSponsors(env);
    })().finally(() => { pending = undefined; });
  }
  return pending;
}

export async function onRequestGet({env, waitUntil}) {
  if (!env.RL) return json({error: 'Sponsors unavailable'}, 503);
  let cached;
  try {
    const raw = await env.RL.get(CACHE_KEY, 'json');
    if (raw?.schemaVersion === 1 && Array.isArray(raw.sponsors) && Number.isFinite(Date.parse(raw.updatedAt))) cached = raw;
    const retry = await env.RL.get(RETRY_KEY);
    if (cached) {
      if (Date.now() - Date.parse(cached.updatedAt) >= HOUR && !retry) waitUntil(refresh(env).catch(() => {}));
      return json(cached);
    }
    if (retry) return json({error: 'Sponsors unavailable'}, 503);
    return json(await refresh(env));
  } catch {
    return cached ? json(cached) : json({error: 'Sponsors unavailable'}, 503);
  }
}
