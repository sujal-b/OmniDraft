# SRS: Content Repurposer

## 1. Scope
Web app. User pastes text content → generates 4 platform-optimized versions: LinkedIn Post, X Thread, Email Newsletter, Dev Blog Post. Anonymous, no login, zero-budget stack.

## 2. Stack
- Frontend + API: Next.js (App Router), single deployable unit.
- Deployment: Vercel (free tier).
- LLM Provider: Opencode Zen (free, unlimited).
  - Primary model: `deepseek-v4-flash`
  - Fallback model: `mimo-v2.5`
- Persistence: Browser `localStorage` only. No database, no auth, no server-side state.

## 3. Data Model (localStorage keys)
```
draft_input: string                  // autosaved raw textarea, debounced 500ms
history: Array<HistoryItem>          // max 5, FIFO eviction
  HistoryItem: { id, timestamp, inputText, outputs: Output[] }
  Output: { platform, content, instruction?: string }
```
No server persistence. No PII collected.

## 4. Core Flow
1. User pastes text into textarea (autosaved to `draft_input` on change, debounced).
2. Validation: min 20 words (block generate button, inline message). Soft warning (non-blocking) if input > 2000 words: "Shorter input works better."
3. User selects global tone: Professional | Casual | Funny (default: Professional).
4. User clicks "Transform Content".
5. Sequential generation: 4 API calls fired in order (LinkedIn → X → Email → Blog). Each card shows loading state independently; fills in as its call resolves. Not blocking — UI is responsive while queue runs.
6. Each output card renders: platform icon/title, generated content, char/word counter (informational only), Copy button, collapsed "Add instruction" toggle, Regenerate button.
7. On save (all 4 complete, at least partially), push to `history` (max 5, oldest evicted).

## 5. Per-Card Customization
- Each card has a collapsed optional text input: "Add instruction for this platform" (e.g. "mention my new role", "keep it under 100 words").
- On Regenerate: only that card's API call re-fires, using global tone + this card's instruction (instruction augments/overrides tone for that call). Other 3 cards untouched.
- No card-level regeneration triggers a full re-run of all 4.

## 6. Error Handling (per card, independent)
Retry sequence on failure, silent to user until final failure:
1. Retry same model (primary) once, after ~2s delay.
2. If fails again, switch to fallback model, retry once.
3. If fallback also fails: show inline card state "Generation failed" + manual Retry button.
No global error state. Other successful cards remain visible/usable regardless of one card's failure.

## 7. Platform-Specific Generation Rules (baked into prompt, not just UI validation)

### LinkedIn
- Hard limit: 3000 chars.
- Target: 150–300 words.
- First 1–2 lines: standalone hook (scroll-stop before "see more" truncation) — bold claim, question, or curiosity gap.
- Format: short line breaks (1–2 sentences per visual line), not paragraph blocks.
- Close with a soft engagement question.
- Include relevant hashtags (append, not embedded mid-text).

### X Thread
- Hard limit: 280 chars per tweet.
- 5–7 tweets total.
- Tweet 1: standalone hook, must work without needing thread context — lead with payoff/claim, not setup.
- Number each tweet (`1/`, `2/`, etc.).
- Last tweet: soft CTA (follow/reply/link).

### Email Newsletter
- Subject line: ≤60 chars, functions as primary hook.
- Preview text: first ~40–90 chars of body must work as inbox preview hook.
- Body: short paragraphs (2–3 lines max).
- Single clear CTA (one link/button, not multiple competing links).

### Dev Blog Post (Dev.to-style)
- Target: 300–600 words.
- Title + first paragraph: must hook (shown in feed/search preview pre-click).
- Use subheadings if content exceeds ~400 words, for skimmability.
- SEO-reasonable intro (state the topic/value in first 2 sentences).

## 8. UI Components
- Input section: textarea + live word count + validation message.
- Tone selector: 3-option toggle (Professional/Casual/Funny).
- "Transform Content" button: disabled until validation passes; shows queue progress (e.g. "Generating 2 of 4...").
- Output grid: 4 cards (LinkedIn, X, Email, Blog).
  - Each card: title/icon, content area, char counter, Copy button (clipboard + toast confirmation), collapsed instruction input, Regenerate button, per-card error/retry state.
- History panel: last 5 sessions, click to reload input+outputs (read-only view, does not overwrite current draft).

## 9. Non-Functional Requirements
- No cost: no paid API tier, no paid hosting, no card-linked service anywhere in stack.
- No auth, no server-side user data storage — all state client-side.
- Must degrade gracefully under free-tier rate limits (see §6) without full-page failure.
- Single deployable Next.js app, deployable via `vercel deploy` with no additional config.

## 10. Out of Scope (explicit)
- User accounts, login, cross-device sync.
- URL/auto-fetch scraping of external articles.
- JSON export / Buffer / Later integration.
- Instagram, TikTok, Reddit output formats.
- True parallel API calls.
- Emoji density, hashtag count optimization, posting-time recommendations.
- Branding/naming (undecided — refer to project generically as "Content Repurposer" until finalized).
