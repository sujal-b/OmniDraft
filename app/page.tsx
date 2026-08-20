"use client";

import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

type Platform = "linkedin" | "x" | "email" | "blog";
type Tone = "Professional" | "Casual" | "Funny";
type CardStatus = "idle" | "queued" | "loading" | "success" | "error";

type Output = { platform: Platform; content: string; instruction?: string };
type HistoryItem = { id: string; timestamp: number; inputText: string; outputs: Output[] };

function isHistoryItem(value: unknown): value is HistoryItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<HistoryItem>;
  return (
    typeof item.id === "string" &&
    typeof item.inputText === "string" &&
    typeof item.timestamp === "number" &&
    Array.isArray(item.outputs) &&
    item.outputs.every((output) => typeof output.platform === "string" && typeof output.content === "string")
  );
}
type CardState = Output & { status: CardStatus; error?: string; retryAfterSeconds?: number; retryAt?: number };

const platforms: Array<{ id: Platform; label: string; short: string; description: string; accent: string }> = [
  { id: "linkedin", label: "LinkedIn", short: "LI", description: "A confident, useful point of view.", accent: "linkedin" },
  { id: "x", label: "X Thread", short: "X", description: "A sharp idea, one beat at a time.", accent: "x" },
  { id: "email", label: "Email", short: "EM", description: "A subject line worth opening.", accent: "email" },
  { id: "blog", label: "Dev Blog", short: "DB", description: "A clear story with room to learn.", accent: "blog" },
];

const TUNING_CHIPS = [
  { label: "PUN → Punchier hook", text: "Make the opening hook punchier and more engaging" },
  { label: "SHORT → Make shorter", text: "Keep it brief, direct, and under 100 words" },
  { label: "CTA → Add CTA", text: "Add a clear call to action at the end" },
  { label: "SIMPL → Simplify", text: "Simplify jargon and use clear, plain language" },
];

const emptyCards: CardState[] = platforms.map(({ id }) => ({ platform: id, content: "", instruction: "", status: "idle" }));

function countWords(value: string) {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi"];
function roman(index: number) {
  return ROMAN[index] ?? String(index + 1);
}

function dayLabelOf(ts: number) {
  const day = new Date(ts);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(day)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return day.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function Icon({ name, size = 18 }: { name: "arrow" | "copy" | "refresh" | "plus" | "clock" | "check" | "spark" | "left" | "right" | "close"; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "arrow") return <svg {...common}><path d="M5 12h13" /><path d="m13 6 6 6-6 6" /></svg>;
  if (name === "copy") return <svg {...common}><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>;
  if (name === "refresh") return <svg {...common}><path d="M20 11a8 8 0 1 0 1 4" /><path d="M20 5v6h-6" /></svg>;
  if (name === "plus") return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
  if (name === "clock") return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></svg>;
  if (name === "check") return <svg {...common}><path d="m5 12 4 4L19 6" /></svg>;
  if (name === "left") return <svg {...common}><path d="m15 18-6-6 6-6" /></svg>;
  if (name === "right") return <svg {...common}><path d="m9 18 6-6-6-6" /></svg>;
  if (name === "close") return <svg {...common}><path d="M18 6 6 18M6 6l12 12" /></svg>;
  return <svg {...common}><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z" /></svg>;
}

export default function Home() {
  const [input, setInput] = useState("");
  const [tone, setTone] = useState<Tone>("Professional");
  const [cards, setCards] = useState<CardState[]>(emptyCards);
  const [activePlatform, setActivePlatform] = useState<Platform>("linkedin");
  const [slideAnim, setSlideAnim] = useState<"slide-in-right" | "slide-in-left">("slide-in-right");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [copied, setCopied] = useState<Platform | null>(null);
  const [toast, setToast] = useState("");
  const [openInstructions, setOpenInstructions] = useState<Platform | null>(null);
  const [queueCount, setQueueCount] = useState(0);
  const [retryClock, setRetryClock] = useState(() => Date.now());
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(["linkedin"]);

  function togglePlatform(id: Platform) {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter((p) => p !== id) : prev) : [...prev, id]
    );
  }
  
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeHistoryId = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const toneOptionsRef = useRef<HTMLDivElement>(null);
  const toneThumbRef = useRef<HTMLSpanElement>(null);
  const cardsRef = useRef(cards);
  cardsRef.current = cards;

  // Get selected session
  const selectedSession = useMemo(() => {
    return history.find(h => h.id === selectedSessionId) || null;
  }, [history, selectedSessionId]);

  // Clear selection when opening/closing drawer
  useEffect(() => {
    if (showHistoryDrawer && !selectedSessionId && history.length > 0) {
      setSelectedSessionId(history[0].id);
    }
  }, [showHistoryDrawer, history]);

  useLayoutEffect(() => {
    const positionThumb = () => {
      const container = toneOptionsRef.current;
      const thumb = toneThumbRef.current;
      const active = container?.querySelector<HTMLElement>(".tone-option.active");
      if (!container || !thumb || !active) return;
      thumb.style.width = `${active.offsetWidth}px`;
      thumb.style.transform = `translate3d(${active.offsetLeft}px, 0, 0)`;
    };
    positionThumb();
    window.addEventListener("resize", positionThumb);
    return () => window.removeEventListener("resize", positionThumb);
  }, [tone]);

  const wordCount = useMemo(() => countWords(input), [input]);
  const inputValid = wordCount >= 20;

  const activeIndex = useMemo(() => platforms.findIndex((p) => p.id === activePlatform), [activePlatform]);

  function changePlatform(targetId: Platform, dir: "next" | "prev" = "next") {
    setSlideAnim(dir === "next" ? "slide-in-right" : "slide-in-left");
    setActivePlatform(targetId);
  }

  useEffect(() => {
    try {
      const draft = window.localStorage.getItem("draft_input");
      const storedHistory = window.localStorage.getItem("history");
      const storedInstructions = window.localStorage.getItem("draft_instructions");
      if (draft) setInput(draft);
      if (storedHistory) {
        const parsed = JSON.parse(storedHistory);
        if (Array.isArray(parsed)) setHistory(parsed.filter(isHistoryItem));
      }
      if (storedInstructions) {
        const instMap = JSON.parse(storedInstructions) as Record<string, string>;
        setCards((current) => current.map((card) => ({ ...card, instruction: instMap[card.platform] || "" })));
      }
    } catch (error) {
      console.error("Failed to load from localStorage:", error);
      // Initialize with empty arrays if storage corrupted
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setRetryClock((previous) => {
        const needsTick = cardsRef.current.some((card) => card.retryAt !== undefined && card.retryAt > previous);
        return needsTick ? Math.max(now, previous) : previous;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        window.localStorage.setItem("draft_input", input);
        const instMap = cards.reduce((acc, card) => ({ ...acc, [card.platform]: card.instruction || "" }), {});
        window.localStorage.setItem("draft_instructions", JSON.stringify(instMap));
      } catch { /* noop */ }
    }, 500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [input, cards]);

  // Keyboard Shortcuts (⌘+Enter to transform, ⌘+1..4 to switch tabs / copy active card)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key === "Enter") {
        e.preventDefault();
        if (inputValid && !isRunning) {
          transformAll();
        }
      } else if (isMod && ["1", "2", "3", "4"].includes(e.key)) {
        const index = parseInt(e.key) - 1;
        if (platforms[index]) {
          e.preventDefault();
          changePlatform(platforms[index].id, index > activeIndex ? "next" : "prev");
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [inputValid, isRunning, cards, activeIndex, input, tone]);

  function updateCard(platform: Platform, patch: Partial<CardState>) {
    setCards((current) => current.map((card) => card.platform === platform ? { ...card, ...patch } : card));
  }

  function handleChipClick(platform: Platform, chipText: string) {
    const card = cards.find((c) => c.platform === platform);
    const existing = (card?.instruction || "").trim();
    if (existing.includes(chipText)) {
      setOpenInstructions(platform);
      return;
    }
    const updated = existing ? `${existing}. ${chipText}` : chipText;
    updateCard(platform, { instruction: updated });
    setOpenInstructions(platform);
  }

  class GenerationError extends Error {
    code?: string;
    retryAfterSeconds?: number;

    constructor(message: string, code?: string, retryAfterSeconds?: number) {
      super(message);
      this.name = "GenerationError";
      this.code = code;
      this.retryAfterSeconds = retryAfterSeconds;
    }
  }

  async function request(platform: Platform, instruction = "", signal?: AbortSignal) {
    let response: Response;
    try {
      response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, input, tone, instruction }),
        signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw error;
      }
      throw new GenerationError("The app could not reach the generation service. Check your connection and retry.", "network");
    }

    const data = (await response.json().catch(() => ({}))) as {
      content?: string;
      error?: string;
      code?: string;
      retryAfterSeconds?: number;
    };
    if (!response.ok || !data.content) {
      throw new GenerationError(data.error || "Generation failed.", data.code, data.retryAfterSeconds);
    }
    return data.content;
  }

  function cancelTransform() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setToast("Generation cancelled. Kept partial results.");
      setTimeout(() => setToast(""), 2200);
    }
  }

  async function transformAll() {
    if (!inputValid || isRunning || selectedPlatforms.length === 0) return;
    activeHistoryId.current = null;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsRunning(true);
    setQueueCount(0);
    setCards((current) => current.map((card) => selectedPlatforms.includes(card.platform) ? { ...card, status: "queued" } : card));
    const outputs: Output[] = [];
    const targetCards = cards.filter((card) => selectedPlatforms.includes(card.platform));

    for (let idx = 0; idx < targetCards.length; idx++) {
      const card = targetCards[idx];
      if (controller.signal.aborted) break;

      // Auto-focus active card with smooth right-to-left slide transition
      changePlatform(card.platform, "next");

      try {
        updateCard(card.platform, { status: "loading" });
        const [content] = await Promise.all([
          request(card.platform, card.instruction || "", controller.signal),
          new Promise((r) => setTimeout(r, 2400)),
        ]);
        outputs.push({ platform: card.platform, content, instruction: card.instruction });
        updateCard(card.platform, { content, status: "success" });

        // Pause between multi-card iterations
        if (idx < targetCards.length - 1 && !controller.signal.aborted) {
          await new Promise((r) => setTimeout(r, 1500));
        }
      } catch (error) {
        if (controller.signal.aborted) {
          updateCard(card.platform, { status: "idle" });
          break;
        }
        updateCard(card.platform, { status: "error", error: error instanceof Error ? error.message : "Generation failed", retryAfterSeconds: error instanceof GenerationError ? error.retryAfterSeconds : undefined, retryAt: error instanceof GenerationError && error.retryAfterSeconds ? Date.now() + error.retryAfterSeconds * 1000 : undefined });
      }
      setQueueCount((current) => current + 1);
    }

    // Revert remaining queued/loading cards to idle on cancel or finish
    setCards((current) => current.map((c) => (c.status === "queued" || c.status === "loading" ? { ...c, status: "idle" } : c)));

    if (outputs.length) {
      const session: HistoryItem = { id: crypto.randomUUID(), timestamp: Date.now(), inputText: input, outputs };
      activeHistoryId.current = session.id;
      setHistory((current) => {
        const next = [session, ...current].slice(0, 5);
        try { window.localStorage.setItem("history", JSON.stringify(next)); } catch { /* noop */ }
        return next;
      });
    }
    setIsRunning(false);
    abortControllerRef.current = null;
  }

  async function regenerate(card: CardState) {
    if (card.status === "loading" || isRunning || (card.retryAt ? card.retryAt > Date.now() : false)) return;
    updateCard(card.platform, { status: "loading", error: undefined, retryAfterSeconds: undefined, retryAt: undefined });
    try {
      const [content] = await Promise.all([
        request(card.platform, card.instruction || ""),
        new Promise((r) => setTimeout(r, 2400)),
      ]);
      updateCard(card.platform, { content, status: "success" });
      if (activeHistoryId.current) {
        setHistory((current) => {
          const next = current.map((item) => item.id === activeHistoryId.current
            ? { ...item, outputs: item.outputs.some((output) => output.platform === card.platform)
              ? item.outputs.map((output) => output.platform === card.platform ? { ...output, content, instruction: card.instruction } : output)
              : [...item.outputs, { platform: card.platform, content, instruction: card.instruction }] }
            : item);
          try { window.localStorage.setItem("history", JSON.stringify(next)); } catch { /* noop */ }
          return next;
        });
      } else {
        const target = history[0]?.inputText === input ? history[0] : null;
        if (target) {
          activeHistoryId.current = target.id;
          setHistory((current) => {
            const next = current.map((item) => item.id === target.id
              ? { ...item, outputs: item.outputs.some((output) => output.platform === card.platform)
                ? item.outputs.map((output) => output.platform === card.platform ? { ...output, content, instruction: card.instruction } : output)
                : [...item.outputs, { platform: card.platform, content, instruction: card.instruction }] }
              : item);
            try { window.localStorage.setItem("history", JSON.stringify(next)); } catch { /* noop */ }
            return next;
          });
        } else {
          const session: HistoryItem = { id: crypto.randomUUID(), timestamp: Date.now(), inputText: input, outputs: [{ platform: card.platform, content, instruction: card.instruction }] };
          activeHistoryId.current = session.id;
          setHistory((current) => {
            const next = [session, ...current].slice(0, 5);
            try { window.localStorage.setItem("history", JSON.stringify(next)); } catch { /* noop */ }
            return next;
          });
        }
      }
    } catch (error) {
      updateCard(card.platform, { status: "error", error: error instanceof Error ? error.message : "Generation failed", retryAfterSeconds: error instanceof GenerationError ? error.retryAfterSeconds : undefined, retryAt: error instanceof GenerationError && error.retryAfterSeconds ? Date.now() + error.retryAfterSeconds * 1000 : undefined });
    }
  }

  async function copyCard(card: CardState) {
    if (!card.content) return;
    try {
      await navigator.clipboard.writeText(card.content);
      setCopied(card.platform);
      setToast(`${platforms.find((platform) => platform.id === card.platform)?.label} copied to clipboard`);
      setTimeout(() => setCopied(null), 1800);
      setTimeout(() => setToast(""), 1800);
    } catch {
      setToast("Clipboard access is unavailable. Select and copy the draft manually.");
      setTimeout(() => setToast(""), 3000);
    }
  }

  const activeCard = useMemo(() => cards.find((c) => c.platform === activePlatform) || cards[0], [cards, activePlatform]);
  const activePlatformInfo = useMemo(() => platforms.find((p) => p.id === activePlatform) || platforms[0], [activePlatform]);
  const words = useMemo(() => countWords(activeCard.content), [activeCard.content]);
  const retryWait = activeCard.retryAt ? Math.max(0, Math.ceil((activeCard.retryAt - retryClock) / 1000)) : 0;
  const isOpen = openInstructions === activePlatform;
  const deferredQuery = useDeferredValue(searchQuery);

  // Pre-indexed searchable text per session (computed once on history change)
  const searchIndex = useMemo(() => {
    return new Map<string, string>(
      history.map((item) => [
        item.id,
        `${item.inputText} ${item.outputs.map((o) => o.content).join(" ")}`.toLowerCase(),
      ])
    );
  }, [history]);

  // High-performance search filter
  const filteredHistory = useMemo(() => {
    const query = deferredQuery.trim().toLowerCase();
    if (!query) return history;
    return history.filter((item) => searchIndex.get(item.id)?.includes(query));
  }, [history, deferredQuery, searchIndex]);

  // Group sessions by day for the archive wall
  const historyGroups = useMemo(() => {
    const groups: { label: string; items: HistoryItem[] }[] = [];
    for (const item of filteredHistory) {
      const label = dayLabelOf(item.timestamp);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(item);
      else groups.push({ label, items: [item] });
    }
    return groups;
  }, [filteredHistory]);

  return (
    <main className="shell">
      {/* Clean Header */}
      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="Omnidraft Home">
          <span className="refractor-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <line x1="2" y1="12" x2="8" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <polygon points="12,5 16,12 12,19 8,12" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <line x1="16" y1="10" x2="22" y2="6" className="beam beam-li" strokeWidth="1.75" strokeLinecap="round" />
              <line x1="16" y1="11.5" x2="22" y2="10" className="beam beam-x" strokeWidth="1.75" strokeLinecap="round" />
              <line x1="16" y1="12.5" x2="22" y2="14" className="beam beam-em" strokeWidth="1.75" strokeLinecap="round" />
              <line x1="16" y1="14" x2="22" y2="18" className="beam beam-db" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </span>
          <span className="wordmark-text">
            <strong>OMNIDRAFT</strong>
          </span>
        </a>
        <div className="topbar-actions">
          <button className="topbar-history-btn" onClick={() => setShowHistoryDrawer(true)} aria-label="View saved rooms">
            <Icon name="clock" size={14} /> Saved Rooms ({history.length})
          </button>
        </div>
      </header>

      {/* 50/50 Split Studio Deck Workspace */}
      <section className="workspace-split" aria-label="Content transformation workspace">
        {/* Left Pane: Source Input & Controls */}
        <div className="pane-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">source material</p>
              <h2>Raw Content</h2>
            </div>
            <span className="autosave"><Icon name="check" size={14} /> autosaved</span>
          </div>

          <div className={"source-editor " + (!inputValid && input.length > 0 ? "has-error" : "")}>
            <textarea
              id="source-content"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Paste a draft, meeting note, launch idea, or half-formed thought here…"
              aria-label="Source content"
              aria-describedby="source-help"
              aria-invalid={input.length > 0 && !inputValid}
            />
            <div className="editor-footer">
              <span className={wordCount > 2000 ? "warning-text" : "muted-text"}>{wordCount.toLocaleString()} words{wordCount > 2000 ? " · shorter input works better" : ""}</span>
              <span id="source-help" className={input.length > 0 && !inputValid ? "error-text" : "muted-text"}>
                {input.length > 0 && !inputValid ? <>Add {20 - wordCount} more {20 - wordCount === 1 ? "word" : "words"} to continue.</> : "Minimum 20 words"}
              </span>
            </div>
          </div>

          <div className="tone-block">
            <h3>Tone Tuning</h3>
            <div className="tone-options" ref={toneOptionsRef} role="radiogroup" aria-label="Tone">
              {(["Professional", "Casual", "Funny"] as Tone[]).map((option) => (
                <label key={option} className={tone === option ? "tone-option active" : "tone-option"}>
                  <input type="radio" name="tone" value={option} checked={tone === option} onChange={() => setTone(option)} />
                  {option}
                </label>
              ))}
              <span className="tone-thumb" ref={toneThumbRef} aria-hidden="true" />
            </div>
          </div>

          <div className="target-block">
            <h3>Target Formats</h3>
            <div className="target-options" role="group" aria-label="Target formats to generate">
              {platforms.map((p) => {
                const active = selectedPlatforms.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`target-chip ${active ? "active" : ""}`}
                    onClick={() => togglePlatform(p.id)}
                    aria-pressed={active}
                  >
                    <span className={`sigil-dot ${p.id}`} />
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="action-row">
            {isRunning ? (
              <button className="primary-button cancel-button" onClick={cancelTransform}>
                <span className="spinner" /> Cancel (generating {queueCount + 1} of {selectedPlatforms.length})
              </button>
            ) : (
              <button className="primary-button" disabled={!inputValid || selectedPlatforms.length === 0} onClick={transformAll}>
                Transform {selectedPlatforms.length === platforms.length ? "all formats" : `(${selectedPlatforms.length})`} <Icon name="arrow" size={16} />
              </button>
            )}
            <span className="action-hint"><span className="kbd-badge">⌘ + Enter</span> to transform</span>
          </div>
        </div>

        {/* Right Pane: Single Active Output Deck Container */}
        <div className="pane-card deck-pane">
          {/* Clean Deck Header: Single Active Platform Name + Navigation Controls */}
          <div className="deck-header-clean">
            <div className="deck-title-group">
              <h3>{activePlatformInfo.label}</h3>
              <p className="deck-subtitle">{activePlatformInfo.description}</p>
            </div>

            <div className="deck-nav-controls">
              <div className="deck-indicator-dots" aria-label="Platform indicators">
                {platforms.map((p, idx) => (
                  <button
                    key={p.id}
                    className={`dot-btn ${activePlatform === p.id ? "active" : ""}`}
                    onClick={() => changePlatform(p.id, idx > activeIndex ? "next" : "prev")}
                    aria-label={`Switch to ${p.label}`}
                  />
              ))}
            </div>

              <button
                className="nav-arrow-btn"
                disabled={activeIndex === 0}
                onClick={() => changePlatform(platforms[activeIndex - 1].id, "prev")}
                aria-label="Previous platform"
              >
                <Icon name="left" size={16} />
              </button>
              <button
                className="nav-arrow-btn"
                disabled={activeIndex === platforms.length - 1}
                onClick={() => changePlatform(platforms[activeIndex + 1].id, "next")}
                aria-label="Next platform"
              >
                <Icon name="right" size={16} />
              </button>
            </div>
          </div>

          {/* Active Card Surface with Swipe Animation */}
          <div key={activePlatform} className={`output-surface status-${activeCard.status} ${slideAnim}`}>
            {activeCard.status === "loading" || activeCard.status === "error" ? (
              <div className="card-topline-clean">
                <span className="card-status-clean">
                  {activeCard.status === "loading" ? <><span className="mini-spinner" /> drafting</> : "needs retry"}
                </span>
              </div>
            ) : null}

            <div className="card-content">
              {activeCard.status === "loading" ? (
                <div className="typewriter-container">
                  <div className="typewriter">
                    <div className="slide"><i /></div>
                    <div className="paper" />
                    <div className="keyboard" />
                  </div>
                  <p className="typewriter-caption">Drafting {activePlatformInfo.label}…</p>
                </div>
              ) : activeCard.status === "error" ? (
                <div className="card-error" role="alert">
                  <div className="card-error-header">
                    <Icon name="close" size={15} />
                    <span>{activeCard.retryAfterSeconds ? "Rate Limit Exceeded" : "Generation Failed"}</span>
                  </div>
                  <p className="card-error-message">{activeCard.error || "Providers are temporarily unavailable across the configured models. Retry shortly."}</p>
                  {retryWait > 0 && <span className="card-error-wait">Retry available in about {retryWait} seconds.</span>}
                  <button
                    className="card-error-retry-btn"
                    disabled={retryWait > 0 || isRunning}
                    onClick={() => regenerate(activeCard)}
                  >
                    <Icon name="refresh" size={14} /> Retry this card
                  </button>
                </div>
              ) : activeCard.content ? (
                activePlatform === "linkedin" ? (
                  <p>{activeCard.content}</p>
                ) : activePlatform === "x" ? (
                  <div className="thread-stack">
                    {activeCard.content.split(/\n\n+/).filter(Boolean).map((tweet, i, arr) => (
                      <div className="tweet-bubble" key={i}>
                        <div className="tweet-bubble-header">
                          <span>Tweet {i + 1}/{arr.length}</span>
                          <button
                            className="tweet-copy-btn"
                            onClick={() => {
                              navigator.clipboard.writeText(tweet.trim());
                              setToast(`Tweet ${i + 1} copied to clipboard`);
                              setTimeout(() => setToast(""), 1800);
                            }}
                          >
                            Copy
                          </button>
                        </div>
                        <p>{tweet.trim()}</p>
                      </div>
                    ))}
                  </div>
                ) : activePlatform === "email" ? (
                  <div className="email-preview">
                    <div className="email-meta-block">
                      <div className="email-meta-row">
                        <span className="email-label">Subject</span>
                        <span className="email-value">{activeCard.content.split("\n")[0].replace(/^subject:\s*/i, "")}</span>
                      </div>
                      <div className="email-meta-row">
                        <span className="email-label">Preheader</span>
                        <span className="email-value">{activeCard.content.split("\n").filter(l => l.trim())[1]?.slice(0, 60) || "Draft snippet..."}...</span>
                      </div>
                    </div>
                    <p>{activeCard.content.split("\n").slice(1).join("\n").trim() || activeCard.content}</p>
                  </div>
                ) : activePlatform === "blog" ? (
                  <div className="blog-preview">
                    <div className="blog-header-bar">
                      <span>Markdown Preview</span>
                      <span className="reading-time">{Math.max(1, Math.ceil(words / 200))} min read</span>
                    </div>
                    <p>{activeCard.content}</p>
                  </div>
                ) : (
                  <p>{activeCard.content}</p>
                )
              ) : (
                <p className="placeholder-copy">{activeCard.status === "queued" ? `Queued for ${activePlatformInfo.label.toLowerCase()}.` : `Your ${activePlatformInfo.label.toLowerCase()} will appear here.`}</p>
              )}
            </div>

            {activeCard.status !== "loading" && activeCard.status !== "error" && activeCard.content && (
              <div className="card-meta"><span>{activeCard.content.length.toLocaleString()} chars</span><span>{words.toLocaleString()} words</span></div>
            )}

            {/* Tuning Chips */}
            <div className="tuning-chips">
              {TUNING_CHIPS.map((chip) => {
                const isAttached = (activeCard.instruction || "").includes(chip.text);
                return (
                  <button
                    key={chip.label}
                    className={`chip-button ${isAttached ? "active" : ""}`}
                    onClick={() => handleChipClick(activePlatform, chip.text)}
                    aria-pressed={isAttached}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>

            {/* Instruction Drawer */}
            <div className="instruction-drawer">
              {isOpen && (
                <input
                  id={`instruction-${activePlatform}`}
                  value={activeCard.instruction || ""}
                  onChange={(event) => updateCard(activePlatform, { instruction: event.target.value })}
                  placeholder="e.g. keep it under 100 words"
                  aria-label={`Instruction for ${activePlatformInfo.label}`}
                />
              )}
              <button className="instruction-toggle" aria-expanded={isOpen} aria-controls={`instruction-${activePlatform}`} onClick={() => setOpenInstructions(isOpen ? null : activePlatform)}>
                <Icon name="plus" size={14} /> {isOpen ? "Close instruction" : "Add instruction"}
              </button>
            </div>

            {/* Bottom Actions */}
            <div className="card-actions">
              <button className="copy-button" disabled={!activeCard.content || activeCard.status === "loading"} onClick={() => copyCard(activeCard)}>
                {copied === activePlatform ? <><Icon name="check" size={15} /> copied</> : <><Icon name="copy" size={15} /> copy draft</>}
              </button>
              <button className="regenerate-button" disabled={!activeCard.content || activeCard.status === "loading" || isRunning || retryWait > 0} onClick={() => regenerate(activeCard)}>
                <Icon name="refresh" size={15} /> regenerate
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* History Slide-Over Drawer — Private Archive Room */}
      {showHistoryDrawer && (
        <div className="history-drawer-overlay" onClick={() => setShowHistoryDrawer(false)}>
          <div 
            className={`history-drawer ${selectedSessionId ? "has-preview" : ""}`} 
            onClick={(e) => e.stopPropagation()}
          >
            {/* Left Panel — The Wall */}
            <div className="history-left-panel">
              <div className="history-drawer-header">
                <h3>
                  <span>Saved Rooms</span>
                  <span className="session-count">{history.length} room{history.length === 1 ? "" : "s"}</span>
                </h3>
                <button onClick={() => setShowHistoryDrawer(false)} aria-label="Close drawer">
                  <Icon name="close" size={22} />
                </button>
              </div>

              {/* Search Bar */}
              <div className="history-search-container">
                <input
                  type="text"
                  placeholder="Search your sessions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="history-search-input"
                  aria-label="Search saved sessions"
                />
                <span className="history-search-icon">
                  <Icon name="clock" size={16} />
                </span>
              </div>

              {/* Wall List Container */}
              <div className="history-list-container">
                {history.length === 0 ? (
                  <div className="history-empty">
                    <span className="empty-mark">“</span>
                    <p className="empty-title">Nothing hung yet.</p>
                    <p className="empty-sub">Transform one piece of content and this room will start to fill with your four platform drafts.</p>
                    <button className="primary-button" onClick={() => {
                      setShowHistoryDrawer(false);
                      const textarea = document.getElementById('source-content');
                      textarea?.focus();
                    }}>
                      <Icon name="plus" size={14} /> Hang your first draft
                    </button>
                  </div>
                ) : (
                  <div className="history-list">
                    {historyGroups.map((group) => (
                      <div className="history-day-group" key={group.label}>
                        <span className="history-day-label">{group.label}</span>
                        {group.items.map((item) => (
                          <button
                            key={item.id}
                            className={`history-item ${selectedSessionId === item.id ? 'selected' : ''}`}
                            onClick={() => setSelectedSessionId(item.id)}
                            aria-pressed={selectedSessionId === item.id}
                          >
                            <div className="history-item-top">
                              <div className="platform-sigils">
                                {item.outputs.map(output => {
                                  const platformInfo = platforms.find(p => p.id === output.platform);
                                  if (!platformInfo) return null;
                                  return (
                                    <span
                                      key={output.platform}
                                      className={`sigil ${output.platform}`}
                                      title={`${platformInfo.label}${output.instruction ? ` — ${output.instruction}` : ''}`}
                                    >
                                      <span className="sigil-dot" aria-hidden="true" />
                                      {platformInfo.short}
                                    </span>
                                  );
                                })}
                              </div>
                              <span className="history-item-time">
                                {new Date(item.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>

                            <p className="history-item-title">{item.inputText.slice(0, 80)}{item.inputText.length > 80 ? "…" : ""}</p>

                            <div className="history-item-plaque">
                              <span className="plaque-marker">viewing</span>
                              <span className="plaque-date">
                                {new Date(item.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Panel — Reading Room */}
            {selectedSessionId && (() => {
              const session = selectedSession;
              if (!session) return null;
              
              return (
                <div className="history-preview-panel">
                  <div className="preview-section-header">
                    <h4 className="preview-label">Session Details</h4>
                    <button onClick={() => setSelectedSessionId(null)} className="preview-close-btn">
                      <Icon name="close" size={18} />
                    </button>
                  </div>
                  
                  <div className="preview-content">
                    <div className="preview-source-card">
                      <span className="pushpin" aria-hidden="true" />
                      <strong>Source Input</strong>
                      <p>“{session.inputText}”</p>
                    </div>
                    
                    <div className="preview-output-list">
                      {session.outputs.map((output, idx) => {
                        const platformInfo = platforms.find(p => p.id === output.platform);
                        if (!platformInfo) return null;
                        
                        return (
                          <div key={output.platform} className="output-detail-item">
                            <div className="output-detail-header">
                              <span>{platformInfo.label}</span>
                            </div>
                            <div className="output-detail-content">
                              {output.content}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      <footer className="footer"><span>content repurposer / 2026</span><span>your words stay in this browser <span className="footer-dot">◆</span></span><span><Icon name="spark" size={14} /> built for the long game</span></footer>
      {toast && <div className="toast" role="status" aria-live="polite"><Icon name="check" size={15} /> {toast}</div>}
    </main>
  );
}