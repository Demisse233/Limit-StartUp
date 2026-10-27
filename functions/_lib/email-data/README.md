# Registration email screening data

Vendored from https://github.com/disposable-email-domains/disposable-email-domains
at revision `e4f0910adf5ab418dc998a1d8e6c15906ca04864` (2026-10-27).

Source: `disposable_email_blocklist.conf`, 9,927 unique domains.
Source SHA-256: `acb14963f88689009907aee11e2c9fab0df8355b6721859a0cc813ae03cdecb8`.
License: CC0-1.0; the upstream license is retained as `LICENSE.txt`.

`disposable-domains.js` is a sorted, deduplicated lowercase JSON array exported
as an ES module. To update, pin and review an upstream revision, fetch the list
and license from that revision, regenerate the array and update this metadata.
Run `npm run test:auth-email` and `npm run build` before shipping an update.
Registration does not download executable code or lists at runtime.

The list is a heuristic, may have false positives, and does not prove mailbox
existence or ownership. Parent entries also cover their subdomains. Genuine
providers are not blocked merely because they offer free accounts or aliases.
