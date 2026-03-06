import type { PlaytestTelemetry, RunArtifact } from "../types";
import type { SimulationRuntime } from "./sim";

export function exportScore(runtime: SimulationRuntime): string {
  return runtime.scoreArchive.serialize();
}

export function buildRunArtifact(
  runtime: SimulationRuntime,
  playtest: PlaytestTelemetry | null = null
): RunArtifact {
  const phraseVocabulary = [...new Set(runtime.state.phrases)];
  const keyEvents = runtime.state.events.filter(
    (event) => event.type === "dialect-dominant" || event.type === "mass-extinction"
  );

  return {
    seed: runtime.state.seed,
    totalTicks: runtime.state.tick,
    peakPopulation: runtime.peakPopulation,
    dialectEpochs: runtime.dialectEpochs.map((epoch) => ({
      glyph: epoch.glyph,
      bornAt: epoch.bornAt,
      extinctAt: epoch.extinctAt,
      peakPopulation: epoch.peakPopulation
    })),
    keyEvents,
    phraseVocabulary,
    scoreJson: exportScore(runtime),
    playtest,
    exportedAt: new Date().toISOString()
  };
}
