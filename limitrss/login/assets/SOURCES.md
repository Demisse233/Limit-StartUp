# Login globe background

Cloudflare Connect globe resources retrieved from the public Cloudflare Dashboard login page on 2026-10-23, as requested for this design.

- Page: https://dash.cloudflare.com/login
- Renderer source: https://dash.cloudflare.com/assets/cf-shared-auth.TQ_xgCxm.js (globe shaders and standalone render effect only)
- Map: https://dash.cloudflare.com/assets/connect-globe-map.D421dbPF.png
- Static fallback: https://dash.cloudflare.com/assets/connect-globe-fallback.sIXpJbci.png

Local adaptations: standalone initialization without React or Dashboard services; pale blue/white stripe color; bottom cropping and positioning with a larger sphere radius; scissor clipping to the visible blue panel; inline map bytes for file:// preview. No external Cloudflare Dashboard scripts are loaded at runtime. The renderer retains the original rotation, density/stripe passes, reduced-motion fallback and visibility scheduling.
