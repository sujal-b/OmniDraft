# OmniDraft ⚡

> **Turn one raw idea into four high-signal, platform-ready content drafts in seconds.**

[![Next.js 15](https://img.shields.io/badge/Next.js-15.4-black?style=flat&logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19-blue?style=flat&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![NVIDIA NIM](https://img.shields.io/badge/NVIDIA-NIM_API-76B900?style=flat&logo=nvidia)](https://build.nvidia.com/)
[![Vercel Ready](https://img.shields.io/badge/Vercel-Deployed-black?style=flat&logo=vercel)](https://vercel.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 📖 Overview

**OmniDraft** is a local-first, editorial transformation studio designed to solve content repurposing without losing tone, signal, or nuance. Instead of manually re-writing a launch note, blog post, or raw meeting thought into multiple channel formats, OmniDraft adapts the container to fit native reader behavior:

* 💼 **LinkedIn Post** — Clear standalone hook, short line breaks, engagement question, and relevant tags.
* 🧵 **X (Twitter) Thread** — 5–7 numbered tweets, strict `<280` characters each, payoff-led opener, and soft CTA.
* ✉️ **Email Newsletter** — Subject line (max 60 chars), Preview snippet (40–90 chars), structured body, and focused CTA.
* 📝 **Dev Blog** — 300–600 word technical narrative with SEO-aligned headers, practical code context, and takeaway summary.

---

## ✨ Key Features

* **Studio Deck Workspace**: Split 50/50 interface with auto-scrolling studio cards, smooth tab transitions, and real-time word counter.
* **Target Format Selector**: Choose exactly which formats to generate (default 1 format or multi-select batch).
* **Cascading Model Failover**: Built-in upstream resilience using NVIDIA NIM:
  * Primary: `nvidia/nemotron-3.5-lightning-30b-a3b`
  * Secondary Fallback: `nvidia/nvidia-nemotron-nano-9b-v2`
* **Automated Circuit Breaker**: Upstream 429s put affected models into automatic cooldown and transparently route traffic to backup models.
* **Multi-Tier Rate Limiting & Bot Protection**: 3-tier sliding-window limiter defending against autoclickers and rapid token drain.
* **Prompt Injection & Delimiter Defense**: Automatic sanitization of XML breakout tags (`</source_content>`, `[INST]`, `<|im_start|>`) and post-generation prompt leakage verification.
* **Interactive Tuning Chips**: One-click quick actions (*"Punchier hook"*, *"Make shorter"*, *"Add CTA"*, *"Simplify"*) and per-channel custom instructions.
* **Local-First Privacy**: 100% stateless backend. Draft inputs, custom instructions, and history are stored exclusively in the user's browser via `window.localStorage`.
* **Saved Rooms & Archive Search**: Searchable historical generation sessions with instant fuzzy filtering and one-click session restore.
* **Keyboard Productivity**:
  * `⌘ + Enter` (or `Ctrl + Enter`): Transform content
  * `⌘ + 1` ... `⌘ + 4`: Switch active platform tab

---

## 🛡️ Security & Rate Limiting Architecture

OmniDraft includes multi-layer safeguards against abuse, token flooding, and malicious inputs:

| Defense Layer | Mechanism | Protection Target |
| :--- | :--- | :--- |
| **Burst Tier** | Max **4 requests / 60s** | Blocks rapid-fire clicks & autoclicker bots |
| **Sustained Tier** | Max **12 requests / 5 mins** | Blocks continuous high-frequency regeneration |
| **Hourly Ceiling** | Max **40 requests / 60 mins** | Caps long-term automated scrapers & token burn |
| **Input Boundaries** | Min 20 words, Max 8,000 chars (500 chars for instructions) | Prevents context window bloating & buffer DoS |
| **Prompt Sanitization** | Regex neutralization of delimiter breakout tags | Prevents prompt injection & instruction overrides |
| **Leakage Guard** | Scans output for system prompt artifacts | Rejects corrupted drafts & prevents model exposure |
| **Security Headers** | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` | Clickjacking, MIME sniffing, and browser exploit defense |

---

## 🚀 Quick Start

### 1. Prerequisites
* **Node.js**: `v18.18.0` or higher
* **NVIDIA NIM API Key**: Free tier available at [build.nvidia.com](https://build.nvidia.com/)

### 2. Installation

```bash
# Clone the repository
git clone https://github.com/sujal-b/OmniDraft.git
cd OmniDraft

# Install dependencies
npm install
```

### 3. Environment Setup

Create a `.env.local` file in the project root (or copy from `.env.example`):

```bash
cp .env.example .env.local
```

Configure your environment variables:

```env
# Required for live generation
NVIDIA_API_KEY=nvapi-your-key-here

# Optional: Set to true for offline mock generation without API credits
DEMO_MODE=false
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🚢 Deploying to Vercel

OmniDraft is optimized for zero-config deployment on Vercel:

1. Push your repository to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new) and import `OmniDraft`.
3. In **Project Settings $\rightarrow$ Environment Variables**, add:
   * `NVIDIA_API_KEY`: `nvapi-xxxxxxxxxxxx`
   * `DEMO_MODE`: `false`
4. Click **Deploy**.

---

## 📁 Project Structure

```text
OmniDraft/
├── app/
│   ├── api/
│   │   └── generate/
│   │       ├── provider.ts     # NVIDIA NIM client, failover cascade, circuit breaker
│   │       └── route.ts        # Rate limiter, input validation, prompt sanitizer
│   ├── globals.css             # Fluid typography, themes, deck animations
│   ├── layout.tsx              # Root layout & SEO metadata
│   └── page.tsx                # Studio UI, local storage engine, keyboard shortcuts
├── next.config.ts              # Next.js configuration & HTTP security headers
├── package.json                # Dependencies & scripts
├── tsconfig.json               # TypeScript strict configuration
└── README.md
```

---

## 📜 Scripts

* `npm run dev` — Start the local development server
* `npm run build` — Create an optimized production build
* `npm run start` — Start production server
* `npm run typecheck` — Run TypeScript type checking (`tsc --noEmit`)

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
