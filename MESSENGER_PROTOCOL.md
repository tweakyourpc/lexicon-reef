# Messenger Protocol for Lexicon Reef

This document records the methodology used to produce Lexicon Reef so another team can replicate the experiment.

## Experiment Goal

Test whether two AI systems can produce a coherent software project through adversarial collaboration, with a human acting only as a neutral transport layer.

## Roles

- **AI System A (Builder)**
  - Primary implementation agent.
  - Writes code, tests, and docs.
- **AI System B (Reviewer/Counterpart)**
  - Challenges architecture and behavior.
  - Requests corrections, edge-case handling, and clarity upgrades.
- **Human Messenger (Neutral Relay)**
  - Forwards messages between A and B.
  - Executes terminal commands requested by either AI.
  - Returns outputs verbatim.

## Human Rules (Allowed vs Not Allowed)

### Allowed

- Copy/paste messages between AI systems without reinterpretation.
- Execute requested commands exactly.
- Return raw stdout/stderr and file diffs.
- Ask only procedural clarification when an instruction is physically impossible.

### Not Allowed

- No feature ideation.
- No architectural suggestions.
- No debugging advice.
- No tie-breaking on technical disputes.
- No code edits unless explicitly dictated line-for-line by an AI.
- No summarization that omits contradictory details.

## Relay Procedure

1. Start both AI systems with role-specific instructions.
2. Deliver the starter prompt to AI System A.
3. Forward A's plan/output to B.
4. Forward B's critiques/questions to A.
5. Continue until A and B converge on a stable implementation.
6. Freeze all artifacts and preserve the final repository snapshot.

## Full Starter Prompt

The experiment started from this prompt delivered to AI System A:

```text
Build a browser-native simulation project named "Lexicon Reef" using TypeScript + Vite.

Concept:
- Text glyph entities should behave like an ecosystem.
- Entities drift, exchange energy on contact, reproduce with mutation, and form emergent dialect clusters.

Constraints:
- Deterministic simulation from seed.
- Use a worker for simulation updates.
- Keep rendering on canvas.
- Provide an interaction panel with at least:
  1) Food Burst
  2) Glyph Bias
  3) Bond Storm
  4) Export Run
- Export must produce JSON with enough data to replay or analyze a run.
- Include a minimal test suite and a README with run instructions.
- Keep code readable and modular.

Success condition:
- A curious developer can clone, run `npm install && npm run dev`, interact with the simulation, and export meaningful run artifacts.
```

## What Was Learned

- **Autonomous convergence is possible**: builder/reviewer loops produced a coherent, runnable system.
- **Replayability became a central quality bar**: deterministic seeds and score serialization emerged as core infrastructure.
- **Agentic Drift is real and productive**: scope expanded beyond baseline simulation into timeline branching, telemetry, and research sweeps.
- **Neutral human relay preserves attribution**: when the messenger is constrained to transport-only behavior, authorship stays with the AI systems.
- **Protocol costs exist**: rough edges can remain if not explicitly surfaced and prioritized during relay cycles.

## Reproducibility Notes

If you rerun this methodology, keep these constants stable:

- exact role definitions
- strict human non-intervention rules
- verbatim message forwarding
- full output logging
- frozen dependency versions at handoff

Changing any of the above changes the experimental conditions.
