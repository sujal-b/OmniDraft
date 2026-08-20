# Content Repurposer

A local-first Next.js app that turns one source idea into four platform-ready drafts: LinkedIn, X, email, and a dev blog post.

## Run locally

```bash
npm install
npm run dev
```

To generate with NVIDIA NIM, copy `.env.example` to `.env.local` and set `NVIDIA_API_KEY`. Primary model: `nemotron-3.5-lightning-30b-a3b`; fallback: `nvidia-nemotron-nano-9b-v2`. Both run with thinking disabled for latency. For a local UI preview without a provider, set `DEMO_MODE=true`; demo output is explicitly gated and is never used silently in production.

## Product notes

- Draft input and the last five sessions use browser `localStorage` only.
- Generation is sequential in the SRS order: LinkedIn → X → Email → Blog.
- Each card owns its loading/error/retry state and can be regenerated without touching the other cards.
- Generation calls use NVIDIA NIM with a server-owned model failover policy (lightning primary, nano-9b-v2 fallback); 429s honor Retry-After, cool down affected models, and disable card retries until safe.
- No authentication, database, server-side persistence, paid services, or external scraping is required.
