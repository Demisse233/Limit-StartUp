# 注册邮箱筛查 / Registration email screening

注册接口 `/api/auth/register` 在 Workers / Pages Functions 中执行邮箱格式、临时邮箱与域名邮件配置检查。现有账号的登录与分享归属不受影响；无需数据库迁移、SMTP 服务器、付费邮箱 API 或新增环境变量。没有启用常用邮箱域名白名单。

The registration endpoint checks address syntax, known disposable domains and DNS mail configuration. Existing logins and share ownership are unchanged. No migration, SMTP server, paid email API or new environment variable is required. No provider allowlist is enabled.

## Behavior

- Accept ASCII dot-atom local parts (including dots and plus tags) and valid DNS domain labels. International domains may use punycode. Quoted local parts and internationalized local parts are not supported. Preserve the existing trim/lowercase account normalization; do not merge aliases or historical accounts.
- Use a bundled CC0 disposable-domain list; block listed domains and their subdomains. Attribution and update instructions: `functions/_lib/email-data/README.md`. Lists can be incomplete or contain false positives and require periodic review.
- Check syntax and disposable status before network work. Only perform DNS requests after Turnstile passes and the duplicate-account check completes, before password hashing or account insertion.
- Query MX using fixed Cloudflare DNS-over-HTTPS. NXDOMAIN or null MX rejects registration. With no MX, allow implicit MX when an A or AAAA address exists. A domain with no mail host is rejected.
- DNS HTTP errors, malformed responses, SERVFAIL, refused queries or timeouts return retriable `email_check_unavailable` (503); do not create an account or mark the address nonexistent. Each DNS request/body has a 2.5-second timeout; fallback A/AAAA requests run together.
- Cache only domain-level definite results in the Workers Cache API: five minutes for valid domains and one minute for invalid domains. Never cache resolver failures. Cache storage is optional; failures still require a successful DNS check. Temporary-email data is bundled, not downloaded on registration.
- All new errors are available in Chinese and English. Plaza uses the selected language; API clients can send `Accept-Language`. The StartUp registration dialog also receives a clear error.

## Diagnostics

Structured auth logs record result codes, DNS reason, cache state and timing without addresses, IPs, passwords or tokens. The registration UI offers an export on failure. A bounded 50-entry, tab-scoped session buffer retains sanitized result codes and timing across navigation and is included in Plaza diagnostic exports. No request bodies or raw server messages are retained. Browser storage denial does not bypass backend checks.

## Limits

这不是邮箱存在性或归属验证：DNS 通过只说明域名具有邮件接收配置，不说明具体邮箱存在，也不说明属于注册者。保留现有 Turnstile 与注册限流。免费额度内没有新增服务费用，但仍消耗 Workers 请求及运行资源。

Passing these checks does not verify the individual mailbox or its owner. Existing Turnstile and registration throttling remain necessary. The implementation adds no paid service but uses the existing Workers request/runtime allowances.

## Local verification

```sh
npm run test:auth-email
npm run test:plaza
npm run build
```

Browser checks use a local static preview and mocked CAPTCHA/API responses; they do not register production accounts. Deployment remains a separate step.
