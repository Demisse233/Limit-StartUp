const MAX_HTML_BYTES = 512 * 1024;
const RESPONSE_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: RESPONSE_HEADERS });
}

function err(code, message, status = 400) {
  return json({ error: code, message }, status);
}

function isBlockedHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) return true;
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const parts = match.slice(1).map(Number);
  if (parts.some((part) => part > 255)) return true;
  return parts[0] === 0 || parts[0] === 10 || parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168);
}

function parseTarget(value) {
  try {
    const url = new URL(value);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) return null;
    if (url.port && url.port !== '80' && url.port !== '443') return null;
    return isBlockedHost(url.hostname) ? null : url;
  } catch (e) {
    return null;
  }
}

function readAttribute(tag, name) {
  const match = tag.match(new RegExp('\\s' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i'));
  return match ? (match[1] || match[2] || match[3] || '') : '';
}

function decodeHtml(value) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return String(value || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, token) => {
    if (token[0] !== '#') return named[token.toLowerCase()] || entity;
    const radix = token[1].toLowerCase() === 'x' ? 16 : 10;
    const number = parseInt(token.slice(radix === 16 ? 2 : 1), radix);
    return Number.isFinite(number) ? String.fromCodePoint(number) : entity;
  }).replace(/\s+/g, ' ').trim();
}

async function readLimitedText(response) {
  const reader = response.body && response.body.getReader ? response.body.getReader() : null;
  if (!reader) return (await response.text()).slice(0, MAX_HTML_BYTES);
  const decoder = new TextDecoder();
  let size = 0;
  let output = '';
  while (size < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    output += decoder.decode(value, { stream: true });
  }
  try { await reader.cancel(); } catch (e) {}
  return output.slice(0, MAX_HTML_BYTES);
}

function extractMetadata(html, pageUrl) {
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = decodeHtml(titleMatch && titleMatch[1]).slice(0, 120);
  let iconUrl = '';
  let iconScore = -1;
  const links = html.match(/<link\b[^>]*>/gi) || [];
  for (const tag of links) {
    const rel = readAttribute(tag, 'rel').toLowerCase().split(/\s+/);
    if (!rel.some((value) => value === 'icon' || value === 'apple-touch-icon' || value === 'apple-touch-icon-precomposed')) continue;
    const href = readAttribute(tag, 'href');
    if (!href || href.startsWith('data:')) continue;
    try {
      const candidate = new URL(href, pageUrl);
      if (candidate.protocol === 'http:' || candidate.protocol === 'https:') {
        const sizes = readAttribute(tag, 'sizes').toLowerCase();
        const dimensions = Array.from(sizes.matchAll(/(\d+)x(\d+)/g));
        let score = dimensions.reduce((largest, match) => Math.max(largest, Math.min(Number(match[1]), Number(match[2]))), 0);
        if (sizes.includes('any') || /\.svg(?:$|[?#])/i.test(candidate.href)) score = Math.max(score, 512);
        if (rel.includes('apple-touch-icon') || rel.includes('apple-touch-icon-precomposed')) score = Math.max(score, 180);
        if (!score) score = 16;
        if (score > iconScore) {
          iconScore = score;
          iconUrl = candidate.href;
        }
      }
    } catch (e) {}
  }
  if (!iconUrl) iconUrl = new URL('/favicon.ico', pageUrl).href;
  return { title, iconUrl };
}

export async function onRequestGet({ request }) {
  const target = parseTarget(new URL(request.url).searchParams.get('url'));
  if (!target) return err('invalid_url', '请提供有效的公开网页地址', 400);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(target.href, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Limit-Startup-Bookmark-Metadata/1.0'
      }
    });
    if (!response.ok) return err('fetch_failed', '无法读取该网页', 502);
    const finalUrl = parseTarget(response.url);
    if (!finalUrl) return err('invalid_redirect', '网页重定向地址不可用', 400);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      return err('not_html', '该地址不是网页', 400);
    }
    const metadata = extractMetadata(await readLimitedText(response), finalUrl.href);
    return json({ ...metadata, pageUrl: finalUrl.href });
  } catch (e) {
    return err('fetch_failed', '网页信息获取失败', 502);
  } finally {
    clearTimeout(timeout);
  }
}
