/**
 * Model wiring — one place that knows about Moonshot Kimi.
 *
 * The agent and the LLM-as-judge scorers both call Kimi through this module, so
 * swapping providers later is a one-file change. Moonshot's API is OpenAI
 * Chat-Completions compatible, so we use the AI SDK's `@ai-sdk/openai-compatible`
 * provider rather than a provider-specific package.
 */
import "dotenv/config";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * Mock mode: run the whole pipeline (Evalite + Langfuse) with canned, varied
 * replies and a heuristic judge — no API key, no token spend. Used for CI / a
 * no-key smoke test, and to verify the wiring. Leave unset for real Kimi calls.
 */
export const MOCK = process.env.GRAYCAT_MOCK === "1";

const apiKey = process.env.MOONSHOT_API_KEY;

if (!MOCK && !apiKey) {
  throw new Error(
    "MOONSHOT_API_KEY is not set. Add it to .env, or run with GRAYCAT_MOCK=1 for a no-key smoke test.",
  );
}

/**
 * The `name` ("moonshot") surfaces in OpenTelemetry span attributes, so Langfuse
 * traces read clearly. Unlike the first-party providers, the OpenAI-compatible
 * provider does NOT auto-read an env var for the key — we pass it explicitly.
 */
export const moonshot = createOpenAICompatible({
  name: "moonshot",
  baseURL: process.env.MOONSHOT_BASE_URL ?? "https://api.moonshot.ai/v1",
  apiKey: apiKey ?? "mock-no-key",
});

/** Capable default for the agent. */
export const DEFAULT_MODEL = process.env.MOONSHOT_MODEL ?? "kimi-k2.5";
/** Cheaper/older model — used in ONE seeding run to make a "different model" comparison visible. */
export const ALT_MODEL = process.env.MOONSHOT_ALT_MODEL ?? "moonshot-v1-8k";
/** Fixed, capable model for the judges, so scores stay stable as the AGENT varies. */
export const JUDGE_MODEL = process.env.MOONSHOT_JUDGE_MODEL ?? "moonshot-v1-8k";

export const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
