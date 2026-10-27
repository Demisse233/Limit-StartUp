import disposableDomains from './email-data/disposable-domains.js';

// Registration screening only. This does not prove mailbox existence or ownership.
const disposable = new Set(disposableDomains);
const atom = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+$/i;
const label = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const error = (code, reason = code) => ({ ok: false, code, reason });

export function registrationEmailDomain(email) {
  if (typeof email !== 'string' || email.length > 254) return null;
  const parts = email.split('@');
  if (parts.length !== 2) return null;
  const [local, domain] = parts;
  if (!local || local.length > 64 || !local.split('.').every(part => atom.test(part))) return null;
  const labels = domain.split('.');
  // ASCII dot-atom addresses; international domains can use their punycode form.
  if (domain.length > 253 || labels.length < 2 || !labels.every(part => label.test(part)) || /^\d+$/.test(labels.at(-1))) return null;
  return domain.toLowerCase();
}

export function isDisposableDomain(domain) {
  const parts = domain.toLowerCase().split('.');
  // Include subdomains, without matching unrelated suffixes such as unrelated-mailinator.test.
  while (parts.length > 1) {
    if (disposable.has(parts.join('.'))) return true;
    parts.shift();
  }
  return false;
}

export function screenEmailFormat(email) {
  const domain = registrationEmailDomain(email);
  if (!domain) return error('invalid_email');
  if (isDisposableDomain(domain)) return error('disposable_email');
  return { ok: true, domain };
}

// Each DNS exchange has a timeout covering both headers and body; fixed HTTPS
// resolver avoids direct sockets, user-controlled endpoints and port 25 entirely.
export function createEmailDomainChecker({ transport = (...args) => fetch(...args), timeoutMs = 2500, cacheProvider = () => globalThis.caches?.default } = {}) {
  async function query(domain, type) {
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(Error('dns_timeout')); }, timeoutMs);
    });
    try {
      const data = await Promise.race([(async () => {
        const response = await transport(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`, {
          headers: { Accept: 'application/dns-json' }, signal: controller.signal
        });
        if (!response.ok) throw Error('dns_http');
        const body = await response.json();
        if (!body || ![0, 3].includes(body.Status) || body.TC === true || (body.Answer !== undefined && !Array.isArray(body.Answer))) throw Error('dns_response');
        return body;
      })(), timeout]);
      return data;
    } finally { clearTimeout(timer); }
  }

  async function resolve(domain) {
    const mx = await query(domain, 'MX');
    if (mx.Status === 3) return error('invalid_email_domain', 'nxdomain');
    const records = (mx.Answer || []).filter(row => row.type === 15);
    if (records.length) {
      if (records.some(row => /^0\s+\.$/.test(row.data))) return error('invalid_email_domain', 'null_mx');
      if (!records.every(row => {
        const match = /^(\d{1,5})\s+(\S+)$/.exec(row.data);
        return match && Number(match[1]) <= 65535 && match[2].replace(/\.$/, '').split('.').every(part => label.test(part));
      })) throw Error('dns_response');
      return { ok: true, reason: 'mx' };
    }
    // RFC 5321 implicit MX: no MX is not sufficient grounds for rejection.
    const addresses = await Promise.allSettled(['A', 'AAAA'].map(type => query(domain, type)));
    if (addresses.some(result => result.status === 'fulfilled' && result.value.Status === 0 && (result.value.Answer || []).some(row =>
      (row.type === 1 && /^(?:\d{1,3}\.){3}\d{1,3}$/.test(row.data) && row.data.split('.').every(n => Number(n) <= 255)) ||
      (row.type === 28 && /^[a-f0-9:]+$/i.test(row.data) && row.data.includes(':'))
    ))) return { ok: true, reason: 'implicit_mx' };
    if (addresses.some(result => result.status === 'rejected')) throw Error('dns_response');
    return error('invalid_email_domain', 'no_mail_host');
  }

  return async domain => {
    const started = Date.now();
    let cache;
    let cacheState = 'miss';
    const key = new Request(`https://email-domain-check.invalid/v1/${domain}`);
    try {
      cache = cacheProvider();
      const hit = await cache?.match(key);
      if (hit) {
        const result = await hit.json();
        if ((result.ok === true && ['mx', 'implicit_mx'].includes(result.reason)) ||
          (result.ok === false && result.code === 'invalid_email_domain' && ['nxdomain', 'null_mx', 'no_mail_host'].includes(result.reason))) {
          return { ...result, cache: 'hit', durationMs: Date.now() - started };
        }
      }
    } catch { cacheState = 'unavailable'; }
    let result;
    try { result = await resolve(domain); }
    catch { result = error('email_check_unavailable', 'dns_unavailable'); }
    if (result.code !== 'email_check_unavailable' && cache) {
      try {
        await cache.put(key, Response.json(result, { headers: { 'Cache-Control': `public, max-age=${result.ok ? 300 : 60}` } }));
      } catch { cacheState = 'unavailable'; }
    }
    return { ...result, cache: cacheState, durationMs: Date.now() - started };
  };
}

export const checkEmailDomain = createEmailDomainChecker();

const messages = {
  zh: { invalid_email: '请输入有效的邮箱地址。', disposable_email: '暂不支持临时邮箱，请使用常用邮箱注册。', invalid_email_domain: '该邮箱域名不存在或未配置邮件接收服务，请检查邮箱地址。', email_check_unavailable: '暂时无法检查邮箱域名，请稍后重试。' },
  en: { invalid_email: 'Enter a valid email address.', disposable_email: 'Temporary email addresses are not supported. Use a regular email address.', invalid_email_domain: 'This email domain does not exist or is not configured to receive mail. Check your email address.', email_check_unavailable: 'The email domain could not be checked right now. Please try again later.' }
};
export function emailCheckMessage(code, request) {
  const language = /^en(?:\b|-)/i.test(request.headers.get('Accept-Language') || '') ? 'en' : 'zh';
  return messages[language][code];
}
