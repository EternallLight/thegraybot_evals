# The Gray Cat — LLM Evals Demo 🐱

A tiny, reproducible demo for a video about **LLM evals**. One persona chatbot — *The
Gray Cat* — gets scored by two tools watching the **same agent** on the **same cases**:

- **Act 1 — [Evalite](https://evalite.dev):** a local eval runner + UI. The smaller section.
- **Act 2 — [Langfuse](https://langfuse.com) (self-hosted):** an observability dashboard with
  per-test drill-down and trends over time. The main event.

### The teaching point

The Gray Cat replies in character: punny, feline, concise, British-Shorthair-sassy. Some
things about its replies you can check with a **regex** — *"does it end with a cat emoji?"*,
*"is it short enough?"*. But *"is it **convincingly in character** while still answering the
question?"* can't be a regex. That needs an **LLM-as-judge**. This repo shows both kinds of
scorer side by side, and uses the observability tools to watch the fuzzy LLM-judge scores
move over time — including a run where we deliberately **weaken the persona** and watch the
`inCharacter` score drop.

---

## What powers it

| Piece | Choice | Notes |
|---|---|---|
| Agent + judges | **xAI Grok** via the Vercel AI SDK | OpenAI-compatible endpoint; one cheap model |
| Eval runner | **Evalite** (UI on **http://localhost:3006**) | SQLite run-history is automatic |
| Dashboard | **Self-hosted Langfuse** (UI on **http://localhost:3000**) | official docker-compose |
| Language | TypeScript + Node 20+, `tsx`, `pnpm` | ESM |

> **Why Grok and not Claude/OpenAI?** A Claude Code or ChatGPT *product subscription* can't
> power programmatic API calls — those need a pay-per-token API key. This demo uses xAI
> Grok (cheap, OpenAI-compatible). Swapping providers is a one-file change in `src/model.ts`.

### Pinned versions

```
ai 5.0.203 · @ai-sdk/openai-compatible 1.0.40 · zod 3.25.76
@langfuse/otel 5.4.1 · @langfuse/client 5.4.1 · @langfuse/tracing 5.4.1
@opentelemetry/sdk-node 0.207.0
evalite 0.19.0 · vitest 4.0.18 · tsx 4.20.6 · typescript 5.9.3
Langfuse server: docker image langfuse/langfuse:3
```

### Cost

Tiny. A full Langfuse seed is ~10 cases × 5 runs ≈ 50 short agent calls + ~100 short
LLM-judge calls of a few hundred tokens each. On Grok that's **well under $0.30 per full
sweep** — effectively pennies. (Prices drift; check [x.ai/api](https://x.ai/api).)
Or run everything **free** with no API key in **mock mode** (see below).

---

## Prerequisites

- **Node 20+** and **pnpm** (`npm i -g pnpm`)
- **Docker** + Docker Compose (for Act 2). The Langfuse stack is **6 containers**
  (web, worker, Postgres, ClickHouse, Redis, MinIO) — budget **~4 GB RAM**, 6–8 GB comfortable.
- An **xAI API key** ([console.x.ai](https://console.x.ai/)) — *optional*
  if you only want the no-cost mock run.

---

## Repo layout

```
src/                  ← the agent under test
  persona.ts          ← Gray Cat system prompts + allowed emoji set
  model.ts            ← xAI Grok provider + mock flag
  agent.ts            ← reply()  — THE AGENT UNDER TEST (shared by both tools)
evals/                ← everything that measures / observes the agent
  cases.ts            ← the ~9 shared cases (single source of truth)
  scorers.ts          ← deterministic + LLM-as-judge scorers (shared by both tools)
  reply.eval.ts       ← Act 1: the Evalite eval
  instrumentation.ts  ← Act 2: Langfuse OpenTelemetry span processor
  seed-langfuse.ts    ← Act 2: dataset experiment, multiple runs, scores
  try-agent.ts        ← quick "run the agent, see a trace" helper
langfuse/
  docker-compose.yml  ← official Langfuse stack (demo creds pre-filled)
```

The agent (`src/agent.ts`), the cases (`evals/cases.ts`), and the scorers (`evals/scorers.ts`)
are **shared**. Evalite and Langfuse are just two lenses on the same three files.

---

## 0 · Setup (once)

```bash
pnpm install
cp .env.example .env
# then edit .env: put your XAI_API_KEY in (or set GRAYCAT_MOCK=1 for a no-key run)
```

> **No key? Mock mode.** Set `GRAYCAT_MOCK=1` in `.env`. The whole pipeline runs with canned,
> varied replies and a heuristic judge — zero tokens, zero dollars. Great for a dry run; the
> real persona/judge behaviour needs a key.

**What you should see:** `pnpm install` finishes; `pnpm typecheck` (optional) prints nothing
and exits 0.

---

## Act 1 · Evalite (local) 🧪

```bash
pnpm eval          # runs the evals AND opens the UI (watch mode)
```

Open **http://localhost:3006**.

**What you should see:**
- Two eval suites: **"Gray Cat — team (full persona)"** and **"Gray Cat — outsider
  (professional mode)"**.
- Each case shows the agent's reply and a row of scores: the deterministic ones
  (`endsWithCatEmoji`, `concise`, `noMarkdownHeaders`, `noMetaOrSignature`) and the
  LLM-judge ones (`inCharacter`, `helpful`, `professionalModeRespected`).
- Click a case → see each scorer's score and the judge's reasoning in metadata.
- Run it again (`pnpm eval:ci`) and the UI's history grows — run-to-run scores are persisted
  to a local SQLite DB automatically (`node_modules/.evalite/cache.sqlite`).

```bash
pnpm eval:ci       # one-shot run, no UI (what you'd run in CI)
```

---

## Act 2 · Langfuse (self-hosted dashboard) 📊

### 2.1 — Bring up the stack

```bash
cd langfuse
docker compose up -d        # first run pulls ~several GB; give it a few minutes
docker compose ps           # wait until langfuse-web is healthy
cd ..
```

Open **http://localhost:3000**.

**What you should see:** the Langfuse UI. This demo's compose **auto-creates** a project
(*Gray Cat Evals*) and API keys on first boot, so you can go straight to seeding. Log in with
the demo account if prompted:

```
email:    demo@graycat.local
password: graycatdemo
```

> **Prefer creating keys yourself?** (Good B-roll.) Sign up in the UI → create an Organization
> → create a Project → **Settings → API Keys → Create**. Paste the `pk-lf-…` / `sk-lf-…` into
> `.env` as `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY`. Otherwise the demo keys already in
> `.env.example` match the auto-created project.

> ⚠️ The credentials baked into `langfuse/docker-compose.yml` are **demo-only**, for a local
> throwaway stack. Never use them in production or expose this stack to the internet.

### 2.2 — Run the agent (see a trace land)

With a real `XAI_API_KEY` in `.env`:

```bash
pnpm try
```

**What you should see:** four replies printed in the terminal, and — in Langfuse →
**Tracing → Traces** — new `graycat-reply` traces, each showing the Grok call, the
prompt/response, token usage, and the `audience`/`model` metadata.

### 2.3 — Seed history (the main event)

```bash
pnpm seed:langfuse          # default 5 runs; RUNS=8 pnpm seed:langfuse for a longer trend
```

This runs the shared cases through the shared agent **5 times**, varying each run:
one run uses a **different model**, and the **last run uses a deliberately weakened persona**.
Each run's scores are pushed to Langfuse as a **dataset experiment**.

**What you should see** in Langfuse → **Datasets → `graycat-cases` → Runs**:
- **Multiple runs** listed (`baseline-…`, `alt-model-…`, `weakened-persona-…`).
- **Per-test drill-down:** click a run → each case → its trace + the per-scorer scores.
- **A trend-over-time chart:** the average `inCharacter` score across runs, with a **visible
  dip on the weakened-persona run** — the deterministic scorers barely move, but the LLM judge
  notices the personality is gone. *That's the whole point.*

---

## Mock mode (no API key, no cost)

Set `GRAYCAT_MOCK=1` in `.env` and run any command above. The agent returns canned, varied
replies and the judges use a heuristic. The full wiring is exercised — Evalite scores, Langfuse
dataset runs, scores, and the weakened-run dip all populate — without spending a token. (In
mock mode there's no real LLM call, so `pnpm try` won't produce agent traces; use
`pnpm seed:langfuse` to populate the dashboard.)

## Langfuse Cloud fallback

Don't want to run 6 containers? Use the free tier. In `.env`, swap the base URL and use cloud
keys (create a project at the cloud URL):

```
LANGFUSE_BASE_URL=https://us.cloud.langfuse.com   # or https://cloud.langfuse.com (EU)
LANGFUSE_PUBLIC_KEY=pk-lf-…                        # from the cloud project
LANGFUSE_SECRET_KEY=sk-lf-…
```

Nothing else changes. (Self-host is the primary path — the narrative is "data stays in-house".)

---

## The scorers — deterministic vs LLM-as-judge

| Scorer | Kind | Applies to | What it checks |
|---|---|---|---|
| `endsWithCatEmoji` | deterministic | team | Ends with one of 🐱 😼 😸 😺 😹 |
| `concise` | deterministic | all | Reply ≤ 600 chars |
| `noMarkdownHeaders` | deterministic | all | No leading `#` header lines |
| `noMetaOrSignature` | deterministic | all | No "as an AI" / sign-offs |
| `inCharacter` | **LLM judge** | team | Convincingly Gray-Cat *while* answering |
| `helpful` | **LLM judge** | all | Actually addresses the message |
| `professionalModeRespected` | **LLM judge** | outsider | Dialled cat-ness down, stayed polite |

The deterministic scorers are cheap and objective. The **judge** scorers exist precisely
because you can't write `/charming/` — "in character" is a judgement call, so we ask another
LLM. They're the fuzzy, occasionally-wrong scores that observability is built to watch. The
conditioning (which scorer runs on team vs outsider) is defined once in `evals/scorers.ts`.

---

## Teardown

```bash
cd langfuse && docker compose down        # stop containers (keep data in volumes)
docker compose down -v                    # also delete all Langfuse data volumes
```

## Troubleshooting

- **`XAI_API_KEY is not set`** — add it to `.env`, or set `GRAYCAT_MOCK=1`.
- **Langfuse web not loading** — `docker compose ps`; ClickHouse/Postgres take a bit to go
  healthy on first boot. `docker compose logs -f langfuse-web`.
- **No trend line** — you need ≥2 runs of the same dataset (the seed does 5). Re-run
  `pnpm seed:langfuse` to add more points.
- **Spans missing in Langfuse** — a short script must flush before exit; the seed/`try`
  scripts call `flushTelemetry()` for you. Confirm `LANGFUSE_BASE_URL` (with the underscore).
- **Wrong Grok model id** — confirm what's enabled on your account:
  `curl https://api.x.ai/v1/models -H "Authorization: Bearer $XAI_API_KEY"`.

😸 Generated with The Gray Cat
