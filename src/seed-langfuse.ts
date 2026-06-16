/**
 * ACT 2 — LANGFUSE (the main event).
 *
 * Runs the shared cases through the shared `reply` agent MULTIPLE times as a Langfuse
 * "dataset experiment", pushing the shared scorers as numeric scores. Because each
 * run has a unique name, the dashboard shows:
 *   - per-test drill-down (click a run → its items → each item's trace + scores), and
 *   - a trend-over-time chart across runs.
 *
 * Runs are deliberately VARIED so the trend isn't flat:
 *   - one run uses a different model (ALT_MODEL),
 *   - the LAST run uses a WEAKENED persona prompt, so `inCharacter` visibly DROPS.
 *
 *   pnpm seed:langfuse        # default 5 runs
 *   RUNS=8 pnpm seed:langfuse # more points on the trend
 *
 * NOTE: the instrumentation import MUST be first so OTel is running before any LLM call.
 */
import "./instrumentation";
import { flushTelemetry } from "./instrumentation";
import { LangfuseClient } from "@langfuse/client";
import { cases, type Audience } from "./cases";
import { reply } from "./agent";
import { SCORERS, applies } from "./scorers";
import { DEFAULT_MODEL, ALT_MODEL, MOCK } from "./model";

const DATASET = "graycat-cases";
const RUNS = Number(process.env.RUNS ?? 5);
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");

interface DatasetItemInput {
  message: string;
  audience: Audience;
  notes: string;
}

interface RunConfig {
  label: string;
  model: string;
  weakened: boolean;
}

/** index 1 = different model; last run = weakened persona (the visible trend dip). */
function runConfig(i: number, total: number): RunConfig {
  if (i === total - 1) return { label: "weakened-persona", model: DEFAULT_MODEL, weakened: true };
  if (i === 1) return { label: "alt-model", model: ALT_MODEL, weakened: false };
  return { label: "baseline", model: DEFAULT_MODEL, weakened: false };
}

async function ensureDataset(langfuse: LangfuseClient): Promise<void> {
  // Idempotent: creating an existing dataset/item just no-ops or upserts by id.
  try {
    await langfuse.api.datasets.create({ name: DATASET, description: "Gray Cat persona eval cases (shared with Evalite)." });
  } catch {
    /* already exists */
  }
  for (const [idx, c] of cases.entries()) {
    const input: DatasetItemInput = { message: c.input, audience: c.audience, notes: c.notes };
    try {
      await langfuse.api.datasetItems.create({
        datasetName: DATASET,
        id: `graycat-case-${idx}`, // stable id → upsert, so re-runs don't duplicate items
        input,
        metadata: { notes: c.notes },
      });
    } catch (err) {
      console.warn(`  (item ${idx} create skipped: ${(err as Error).message})`);
    }
  }
}

/**
 * One Langfuse evaluator per shared scorer. Dataset item inputs come back as untyped
 * JSON (`params.input` is `any`), so we cast. A non-applicable scorer returns an empty
 * array `[]` — the Evaluator contract is `Evaluation | Evaluation[]` (NOT nullable), so
 * `[]` is the correct "no score for this item" signal.
 */
function buildEvaluators() {
  return SCORERS.map((s) => async (params: any) => {
    const input = params.input as DatasetItemInput;
    const output = String(params.output ?? "");
    if (!applies(s, input.audience)) return [];
    const r = await s.run({ message: input.message, audience: input.audience, output });
    const reasoning = typeof r.metadata?.reasoning === "string" ? r.metadata.reasoning : undefined;
    return { name: s.name, value: r.score, comment: reasoning ?? JSON.stringify(r.metadata ?? {}) };
  });
}

async function main(): Promise<void> {
  console.log(`Seeding Langfuse dataset "${DATASET}" with ${RUNS} run(s)${MOCK ? " [MOCK mode]" : ""}…`);

  const langfuse = new LangfuseClient();
  await ensureDataset(langfuse);

  const dataset = await langfuse.dataset.get(DATASET);
  const evaluators = buildEvaluators();

  for (let i = 0; i < RUNS; i++) {
    const cfg = runConfig(i, RUNS);
    const runName = `${cfg.label}-r${i + 1}-${STAMP}`;
    console.log(`\n▶ run ${i + 1}/${RUNS}: ${runName}  (model=${cfg.model}, persona=${cfg.weakened ? "weakened" : "full"})`);

    const result = await dataset.runExperiment({
      name: runName,
      description: `model=${cfg.model} persona=${cfg.weakened ? "weakened" : "full"}`,
      task: async (params: any) => {
        const input = params.input as DatasetItemInput;
        return reply(input.message, { audience: input.audience, model: cfg.model, weakened: cfg.weakened });
      },
      evaluators,
    });

    try {
      console.log(await result.format());
    } catch {
      console.log(`  run ${runName} complete.`);
    }
  }

  // Flush the dataset/score writes AND the OTel agent spans before we exit.
  try {
    await langfuse.flush();
  } catch {
    /* some SDK builds flush implicitly */
  }
  await flushTelemetry();
  console.log("\n✅ Done. Open Langfuse → Datasets → graycat-cases → Runs to see scores and the trend.");
}

main().catch(async (err) => {
  console.error(err);
  await flushTelemetry().catch(() => {});
  process.exit(1);
});
