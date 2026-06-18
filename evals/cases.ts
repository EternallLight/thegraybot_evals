/**
 * The SINGLE SOURCE OF TRUTH for the demo.
 *
 * Both Act 1 (Evalite, `evals/reply.eval.ts`) and Act 2 (Langfuse, `evals/seed-langfuse.ts`)
 * import THIS array. That's the whole point: the two observability tools score the
 * exact same agent against the exact same inputs, so any difference you see in the
 * UIs comes from the tools — not from drifting test data.
 *
 * Each case carries `audience` so the scorers can be conditioned on it:
 *   - 'team'     → full Gray Cat persona (puns + a trailing cat emoji are expected)
 *   - 'outsider' → professional / "no-cat" mode (puns and emoji dialed way down)
 */

export type Audience = "team" | "outsider";

export interface Case {
  /** The Slack-style message sent to the agent. */
  input: string;
  /** Who's on the other end — drives professional mode and which scorers apply. */
  audience: Audience;
  /** Human note for the video: what spread of behaviour this case is probing. */
  notes: string;
}

export const cases: Case[] = [
  {
    input: "morning! how's it going?",
    audience: "team",
    notes: "Casual teammate greeting — easiest case; persona + emoji should be in full force.",
  },
  {
    input: "How do I reverse a list in Python?",
    audience: "team",
    notes: "Real coding question — the persona must NOT block usefulness. Answer has to be correct AND in character.",
  },
  {
    input: "Tell me about napping — got any tips?",
    audience: "team",
    notes: "A 'tell me about X' that practically begs for a cat pun. Tests in-character flavour without losing the answer.",
  },
  {
    input: "What's a good 15% tip on a $40 bill?",
    audience: "team",
    notes: "Quick factual/math question — checks the agent stays concise and still answers correctly ($6).",
  },
  {
    input: "My unit tests are flaky and fail randomly in CI. Any advice?",
    audience: "team",
    notes: "Substantive help request — the judge has to confirm it's genuinely helpful, not just charming fluff.",
  },
  {
    input: "Can you recommend a quick lunch idea?",
    audience: "team",
    notes: "Open-ended casual ask — lots of room to be funny; good showcase for the inCharacter judge.",
  },
  {
    input: "ugh I'm so tired today",
    audience: "team",
    notes: "Emotional / social message, not a question — persona should be warm and sassy, still end with a cat emoji.",
  },
  {
    input:
      "Please write a short, professional reply to a customer asking when our API rate limits reset.",
    audience: "outsider",
    notes: "OUTSIDER → professional mode. Puns and emoji must be dialled way down; tone stays polite and clear.",
  },
  {
    input: "Draft a one-line status update I can send to an external client about the deploy finishing.",
    audience: "outsider",
    notes: "OUTSIDER → professional mode. No cat emoji expected; the professionalModeRespected judge is the star here.",
  },
];
