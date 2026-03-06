/// <reference lib="webworker" />

import { buildRunArtifact } from "./engine/export";
import { applyFoodBurst, initSimulation, tickSimulation, type SimulationRuntime } from "./engine/sim";
import { Score } from "./engine/score";
import type {
  DialectEpoch,
  PlaytestTelemetry,
  RunArtifact,
  ScoreEntry,
  SimState,
  WorkerAction
} from "./types";

type InitMessage = {
  type: "init";
  seed: number;
  width: number;
  height: number;
};

type TickMessage = {
  type: "tick";
};

type FoodBurstMessage = {
  type: "food-burst";
  x: number;
  y: number;
  radius: number;
  record?: boolean;
};

type GlyphBiasMessage = {
  type: "glyph-bias";
  glyph: string;
  ticks: number;
};

type BondStormMessage = {
  type: "bond-storm";
  ticks: number;
};

type ExportMessage = {
  type: "export";
  playtest?: PlaytestTelemetry | null;
};

type LoadScoreMessage = {
  type: "load-score";
  entries: ScoreEntry[];
};

type ImportScoreMessage = {
  type: "import-score";
  json: string;
};

type WorkerMessage =
  | InitMessage
  | TickMessage
  | FoodBurstMessage
  | GlyphBiasMessage
  | BondStormMessage
  | ExportMessage
  | LoadScoreMessage
  | ImportScoreMessage;

type ArtifactMessage = {
  type: "artifact";
  data: RunArtifact;
};

type StateMessage = {
  type: "state";
  state: SimState;
  scoreEntries: ScoreEntry[];
  dialectEpochs: DialectEpoch[];
};

let runtime: SimulationRuntime | null = null;
const workerScope = self as DedicatedWorkerGlobalScope;

function postState(currentRuntime: SimulationRuntime): void {
  currentRuntime.state.biasGlyph =
    currentRuntime.biasGlyph === null ? undefined : currentRuntime.biasGlyph;
  currentRuntime.state.biasTicksRemaining = currentRuntime.biasTicksRemaining;
  currentRuntime.state.bondStormTicksRemaining = currentRuntime.bondStormTicksRemaining;

  const message: StateMessage = {
    type: "state",
    state: currentRuntime.state,
    scoreEntries: currentRuntime.scoreArchive.entries.map((entry) => ({
      tick: entry.tick,
      action: JSON.parse(JSON.stringify(entry.action)) as WorkerAction
    })),
    dialectEpochs: currentRuntime.dialectEpochs.map((epoch) => ({
      glyph: epoch.glyph,
      bornAt: epoch.bornAt,
      extinctAt: epoch.extinctAt,
      peakPopulation: epoch.peakPopulation
    }))
  };
  workerScope.postMessage(message);
}

function postArtifact(artifact: RunArtifact): void {
  const message: ArtifactMessage = { type: "artifact", data: artifact };
  workerScope.postMessage(message);
}

function setGlyphBias(runtime: SimulationRuntime, glyph: string, ticks: number): void {
  const sanitizedGlyph = glyph.trim().slice(0, 1);
  if (sanitizedGlyph.length === 0) {
    runtime.biasGlyph = null;
    runtime.biasTicksRemaining = 0;
    return;
  }

  runtime.biasGlyph = sanitizedGlyph;
  runtime.biasTicksRemaining = Math.max(0, Math.floor(ticks));
}

function setBondStorm(runtime: SimulationRuntime, ticks: number): void {
  runtime.bondStormTicksRemaining = Math.max(runtime.bondStormTicksRemaining, Math.floor(ticks));
}

function applyWorkerAction(runtime: SimulationRuntime, action: WorkerAction): void {
  if (action.kind === "food-burst") {
    applyFoodBurst(runtime, action.x, action.y, action.radius);
    return;
  }

  if (action.kind === "glyph-bias") {
    setGlyphBias(runtime, action.glyph, action.ticks);
    return;
  }

  setBondStorm(runtime, action.ticks);
}

function loadScoreIntoRuntime(runtime: SimulationRuntime, archive: Score): void {
  runtime.scoreArchive = archive;
  runtime.score = archive.clone();
  if (runtime.state.tick > 0) {
    runtime.score.drain(runtime.state.tick);
  }
}

workerScope.onmessage = (event: MessageEvent<WorkerMessage>): void => {
  const message = event.data;
  if (message.type === "init") {
    runtime = initSimulation(message.seed, message.width, message.height);
    postState(runtime);
    return;
  }

  if (runtime === null) {
    return;
  }

  if (message.type === "tick") {
    tickSimulation(runtime);
    const queuedActions = runtime.score.drain(runtime.state.tick);
    for (const action of queuedActions) {
      applyWorkerAction(runtime, action);
    }
    postState(runtime);
    return;
  }

  if (message.type === "food-burst") {
    applyFoodBurst(runtime, message.x, message.y, message.radius);
    if (message.record !== false) {
      runtime.scoreArchive.schedule(runtime.state.tick, {
        kind: "food-burst",
        x: message.x,
        y: message.y,
        radius: message.radius
      });
    }
    postState(runtime);
    return;
  }

  if (message.type === "glyph-bias") {
    setGlyphBias(runtime, message.glyph, message.ticks);
    if (runtime.biasGlyph !== null && runtime.biasTicksRemaining > 0) {
      runtime.scoreArchive.schedule(runtime.state.tick, {
        kind: "glyph-bias",
        glyph: runtime.biasGlyph,
        ticks: runtime.biasTicksRemaining
      });
    }
    postState(runtime);
    return;
  }

  if (message.type === "bond-storm") {
    setBondStorm(runtime, message.ticks);
    runtime.scoreArchive.schedule(runtime.state.tick, {
      kind: "bond-storm",
      ticks: Math.max(0, Math.floor(message.ticks))
    });
    postState(runtime);
    return;
  }

  if (message.type === "load-score") {
    const score = new Score();
    for (const entry of message.entries) {
      score.schedule(entry.tick, entry.action);
    }
    loadScoreIntoRuntime(runtime, score);
    postState(runtime);
    return;
  }

  if (message.type === "import-score") {
    try {
      loadScoreIntoRuntime(runtime, Score.deserialize(message.json));
    } catch {
      loadScoreIntoRuntime(runtime, new Score());
    }
    postState(runtime);
    return;
  }

  if (message.type === "export") {
    postArtifact(buildRunArtifact(runtime, message.playtest ?? null));
  }
};

export {};
