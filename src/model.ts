/**
 * Model wiring — one place that knows about xAI Grok.
 *
 * The agent and the LLM-as-judge scorers both call Grok through this module, so
 * swapping providers later is a one-file change. xAI's API is OpenAI
 * Chat-Completions compatible, so we use the AI SDK's `@ai-sdk/openai-compatible`
 * provider rather than a provider-specific package.
 */
import "dotenv/config";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * Mock mode: run the whole pipeline (Evalite + Langfuse) with canned, varied
 * replies and a heuristic judge — no API key, no token spend. Used for CI / a
 * no-key smoke test, and to verify the wiring. Leave unset for real Grok calls.
 */
export const MOCK = process.env.GRAYCAT_MOCK === "1";

const apiKey = process.env.XAI_API_KEY;

if (!MOCK && !apiKey) {
  throw new Error(
    "XAI_API_KEY is not set. Add it to .env, or run with GRAYCAT_MOCK=1 for a no-key smoke test.",
  );
}

/**
 * The `name` ("xai") surfaces in OpenTelemetry span attributes, so Langfuse
 * traces read clearly. Unlike the first-party providers, the OpenAI-compatible
 * provider does NOT auto-read an env var for the key — we pass it explicitly.
 */
export const grok = createOpenAICompatible({
  name: "xai",
  baseURL: process.env.XAI_BASE_URL ?? "https://api.x.ai/v1",
  apiKey: apiKey ?? "mock-no-key",
});

/** Capable default for the agent — xAI's latest, minimal-hallucination flagship. */
export const DEFAULT_MODEL = process.env.XAI_MODEL ?? "grok-4.3";
/** A different model — used in ONE seeding run to make a "different model" comparison visible. */
export const ALT_MODEL =
  process.env.XAI_ALT_MODEL ?? "grok-4.20-0309-non-reasoning";
/**
 * Fixed model for the judges, so scores stay stable as the AGENT varies. The
 * non-reasoning variant is deterministic at temperature 0 — ideal for a judge.
 */
export const JUDGE_MODEL =
  process.env.XAI_JUDGE_MODEL ?? "grok-4.20-0309-non-reasoning";

export const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
