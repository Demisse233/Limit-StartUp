const MAX_ICON_BYTES = 512 * 1024;
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function errorResponse(message, status) {
  return new Response(message, {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'text/plain; charset=utf-8'
    }
  });
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

async function readLimitedBlob(response) {
  const reader = response.body && response.body.getReader ? response.body.getReader() : null;
  if (!reader) {
    const blob = await response.blob();
    return blob.size <= MAX_ICON_BYTES ? blob : null;
  }
  const chunks = [];
  let size = 0;
  while (size <= MAX_ICON_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_ICON_BYTES) {
      try { await reader.cancel(); } catch (e) {}
      return null;
    }
    chunks.push(value);
  }
  return new Blob(chunks, { type: response.headers.get('content-type') || 'image/png' });
}

export async function onRequestGet({ request }) {
  const target = parseTarget(new URL(request.url).searchParams.get('url'));
  if (!target) return errorResponse('Invalid icon URL', 400);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(target.href, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'image/avif,image/webp,image/svg+xml,image/*,*/*;q=0.8',
        'User-Agent': 'Limit-Startup-Bookmark-Icon/1.0'
      }
    });
    if (!response.ok) return errorResponse('Icon fetch failed', 502);
    const finalUrl = parseTarget(response.url);
    const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!finalUrl || !contentType.startsWith('image/')) return errorResponse('Invalid icon response', 415);
    const blob = await readLimitedBlob(response);
    if (!blob) return errorResponse('Icon too large', 413);
    return new Response(blob, {
      headers: {
        ...CORS_HEADERS,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=604800, stale-while-revalidate=2592000',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  } catch (e) {
    return errorResponse('Icon fetch failed', 502);
  } finally {
    clearTimeout(timeout);
  }
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
