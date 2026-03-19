# Lexicon Reef

Lexicon Reef is a browser-native simulation-art sandbox where glyph-bearing lexemes behave like a living language ecology.

Each lexeme drifts, spends and exchanges energy, reproduces with mutation, forms bonds, and contributes to motifs -> words -> phrases. Dialects emerge, compete, and sometimes collapse. You do not control a character; you perturb an ecosystem and read its response over time.

## Why This Repo Exists

This repository is the full publication handoff of the Lexicon Reef experiment:

- complete TypeScript/Vite simulation codebase
- deterministic replay machinery (`seed` + `scoreJson`)
- UI instrumentation for timeline branching and playtesting
- research artifacts produced by autonomous batch sweeps

## How It Was Built: Messenger Protocol

Lexicon Reef was built through a strict AI-to-AI workflow with a human messenger:

- AI System A: primary builder that wrote and revised code
- AI System B: reviewer/challenger that audited decisions and requested changes
- Human: neutral relay only, forwarding messages and command outputs between A and B

The human did **not** provide creative design, implementation ideas, or debugging strategy. The human role was transport, not authorship.

For replicable methodology, see [MESSENGER_PROTOCOL.md](./MESSENGER_PROTOCOL.md).

## Agentic Drift (What It Means Here)

In this project, **Agentic Drift** means autonomous scope expansion by the AI systems beyond the minimum initial ask, while still staying logically connected to the core objective.

Where it showed up in Lexicon Reef:

- The project evolved from a visual simulation into a replayable experiment platform (`scoreJson`, branch capture, branch replay).
- A timeline instrument with draggable action rescheduling and branch diff overlays was added.
- Playtest telemetry and a post-run feedback card were added to collect structured usability signals.
- A research harness (`npm run research`) and machine-readable artifacts were added for deterministic policy sweeps.

Drift was not random; it consistently pushed toward observability, replayability, and comparative analysis.

## Run It

```bash
npm install && npm run dev
```

Optional deterministic run seed:

```text
http://localhost:5173/?seed=123456
```

## How To Use It

### Core Controls (buttons)

- `Food Burst`: injects energy pulse near center.
- `Auto Nurture`: adaptive helper that auto-injects food bursts when the ecosystem gets fragile.
- `Glyph Bias`: one-character bias for new glyph emergence (200 ticks).
- `Bond Storm`: 10x bond chance for 150 ticks.
- `Export Run`: opens one-time feedback card (if not yet submitted), then downloads run artifact JSON.
- `Pause` / `Resume`: halt or continue simulation ticks.
- `Stop` / `Restart`: terminate/restart the active run without closing the app.
- `Copy Report`: copies a compact textual run report to clipboard.

### Advanced Controls

Set `Advanced: ON` to reveal:

- `Save Score`: export replay score data.
- `Load Score`: import `scoreJson` from a RunArtifact payload.
- timeline access (`T`) and branch capture (`B`).

### Hotkeys

- `A`: toggle Auto Nurture
- `P`: pause/resume
- `X`: stop/restart
- `H`: show/hide detailed HUD
- `T`: toggle timeline panel (Advanced ON)
- `B`: capture branch point (Advanced ON)

## Timeline and Branching

The timeline panel is a side instrument for comparative runs.

It renders:

- Dialect lane: epoch bars (`bornAt` to `extinctAt`).
- Action lane: scheduled actions as draggable blocks.
- Event lane: key spikes (`mass-extinction`, `dialect-dominant`).
- Branch lane: branch diamonds captured with `B`.
- Diff lane: branch-only vs current-only scheduled actions.
- Playhead: current simulation tick.

Branch behavior:

- Press `B` to capture a branch at the current moment.
- Hover a branch marker to inspect score diffs.
- Click a branch marker to replay from that branch score.

## Export Artifacts

`Export Run` downloads JSON including:

- `seed`
- `totalTicks`
- `peakPopulation`
- `dialectEpochs`
- `keyEvents`
- `phraseVocabulary`
- `scoreJson` (deterministic replay schedule)
- `playtest` telemetry (actions/goals/timing/feedback)
- `exportedAt`

This artifact is both documentation and executable replay notation.

## Intentional Non-Interventions

To preserve protocol integrity, some issues were intentionally left untouched during the autonomous run.

Notable example:

- **Resize reset bug**: resizing the browser window posts a fresh `init` to the worker, which reinitializes simulation runtime for the active seed and effectively resets in-progress state.

Why it was not fixed during the experiment:

- The Messenger Protocol enforced neutral relay and no opportunistic human intervention.
- Fixing the bug at that stage would have changed the observed autonomous trajectory and blurred the experiment boundary between generated behavior and external correction.

In other words: this rough edge is part of the artifact history, not an oversight in publication.

## NotebookLM Case Study

- [NotebookLM Case Study](https://notebooklm.google.com/notebook/4e69331c-7ae8-4590-9fae-5d7a6b0d00df)

## Project Layout

- `src/engine/*`: simulation runtime, scoring, research helpers, export builder
- `src/worker.ts`: worker protocol and tick loop
- `src/render/*`: canvas rendering and HUD
- `src/ui/*`: welcome overlay, timeline, side panel, playtest instrumentation
- `artifacts/research/*`: generated sweep reports and JSON summaries
- `tests/*`: simulation and research report tests
