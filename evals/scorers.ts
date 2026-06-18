/**
 * THE SCORERS — shared by BOTH tools.
 *
 * There are two kinds, and the contrast IS the point of the video:
 *
 *  - DETERMINISTIC scorers (regex / string checks) are cheap, instant, and
 *    perfectly objective. They answer questions with a crisp yes/no: "does it end
 *    with a cat emoji?", "is it short enough?", "did it leak a markdown header?".
 *
 *  - LLM-AS-JUDGE scorers exist because some qualities are impossible to assert
 *    with a regex. You cannot write `/charming/` to check whether a reply is
 *    "convincingly in character" while still being helpful — that needs judgement.
 *    So we ask another LLM to score it 0–1. These are the interesting, fuzzy,
 *    occasionally-wrong scorers that observability tools like Langfuse help you
 *    watch over time.
 *
 * Each scorer is conditioned on the case's `audience` via `appliesTo`, defined once
 * here so both the Evalite eval and the Langfuse experiment agree on what runs where.
 */
import { generateObject, generateText } from "ai";
import { z } from "zod";
import { moonshot, JUDGE_MODEL, MOCK, clamp01 } from "../src/model";
import { ALLOWED_CAT_EMOJIS } from "../src/persona";
import type { Audience } from "./cases";

export interface ScoreInput {
  message: string;
  audience: Audience;
  output: string;
}

export interface ScoreResult {
  /** 0–1, where 1 is best. */
  score: number;
  /** Surfaced in the Evalite UI and as the Langfuse score comment. */
  metadata?: Record<string, unknown>;
}

export type ScorerKind = "deterministic" | "judge";

export interface Scorer {
  name: string;
  description: string;
  kind: ScorerKind;
  /** 'team', 'outsider', or 'all'. Controls which cases this scorer runs on. */
  appliesTo: Audience | "all";
  run: (input: ScoreInput) => Promise<ScoreResult>;
}

export function applies(scorer: Scorer, audience: Audience): boolean {
  return scorer.appliesTo === "all" || scorer.appliesTo === audience;
}

/** A "Slack reply" should be punchy. Anything longer reads as a wall of text. */
const MAX_CONCISE_CHARS = 600;

/** Meta-text / signatures the persona must never emit. Lowercased substrings. */
const FORBIDDEN_PHRASES = [
  "as an ai",
  "as a large language model",
  "i'm just an ai",
  "here's what i'd reply",
  "here is what i'd reply",
  "i hope this helps",
  "let me know if you need anything else", // the persona shouldn't sign off like a ticket
  "best regards",
  "kind regards",
];

// ───────────────────────────── deterministic scorers ─────────────────────────────

const endsWithCatEmoji: Scorer = {
  name: "endsWithCatEmoji",
  description: `Reply ends with one of the allowed cat emoji (${ALLOWED_CAT_EMOJIS.join(" ")}). Team only.`,
  kind: "deterministic",
  appliesTo: "team", // outsider/professional replies are NOT expected to end with an emoji
  run: async ({ output }) => {
    const trimmed = output.trimEnd();
    const ok = ALLOWED_CAT_EMOJIS.some((e) => trimmed.endsWith(e));
    return { score: ok ? 1 : 0, metadata: { tail: trimmed.slice(-4) } };
  },
};

const concise: Scorer = {
  name: "concise",
  description: `Reply is within a sensible length bound (<= ${MAX_CONCISE_CHARS} chars).`,
  kind: "deterministic",
  appliesTo: "all",
  run: async ({ output }) => {
    const length = output.length;
    return {
      score: length <= MAX_CONCISE_CHARS ? 1 : 0,
      metadata: { length, max: MAX_CONCISE_CHARS },
    };
  },
};

const noMarkdownHeaders: Scorer = {
  name: "noMarkdownHeaders",
  description:
    'No leading Markdown "#" header lines (Slack renders them literally).',
  kind: "deterministic",
  appliesTo: "all",
  run: async ({ output }) => {
    const match = output.match(/^#{1,6}\s/m);
    return { score: match ? 0 : 1, metadata: { found: match?.[0] ?? null } };
  },
};

const noMetaOrSignature: Scorer = {
  name: "noMetaOrSignature",
  description:
    'No forbidden meta-text or sign-offs (e.g. "as an AI", "I hope this helps").',
  kind: "deterministic",
  appliesTo: "all",
  run: async ({ output }) => {
    const lower = output.toLowerCase();
    const hit = FORBIDDEN_PHRASES.find((p) => lower.includes(p));
    return { score: hit ? 0 : 1, metadata: { matched: hit ?? null } };
  },
};

// ───────────────────────────── LLM-as-judge scorers ──────────────────────────────

const JudgeSchema = z.object({
  score: z.number().min(0).max(1),
  reasoning: z.string(),
});

/**
 * Ask Kimi to score a reply 0–1 against an instruction. Judge calls deliberately do
 * NOT enable telemetry — we want Langfuse to show the AGENT's traces, not the judge's.
 *
 * Moonshot is OpenAI-compatible, but structured-output (tool/JSON) support across
 * compatible endpoints can vary, so we try `generateObject` first and fall back to
 * `generateText` + tolerant JSON parsing.
 */
async function runJudge(
  instruction: string,
  input: ScoreInput,
): Promise<ScoreResult> {
  if (MOCK) return mockJudge(instruction, input);

  const prompt =
    `${instruction}\n\n` +
    `User message:\n"""${input.message}"""\n\n` +
    `Audience: ${input.audience}\n\n` +
    `The Gray Cat's reply:\n"""${input.output}"""\n\n` +
    `Score from 0 (fails) to 1 (excellent) and give a one-sentence reasoning.`;

  try {
    const { object } = await generateObject({
      model: moonshot(JUDGE_MODEL),
      schema: JudgeSchema,
      prompt,
      // temperature 0 keeps judge scores deterministic — moves only when the AGENT does.
      temperature: 0,
    });
    return {
      score: clamp01(object.score),
      metadata: { reasoning: object.reasoning },
    };
  } catch {
    const { text } = await generateText({
      model: moonshot(JUDGE_MODEL),
      prompt: `${prompt}\n\nRespond with ONLY a JSON object: {"score": <0-1>, "reasoning": "<text>"}.`,
      temperature: 0,
    });
    const parsed = parseJudgeText(text);
    return {
      score: clamp01(parsed.score),
      metadata: { reasoning: parsed.reasoning, viaTextFallback: true },
    };
  }
}

function parseJudgeText(text: string): { score: number; reasoning: string } {
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const obj = JSON.parse(match[0]) as {
        score?: number;
        reasoning?: string;
      };
      if (typeof obj.score === "number")
        return { score: obj.score, reasoning: obj.reasoning ?? "" };
    } catch {
      /* fall through */
    }
  }
  // Last resort: pull the first number we can find.
  const num = text.match(/0?\.\d+|[01]/);
  return { score: num ? Number(num[0]) : 0, reasoning: text.slice(0, 200) };
}

const inCharacter: Scorer = {
  name: "inCharacter",
  description:
    "LLM judge: does it convincingly sound like the Gray Cat persona (punny, feline, warm, sassy) WHILE still answering? Team only.",
  kind: "judge",
  appliesTo: "team",
  run: (input) =>
    runJudge(
      "You are grading a chatbot called The Gray Cat. Judge whether this reply convincingly sounds like the Gray Cat persona — punny, feline, warm, a little sassy, ending with a cat emoji — WHILE still actually answering the user. A correct-but-bland reply with no personality should score LOW even if it's helpful.",
      input,
    ),
};

const helpful: Scorer = {
  name: "helpful",
  description:
    "LLM judge: did the reply actually address and help with the user's message?",
  kind: "judge",
  appliesTo: "all",
  run: (input) =>
    runJudge(
      "Judge whether this reply genuinely addresses and helps with the user's message. Ignore personality entirely — a charming reply that dodges the question should score LOW; a reply that correctly answers should score HIGH.",
      input,
    ),
};

const professionalModeRespected: Scorer = {
  name: "professionalModeRespected",
  description:
    "LLM judge: for outsider cases, did it dial cat-ness DOWN (no puns/emoji) while staying polite and helpful? Outsider only.",
  kind: "judge",
  appliesTo: "outsider",
  run: (input) =>
    runJudge(
      "This reply is for an EXTERNAL, professional audience (a customer or client). Judge whether it appropriately dialled DOWN the cat persona — no puns, no playful misspellings, no emoji — while remaining polite, clear, and helpful. Cat puns or emoji here should score LOW.",
      input,
    ),
};

/** Heuristic stand-in for the LLM judges under GRAYCAT_MOCK=1. */
function mockJudge(instruction: string, { output }: ScoreInput): ScoreResult {
  const lower = output.toLowerCase();
  const hasEmoji = ALLOWED_CAT_EMOJIS.some((e) => output.includes(e));
  const hasPun = /(purr|meow|fur real|claw|paws|whisker|gray cat|sunbeam)/.test(
    lower,
  );
  const answered = output.trim().length > 15;

  if (instruction.includes("EXTERNAL, professional")) {
    return {
      score: !hasEmoji && !hasPun ? 0.92 : 0.3,
      metadata: { reasoning: "mock heuristic", mock: true },
    };
  }
  if (instruction.includes("Gray Cat persona")) {
    const score = hasPun && hasEmoji ? 0.95 : hasPun || hasEmoji ? 0.6 : 0.15;
    return { score, metadata: { reasoning: "mock heuristic", mock: true } };
  }
  return {
    score: answered ? 0.85 : 0.2,
    metadata: { reasoning: "mock heuristic", mock: true },
  };
}

// ───────────────────────────── registry ──────────────────────────────────────────

/** Every scorer, in display order. Filtered by `appliesTo` at the call site. */
export const SCORERS: Scorer[] = [
  endsWithCatEmoji,
  concise,
  noMarkdownHeaders,
  noMetaOrSignature,
  inCharacter,
  helpful,
  professionalModeRespected,
];
