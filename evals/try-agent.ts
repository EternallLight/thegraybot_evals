/**
 * Quick smoke test: run a few cases through the agent and print the replies.
 *
 * With the Langfuse instrumentation loaded (first import) and a real XAI_API_KEY,
 * each reply also ships a trace to Langfuse — the "run the agent, see a trace land" step.
 * (Under GRAYCAT_MOCK=1 there's no real LLM call, so no agent trace is produced — use
 * `pnpm seed:langfuse` to populate the dashboard in mock mode.)
 *
 *   pnpm try
 */
import "./instrumentation";
import { flushTelemetry } from "./instrumentation";
import { reply } from "../src/agent";
import { cases } from "./cases";

async function main(): Promise<void> {
  const sample = cases.slice(0, 4);
  for (const c of sample) {
    const out = await reply(c.input, { audience: c.audience });
    console.log(`\n[${c.audience}] ${c.input}\n→ ${out}`);
  }
  await flushTelemetry();
}

main().catch(async (err) => {
  console.error(err);
  await flushTelemetry().catch(() => {});
  process.exit(1);
});
