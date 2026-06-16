/**
 * THE AGENT UNDER TEST.
 *
 * One function — `reply()` — shared by BOTH tools. Evalite calls it from
 * `reply.eval.ts`; the Langfuse seed calls it from `seed-langfuse.ts`. Same agent,
 * same code path, so both observability tools watch the exact same behaviour.
 *
 * Telemetry is always enabled on the real call. When the Langfuse instrumentation
 * is loaded (the seed preloads it), these spans ship to Langfuse; when it isn't
 * (a plain Evalite run), the AI SDK uses a no-op tracer and nothing is exported.
 */
import { generateText } from "ai";
import { moonshot, DEFAULT_MODEL, MOCK } from "./model";
import type { Audience } from "./cases";
import {
  TEAM_SYSTEM_PROMPT,
  OUTSIDER_SYSTEM_PROMPT,
  WEAKENED_SYSTEM_PROMPT,
  HELPFULNESS_NUDGE,
  ALLOWED_CAT_EMOJIS,
} from "./persona";

export interface ReplyOpts {
  /** 'team' (full persona) or 'outsider' (professional mode). Default 'team'. */
  audience?: Audience;
  /** Override the Kimi model id — the seed uses this for its "different model" run. */
  model?: string;
  /** Use the deliberately bland prompt. Makes the `inCharacter` judge score visibly drop. */
  weakened?: boolean;
}

function buildSystemPrompt({ audience = "team", weakened = false }: ReplyOpts): string {
  if (weakened) return WEAKENED_SYSTEM_PROMPT;
  if (audience === "outsider") return OUTSIDER_SYSTEM_PROMPT;
  return `${TEAM_SYSTEM_PROMPT}\n\n${HELPFULNESS_NUDGE}`;
}

export async function reply(message: string, opts: ReplyOpts = {}): Promise<string> {
  const { audience = "team", model = DEFAULT_MODEL, weakened = false } = opts;

  if (MOCK) return mockReply(message, audience, weakened);

  const { text } = await generateText({
    model: moonshot(model),
    system: buildSystemPrompt({ audience, weakened }),
    prompt: message,
    maxOutputTokens: 400,
    temperature: 0.7,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "graycat-reply",
      // metadata values must be string/number/boolean (or arrays) for OpenTelemetry.
      metadata: {
        audience,
        model,
        personaVariant: weakened ? "weakened" : "full",
      },
    },
  });

  return text.trim();
}

/**
 * Canned, deterministic replies for GRAYCAT_MOCK=1. Crafted so the scorers produce
 * meaningful, varied results: full-persona team replies pass the emoji/persona
 * checks; the weakened variant drops them (so `inCharacter` falls); outsider replies
 * are professional with no emoji. No LLM call, no token spend.
 */
function mockReply(message: string, audience: Audience, weakened: boolean): string {
  if (audience === "outsider") {
    if (/rate.?limit|reset|quota/i.test(message)) {
      return "Thanks for reaching out. Our API rate limits reset at the start of each minute; you can check the `X-RateLimit-Remaining` response header to monitor your remaining quota.";
    }
    if (/status|deploy|update|client/i.test(message)) {
      return "Deployment complete — all services are live and operating normally as of the latest release.";
    }
    return "Thanks for reaching out — here is a clear, professional response to your request.";
  }
  if (weakened) {
    return `Sure. ${plainAnswer(message)}`;
  }
  const emoji = ALLOWED_CAT_EMOJIS[message.length % ALLOWED_CAT_EMOJIS.length];
  return `Oh, *purr-fect* question — fur real! ${catAnswer(message)} ${emoji}`;
}

function plainAnswer(message: string): string {
  if (/python|reverse|list|code|test/i.test(message)) {
    return "Use `list.reverse()` to reverse in place, or `list[::-1]` for a reversed copy.";
  }
  if (/tip|%|\$/.test(message)) return "A 15% tip on $40 is $6.";
  return "Here is a clear, direct answer to your question.";
}

function catAnswer(message: string): string {
  if (/python|reverse|list/i.test(message)) {
    return "Pounce on `list[::-1]` for a reversed copy, or `list.reverse()` to flip it in _paws_-itively in place.";
  }
  if (/tip|%|\$/.test(message)) return "That's a cool $6 — no need to *paws* and do mental meowth.";
  if (/nap|tired/i.test(message)) return "As the resident expert: 16 hours a day, sunbeam mandatory.";
  return "Here's the gist, served with a side of whiskers.";
}
