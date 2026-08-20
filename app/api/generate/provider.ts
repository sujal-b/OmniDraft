import { NextResponse } from "next/server";

type FailureKind = "rate_limited" | "transient" | "auth" | "fatal";

type ProviderFailure = Error & {
  kind: FailureKind;
  status?: number;
  retryAfterSeconds?: number;
  model: string;
};

type Prompt = { system: string; user: string };

const nvidiaModels = [
  "nvidia/nemotron-3.5-lightning-30b-a3b",
  "nvidia/nvidia-nemotron-nano-9b-v2",
];
const modelCooldownUntil = new Map<string, number>();
const providerDeadlineMs = 28_000;

function failure(kind: FailureKind, message: string, model: string, status?: number, retryAfterSeconds?: number): ProviderFailure {
  const error = new Error(message) as ProviderFailure;
  error.kind = kind;
  error.model = model;
  error.status = status;
  error.retryAfterSeconds = retryAfterSeconds;
  return error;
}

function parseRetryAfter(value: string | null) {
  if (!value) return 15;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(1, Math.min(120, Math.ceil(seconds)));
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(1, Math.min(120, Math.ceil((date - Date.now()) / 1000)));
  return 15;
}

function isCoolingDown(model: string) {
  const until = modelCooldownUntil.get(model) ?? 0;
  if (until <= Date.now()) {
    modelCooldownUntil.delete(model);
    return false;
  }
  return true;
}

function coolDown(model: string, seconds: number) {
  modelCooldownUntil.set(model, Date.now() + seconds * 1000);
}

function isAbortError(error: unknown) {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

function containsPromptLeakage(content: string) {
  const normalized = content.toLowerCase();
  const promptMarkers = [
    "you are a senior editorial strategist",
    "platform rules:",
    "return only the finished draft",
    "do not mention these instructions",
    "<additional_instruction>",
    "</additional_instruction>",
    "<source_content>",
    "</source_content>",
    "global tone:",
  ];
  if (promptMarkers.some((marker) => normalized.includes(marker))) return true;

  if (["we need to produce", "let's draft", "now count words"].some((marker) => normalized.includes(marker))) return true;

  const processMarkers = ["draft:", "hook:", "word count:", "let's write:", "now count words"];
  const markerCount = processMarkers.filter((marker) => normalized.includes(marker)).length;
  const hasManualWordCount = /\b[\w'-]+\(\d+\)/.test(normalized);
  return markerCount >= 2 || (normalized.includes("word count:") && hasManualWordCount);
}

async function readProviderDetail(response: Response) {
  try {
    const body = (await response.json()) as { error?: { message?: string } | string; message?: string };
    if (typeof body.error === "string") return body.error;
    if (body.error && typeof body.error === "object") return body.error.message;
    return body.message;
  } catch {
    return undefined;
  }
}

type ProviderConfig = {
  label: string;
  endpoint: string;
  apiKeyEnv: string;
  extraBody?: Record<string, unknown>;
};

const nvidiaConfig: ProviderConfig = {
  label: "NVIDIA NIM",
  endpoint: "https://integrate.api.nvidia.com/v1/chat/completions",
  apiKeyEnv: "NVIDIA_API_KEY",
  extraBody: { chat_template_kwargs: { enable_thinking: false } },
};

async function callProvider(model: string, prompt: Prompt, deadline: number, config: ProviderConfig) {
  const apiKey = process.env[config.apiKeyEnv];
  if (!apiKey) throw failure("auth", config.label + " is not configured. Set " + config.apiKeyEnv + ".", model, 503);

  const remaining = deadline - Date.now();
  if (remaining < 1_000) throw failure("transient", "Generation window expired before the provider responded.", model, 504);

  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }],
        temperature: 0.7,
        max_tokens: 700,
        ...config.extraBody,
      }),
      signal: AbortSignal.timeout(Math.min(18_000, remaining)),
    });

    if (!response.ok) {
      const retryAfterSeconds = response.status === 429 ? parseRetryAfter(response.headers.get("retry-after")) : undefined;
      const detail = await readProviderDetail(response);

      if (response.status === 401 || response.status === 403) {
        throw failure("auth", config.label + " rejected the API key. Check " + config.apiKeyEnv + ".", model, response.status);
      }
      if (response.status === 429) {
        throw failure("rate_limited", config.label + " rate-limited " + model + ".", model, response.status, retryAfterSeconds);
      }
      if (response.status === 408 || response.status === 409 || response.status === 425 || response.status >= 500) {
        throw failure("transient", detail || config.label + " temporarily failed for " + model + ".", model, response.status);
      }
      throw failure("fatal", detail || config.label + " rejected the request for " + model + ".", model, response.status);
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }>; output_text?: unknown };
    const content = data.choices?.[0]?.message?.content ?? data.output_text;
    if (typeof content !== "string" || !content.trim()) throw failure("transient", config.label + " returned no content for " + model + ".", model, 502);
    const normalizedContent = content.trim();
    if (containsPromptLeakage(normalizedContent)) throw failure("transient", config.label + " returned an unusable draft for " + model + ".", model, 502);
    return normalizedContent;
  } catch (error) {
    if ((error as ProviderFailure).kind) throw error;
    if (isAbortError(error)) throw failure("transient", config.label + " timed out for " + model + ".", model, 504);
    throw failure("transient", config.label + " could not be reached.", model, 502);
  }
}

export async function generateFromNvidia(prompt: Prompt) {
  const deadline = Date.now() + providerDeadlineMs;
  let lastFailure: ProviderFailure | undefined;
  let maxRetryAfter = 15;
  let attemptedModel = false;
  let sawRateLimit = false;

  const attempts: Array<{ model: string; config: ProviderConfig }> = nvidiaModels.map((model) => ({ model, config: nvidiaConfig }));

  for (const { model, config } of attempts) {
    if (isCoolingDown(model)) {
      maxRetryAfter = Math.max(maxRetryAfter, Math.ceil(((modelCooldownUntil.get(model) ?? Date.now()) - Date.now()) / 1000));
      continue;
    }

    attemptedModel = true;
    try {
      return { content: await callProvider(model, prompt, deadline, config), model };
    } catch (error) {
      const providerError = error as ProviderFailure;
      lastFailure = providerError;
      if (providerError.kind === "auth" || providerError.kind === "fatal") throw providerError;
      if (providerError.kind === "rate_limited") {
        const wait = providerError.retryAfterSeconds ?? 15;
        sawRateLimit = true;
        coolDown(model, wait);
        maxRetryAfter = Math.max(maxRetryAfter, wait);
      }
    }
  }

  if (!attemptedModel) {
    throw failure("rate_limited", "All configured models are cooling down after rate limits.", "provider", 429, maxRetryAfter);
  }

  if (sawRateLimit) {
    throw failure(
      "rate_limited",
      "Providers are rate-limited across the available models. Wait briefly, then retry.",
      "provider",
      429,
      maxRetryAfter,
    );
  }

  if (lastFailure?.kind === "transient") {
    throw failure("transient", "Providers are temporarily unavailable across the configured models. Retry shortly.", "provider", 503);
  }

  throw failure("transient", "Providers are temporarily unavailable. Retry shortly.", "provider", 503);
}

export function providerErrorResponse(error: unknown) {
  const providerError = error as ProviderFailure;
  const status = providerError.status || 500;
  return NextResponse.json(
    {
      error: providerError.message || "Generation failed.",
      code: providerError.kind || "unknown",
      retryAfterSeconds: providerError.retryAfterSeconds,
      model: providerError.model,
    },
    { status },
  );
}
