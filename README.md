# OmniDraft

A local-first Next.js workspace that transforms raw thoughts into platform-specific drafts for LinkedIn, X (Twitter), Email Newsletters, and Dev Blogs.

---

## Output Specifications

| Format | Structure & Editorial Constraints |
| :--- | :--- |
| **LinkedIn** | 150–300 words. Standalone 1–2 line hook, short line breaks, engagement question, and relevant hashtags. |
| **X (Twitter)** | 5–7 numbered tweets (`1/` format). Strict `<280` characters per tweet. Payoff-led hook and soft CTA. |
| **Email** | Structured newsletter with `Subject` (max 60 chars), `Preview` (40–90 chars), body, and single CTA. |
| **Dev Blog** | 300–600 word technical post with title, SEO opener, subheadings, and actionable takeaway. |

---

## Technical Architecture

### 1. Upstream Resilience & Circuit Breaker
* **Provider**: NVIDIA NIM API.
* **Cascading Failover**: Primary (`nvidia/nemotron-3.5-lightning-30b-a3b`) $\rightarrow$ Secondary (`nvidia/nvidia-nemotron-nano-9b-v2`).
* **Circuit Breaker**: Upstream 429 errors trigger an automated model cooldown based on `Retry-After`, automatically routing subsequent traffic to the backup model.
* **Latency Optimization**: Thinking tokens disabled (`chat_template_kwargs: { enable_thinking: false }`) with an 18s provider deadline.

### 2. Multi-Tier Rate Limiting & Abuse Prevention
* **Burst Limit**: Max 4 requests / 60 seconds (prevents rapid-fire bot clicks).
* **Sustained Limit**: Max 12 requests / 5 minutes (prevents continuous regeneration drain).
* **Hourly Ceiling**: Max 40 requests / 60 minutes (caps prolonged scraper activity).
* **Input Validation**: Minimum 20 words, maximum 8,000 characters (custom instructions capped at 500 characters).

### 3. Prompt Security & Guardrails
* **Delimiter Sanitization**: Strips XML breakout tags (`</source_content>`, `<|im_start|>`, `[INST]`) from user inputs before prompt interpolation.
* **Leakage Detection**: Validates generated output and rejects drafts that regurgitate system instructions or internal chain-of-thought tokens.
* **HTTP Security Headers**: Enforces `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy`.

### 4. Privacy & State Management
* **Zero Database / Stateless Backend**: `/api/generate` is stateless.
* **Local-First Storage**: Draft inputs, custom instructions, and generation history persist entirely in the user's browser via `window.localStorage`.

---

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Create `.env.local`:
```env
NVIDIA_API_KEY=nvapi-your-key-here
DEMO_MODE=false
```
*(Set `DEMO_MODE=true` to test UI generation offline without consuming API credits).*

### 3. Run Locally
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

---

## Deployment (Vercel)

1. Import the repository in [Vercel](https://vercel.com/new).
2. Set Environment Variable: `NVIDIA_API_KEY`.
3. Deploy (Zero configuration required).

---

## License

MIT
