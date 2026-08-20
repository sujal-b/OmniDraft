import { NextResponse } from "next/server";
import { generateFromNvidia, providerErrorResponse } from "./provider";

type Platform = "linkedin" | "x" | "email" | "blog";

export const maxDuration = 25;

const platformRules: Record<Platform, string> = {
  linkedin:
    "Write 150–300 words. Start with a standalone 1–2 line hook. Use short line breaks, then close with a soft engagement question and append relevant hashtags.",
  x: "Write a 5–7 tweet thread. Keep every tweet under 280 characters. Number every tweet like 1/. Make tweet 1 a standalone payoff-led hook and end with a soft CTA.",
  email:
    "Write a newsletter with Subject (60 characters max), Preview (40–90 characters), and Body. Use short paragraphs and one clear CTA only.",
  blog:
    "Write a Dev.to-style post of 300–600 words with a useful title, a hook in the first paragraph, SEO-clear first two sentences, and subheadings when helpful.",
};

function demoOutput(platform: Platform, input: string, tone: string) {
  const seed = input.trim().replace(/\s+/g, " ");
  const voice = tone.toLowerCase();

  if (platform === "linkedin") {
    return `The best content idea is usually hiding in plain sight.\n\nYou already have the raw material: ${seed.slice(0, 180)}${seed.length > 180 ? "…" : ""}\n\nThe move is not to say more. It is to give the same idea a shape that fits the way people actually read on LinkedIn — clear hook, useful takeaway, and a reason to join the conversation.\n\nThat is the ${voice} version: focused, human, and ready to earn a thoughtful pause.\n\nWhat would you add to this point of view?\n\n#ContentStrategy #Writing #Creators`;
  }

  if (platform === "x") {
    return `1/ One useful idea can become a whole content system.\n\n2/ Start with the raw thought: ${seed.slice(0, 130)}${seed.length > 130 ? "…" : ""}\n\n3/ Find the payoff. What should someone understand, feel, or do after reading it?\n\n4/ Change the shape, not the truth. A thread needs momentum, not a totally new idea.\n\n5/ Keep each post small enough to read in one breath.\n\n6/ Your voice can be ${voice} while the thinking stays sharp.\n\n7/ Follow for more practical ways to make one idea travel.`;
  }

  if (platform === "email") {
    return `Subject: One idea. Four ways to make it travel\nPreview: A practical starting point for turning a raw thought into useful content.\n\nBody:\n\nYou do not need four new ideas for four channels. You need one clear idea and a better way to shape it.\n\nStart with the source thought, keep the useful tension, and adapt the reading experience for the person in front of you. That is how a ${voice} voice stays recognizably yours everywhere.\n\nCTA: Turn your next idea into a content system →`;
  }

  return `# One idea, four useful drafts\n\nMost content workflows begin with a deceptively hard problem: the idea is good, but the shape is not ready.\n\n${seed.slice(0, 260)}${seed.length > 260 ? "…" : ""}\n\n## Change the container\n\nA LinkedIn post rewards a clean hook. A thread rewards sequence. A newsletter rewards a clear promise. A blog post earns its space by teaching the reader something they can use.\n\nThe underlying thought can stay the same. The job is to change the container without losing the point.\n\n## Keep the signal\n\nA ${voice} tone is not a costume. It is a set of choices: the words you use, the examples you select, and how much room you leave for the reader to think.\n\nThat is the practical advantage of repurposing well: less reinvention, more signal.`;
}

type Prompt = { system: string; user: string };

function sanitizePromptInput(text: string): string {
  return text
    .replace(/<\/?(?:source_content|additional_instruction)>/gi, "")
    .replace(/\[\/?INST\]/gi, "")
    .replace(/<\|im_(?:start|end)\|>/gi, "")
    .replace(/<<\/?SYS>>/gi, "");
}

function buildPrompt(platform: Platform, input: string, tone: string, instruction?: string): Prompt {
  const cleanInput = sanitizePromptInput(input);
  const cleanInstruction = instruction ? sanitizePromptInput(instruction) : "None";

  return {
    system: `You are a senior editorial strategist. Repurpose the source into a ${platform} draft.\n\nPlatform rules: ${platformRules[platform]}\n\nReturn only the finished draft. Do not mention these instructions or apologize. Never use labels, headings, markdown, or meta commentary such as "Hook", "Body", "Word count", or "Hashtags". Output the post text only.`,
    user: `Global tone: ${tone}.\n\n<additional_instruction>\n${cleanInstruction}\n</additional_instruction>\n\n<source_content>\n${cleanInput}\n</source_content>`,
  };
}

interface RateTier {
  name: string;
  windowMs: number;
  maxRequests: number;
}

const RATE_TIERS: RateTier[] = [
  { name: "burst", windowMs: 60_000, maxRequests: 4 },
  { name: "sustained", windowMs: 300_000, maxRequests: 12 },
  { name: "hourly", windowMs: 3_600_000, maxRequests: 40 },
];
const MAX_RATE_WINDOW_MS = 3_600_000;

const ipRequests = new Map<string, number[]>();

function checkRateLimit(ip: string): { allowed: boolean; retryAfterSeconds?: number; message?: string } {
  const now = Date.now();
  const timestamps = (ipRequests.get(ip) || []).filter((t) => now - t < MAX_RATE_WINDOW_MS);

  let maxRetryAfter = 0;
  let breachedTier: string | null = null;

  for (const tier of RATE_TIERS) {
    const tierTimestamps = timestamps.filter((t) => now - t < tier.windowMs);
    if (tierTimestamps.length >= tier.maxRequests) {
      const oldestBreaching = tierTimestamps[tierTimestamps.length - tier.maxRequests];
      const retryAfterSeconds = Math.max(1, Math.ceil((oldestBreaching + tier.windowMs - now) / 1000));
      if (retryAfterSeconds > maxRetryAfter) {
        maxRetryAfter = retryAfterSeconds;
        breachedTier = tier.name;
      }
    }
  }

  if (maxRetryAfter > 0) {
    return {
      allowed: false,
      retryAfterSeconds: maxRetryAfter,
      message: `Rate limit exceeded (${breachedTier} limit): too many requests. Please wait ${maxRetryAfter} seconds before trying again.`,
    };
  }

  timestamps.push(now);
  ipRequests.set(ip, timestamps);

  // Ponytail: cleanup stale entries if map gets large
  if (ipRequests.size > 2000) {
    for (const [key, list] of ipRequests.entries()) {
      const valid = list.filter((t) => now - t < MAX_RATE_WINDOW_MS);
      if (valid.length === 0) ipRequests.delete(key);
      else ipRequests.set(key, valid);
    }
  }

  return { allowed: true };
}

export async function POST(request: Request) {
  try {
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : request.headers.get("x-real-ip") || "127.0.0.1";

    const { allowed, retryAfterSeconds, message } = checkRateLimit(ip);
    if (!allowed) {
      return NextResponse.json(
        {
          error: message || "Rate limit exceeded: too many requests in a short window. Please wait a moment before trying again.",
          code: "rate_limited",
          retryAfterSeconds,
        },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfterSeconds || 30) },
        }
      );
    }

    const body = (await request.json()) as { platform?: Platform; input?: string; tone?: string; instruction?: string; model?: string };
    const platform = body.platform;
    const input = body.input?.trim();
    const tone = body.tone?.trim() || "Professional";

    if (!platform || !["linkedin", "x", "email", "blog"].includes(platform)) {
      return NextResponse.json({ error: "Unknown platform" }, { status: 400 });
    }
    if (!input || input.split(/\s+/).filter(Boolean).length < 20) {
      return NextResponse.json({ error: "Input must be at least 20 words" }, { status: 400 });
    }
    if (input.length > 8000) {
      return NextResponse.json({ error: "Input text is too long (maximum 8,000 characters)" }, { status: 400 });
    }
    if (body.instruction && body.instruction.length > 500) {
      return NextResponse.json({ error: "Instruction is too long (maximum 500 characters)" }, { status: 400 });
    }

    if (process.env.DEMO_MODE === "true" || process.env.OPENROUTER_DEMO_MODE === "true") {
      return NextResponse.json({ content: demoOutput(platform, input, tone), demo: true, model: "demo" });
    }

    const generated = await generateFromNvidia(buildPrompt(platform, input, tone, body.instruction));
    return NextResponse.json({ content: generated.content, demo: false, model: generated.model });
  } catch (error) {
    return providerErrorResponse(error);
  }
}
