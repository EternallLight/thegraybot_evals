/**
 * ACT 1 — EVALITE (the smaller section).
 *
 * Reads the shared `cases`, runs them through the shared `reply` agent, and scores
 * with the shared `SCORERS`. Run history persists to a local SQLite DB automatically
 * (evalite 0.x), so the UI shows scores per case AND history across runs.
 *
 *   pnpm eval        # runs + opens the UI at http://localhost:3006 (watch mode)
 *   pnpm eval:ci     # runs once and exits (CI)
 *
 * We declare TWO eval suites — team and outsider — so each gets exactly the scorers
 * that apply to it (e.g. endsWithCatEmoji is team-only; professionalModeRespected is
 * outsider-only). The conditioning lives in `scorers.ts` via `appliesTo`.
 */
import { evalite, createScorer } from "evalite";
import { cases, type Audience } from "./cases";
import { reply } from "./agent";
import { SCORERS, applies, type Scorer } from "./scorers";

interface EvalInput {
  message: string;
  audience: Audience;
  notes: string;
}

/** Wrap one of our shared Scorers as an Evalite scorer. */
function toEvaliteScorer(s: Scorer) {
  return createScorer<EvalInput, string>({
    name: s.name,
    description: s.description,
    scorer: async ({ input, output }) => {
      const r = await s.run({ message: input.message, audience: input.audience, output });
      return { score: r.score, metadata: r.metadata };
    },
  });
}

function dataFor(audience: Audience) {
  return async () =>
    cases
      .filter((c) => c.audience === audience)
      .map((c) => ({ input: { message: c.input, audience: c.audience, notes: c.notes } }));
}

const scorersFor = (audience: Audience) =>
  SCORERS.filter((s) => applies(s, audience)).map(toEvaliteScorer);

const task = async (input: EvalInput) => reply(input.message, { audience: input.audience });

evalite<EvalInput, string>("Gray Cat — team (full persona)", {
  data: dataFor("team"),
  task,
  scorers: scorersFor("team"),
});

evalite<EvalInput, string>("Gray Cat — outsider (professional mode)", {
  data: dataFor("outsider"),
  task,
  scorers: scorersFor("outsider"),
});
