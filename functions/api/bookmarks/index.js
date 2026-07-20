import { getAuthUser, readJson, json, err } from '../../_lib/db.js';

const MAX_BOOKMARKS_JSON = 512 * 1024;
const MAX_BOOKMARKS = 500;
const MAX_CATEGORIES = 50;

async function ensureTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS user_bookmarks (
      user_id TEXT PRIMARY KEY,
      data_json TEXT NOT NULL DEFAULT '{}',
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run();
}

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function cleanUrl(value) {
  const text = cleanText(value, 2048);
  if (!text) return '';
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch (e) {
    return '';
  }
}

function cleanIconUrl(value) {
  return cleanUrl(value);
}

function sanitizeData(input) {
  const output = { version: 1, panelOpen: false, categories: [{ id: 'uncategorized', name: '未分类' }], bookmarks: [], updatedAt: 0 };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return output;
  output.panelOpen = input.panelOpen === true;
  const categoryIds = new Set(['uncategorized']);
  const categoryNames = new Set(['未分类']);
  const categories = Array.isArray(input.categories) ? input.categories : [];
  for (const category of categories.slice(0, MAX_CATEGORIES)) {
    const id = cleanText(category && category.id, 64);
    const name = cleanText(category && category.name, 60);
    const nameKey = name.toLocaleLowerCase('zh-CN');
    if (!id || !name || categoryIds.has(id) || categoryNames.has(nameKey)) continue;
    categoryIds.add(id);
    categoryNames.add(nameKey);
    output.categories.push({ id, name });
  }
  const seenUrls = new Set();
  const bookmarks = Array.isArray(input.bookmarks) ? input.bookmarks : [];
  for (const bookmark of bookmarks.slice(0, MAX_BOOKMARKS)) {
    const id = cleanText(bookmark && bookmark.id, 64);
    const name = cleanText(bookmark && bookmark.name, 120);
    const url = cleanUrl(bookmark && bookmark.url);
    const key = url.toLocaleLowerCase('en-US');
    if (!id || !name || !url || seenUrls.has(key)) continue;
    seenUrls.add(key);
    output.bookmarks.push({
      id,
      name,
      url,
      iconUrl: cleanIconUrl(bookmark.iconUrl),
      categoryId: categoryIds.has(bookmark.categoryId) ? bookmark.categoryId : 'uncategorized',
      size: bookmark.size === 'small' || bookmark.size === 'xlarge' ? bookmark.size : 'large',
      createdAt: Number.isFinite(bookmark.createdAt) ? bookmark.createdAt : Date.now(),
      updatedAt: Number.isFinite(bookmark.updatedAt) ? bookmark.updatedAt : Date.now()
    });
  }
  output.updatedAt = Number.isFinite(input.updatedAt) ? input.updatedAt : Date.now();
  return output;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env) });
  const user = await getAuthUser(request, env);
  if (!user) return err('unauthorized', '未登录', 401, env);
  await ensureTable(env);
  const row = await env.DB.prepare('SELECT data_json, updated_at FROM user_bookmarks WHERE user_id = ?').bind(user.id).first();
  if (!row) return json({ data: sanitizeData(null), updatedAt: 0 }, 200, env);
  let data = null;
  try { data = JSON.parse(row.data_json); } catch (e) {}
  return json({ data: sanitizeData(data), updatedAt: row.updated_at }, 200, env);
}

export async function onRequestPut(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env) });
  const user = await getAuthUser(request, env);
  if (!user) return err('unauthorized', '未登录', 401, env);
  const body = await readJson(request);
  if (!body || !body.data || typeof body.data !== 'object') return err('invalid_body', '需要书签数据', 400, env);
  const data = sanitizeData(body.data);
  const serialized = JSON.stringify(data);
  if (serialized.length > MAX_BOOKMARKS_JSON) return err('bookmarks_too_large', '书签数据过大', 413, env);
  await ensureTable(env);
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO user_bookmarks (user_id, data_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at
  `).bind(user.id, serialized, now).run();
  return json({ ok: true, updatedAt: now, count: data.bookmarks.length }, 200, env);
}

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}
