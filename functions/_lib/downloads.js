import { RELEASE_REPO, PLATFORM_VARIANTS, releaseManifest, resolvePackage } from '../../limitrss/src/downloads.mjs';
const KEY = 'limitrss:public-releases:v1';
const RETRY_KEY = `${KEY}:retry`;
let pending;
export async function loadManifest(context) {
  const {env, request} = context;
  const saved = await env.RL?.get(KEY, 'json');
  if (saved && Date.now() - Date.parse(saved.generatedAt) < 300000) return saved;
  if (saved && await env.RL?.get(RETRY_KEY)) return {...saved, stale: true};
  if (!pending) pending = (async () => {
    const started = Date.now();
    try {
      const response = await fetch(`https://api.github.com/repos/${RELEASE_REPO}/releases?per_page=100`, {
        headers: {Accept: 'application/vnd.github+json', 'User-Agent': 'LimitRSS-downloads'},
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
      const manifest = releaseManifest(await response.json());
      if (!Object.keys(manifest.versions).length) throw new Error('No published installers');
      await env.RL?.put(KEY, JSON.stringify(manifest), {expirationTtl: 604800});
      console.info(JSON.stringify({event: 'downloads.refresh', result: 'success', elapsedMs: Date.now() - started}));
      return manifest;
    } catch (error) {
      await env.RL?.put(RETRY_KEY, '1', {expirationTtl: 60});
      console.warn(JSON.stringify({event: 'downloads.refresh', result: 'failure', reason: error.message, elapsedMs: Date.now() - started}));
      if (saved) return {...saved, stale: true};
      // ASSETS accesses the deployed static snapshot without recursively invoking Functions.
      const fallback = await env.ASSETS.fetch(new Request(new URL('/limitrss/data/downloads.json', request.url)));
      const manifest = await fallback.json();
      if (manifest.repo !== RELEASE_REPO) throw new Error('Public download snapshot unavailable');
      return {...manifest, stale: true};
    }
  })().finally(() => {pending = undefined;});
  return pending;
}
export function jsonResponse(data, request, status = 200) {
  return new Response(request.method === 'HEAD' ? null : JSON.stringify(data), {status, headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=60',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'X-Content-Type-Options': 'nosniff',
  }});
}
export async function manifestResponse(context) {
  try { return jsonResponse(await loadManifest(context), context.request); }
  catch { return jsonResponse({error: 'Downloads temporarily unavailable'}, context.request, 503); }
}
export async function downloadResponse(context, platform) {
  const request = context.request;
  const arch = new URL(request.url).searchParams.get('arch');
  if (arch && !PLATFORM_VARIANTS[platform]?.[arch]) return jsonResponse({error: 'Unsupported architecture'}, request, 400);
  try {
    const manifest = await loadManifest(context);
    const platforms = {mac: 'macOS', windows: 'Windows', ios: 'iOS', android: 'Android', harmony: 'HarmonyOS'};
    const latestVersion = Object.keys(manifest.versions)[0] || null;
    const base = new URL('/limitrss/', request.url).href;
    const payload = key => {
      const hit = resolvePackage(manifest, key, arch);
      const variants = Object.fromEntries(Object.keys(PLATFORM_VARIANTS[key] || {}).map(architecture => [architecture, resolvePackage(manifest, key, architecture)]));
      return {schemaVersion: 1, product: 'LimitRSS', platform: key, label: platforms[key], available: Boolean(hit),
        version: hit?.version || null, fileName: hit?.fileName || null, url: hit?.url || null,
        latestVersion, upToDateWithLatest: hit?.version === latestVersion, variants,
        releasePage: hit ? `https://github.com/${RELEASE_REPO}/releases/tag/v${hit.version}` : null,
        generatedAt: manifest.generatedAt, stale: Boolean(manifest.stale),
        file: `${base}api/download/${key}.json`, downloads: base, changelog: `${base}changelog`};
    };
    if (platform === 'index') return jsonResponse({schemaVersion: 1, product: 'LimitRSS', repo: RELEASE_REPO, latestVersion,
      platforms: Object.fromEntries(Object.keys(platforms).map(key => [key, payload(key)]))}, request);
    if (!platforms[platform]) return jsonResponse({error: 'Unknown platform'}, request, 404);
    return jsonResponse(payload(platform), request);
  } catch { return jsonResponse({error: 'Downloads temporarily unavailable'}, request, 503); }
}
export function optionsResponse() {return new Response(null, {status: 204, headers: {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS'}});}
