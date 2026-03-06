import { applyFoodBurst, initSimulation, tickSimulation } from "./sim";
import { Rng } from "./rng";

const COLLAPSE_THRESHOLD = 30;
const RECOVERY_THRESHOLD = 120;

export interface ResearchRunMetrics {
  seed: number;
  policy: ResearchPolicy;
  firstCollapseTick: number | null;
  recoveredAfterCollapse: boolean;
  collapseTicks: number;
  assistCount: number;
  peakPopulation: number;
  minPopulation: number;
  finalPopulation: number;
  maxDialects: number;
  maxUniqueMotifs: number;
  maxUniqueWords: number;
  maxUniquePhrases: number;
  massExtinctionEvents: number;
  dominantDialectEvents: number;
  finalMeanEnergy: number;
}

export type ResearchPolicy = "none" | "adaptive-nurture";

export interface ResearchSweepConfig {
  seeds: readonly number[];
  ticks: number;
  width: number;
  height: number;
  policy?: ResearchPolicy;
}

export interface ResearchSweepSummary {
  runCount: number;
  ticks: number;
  width: number;
  height: number;
  policy: ResearchPolicy;
  collapseRate: number;
  recoveryRateAmongCollapsed: number;
  meanPeakPopulation: number;
  meanFinalPopulation: number;
  medianFinalPopulation: number;
  minFinalPopulation: number;
  maxFinalPopulation: number;
  meanMaxDialects: number;
  meanMaxUniqueMotifs: number;
  meanMaxUniqueWords: number;
  meanMaxUniquePhrases: number;
  meanMassExtinctionEvents: number;
  meanAssistCount: number;
  fragileSeeds: number[];
  resilientSeeds: number[];
  runs: ResearchRunMetrics[];
}

function round(value: number, places = 4): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function computeMeanEnergy(energies: readonly number[]): number {
  if (energies.length === 0) {
    return 0;
  }
  return mean(energies);
}

type DiversityState = {
  phrases: readonly string[];
};

function normalizeCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.floor(value));
}

function readStateCount(state: DiversityState, keys: readonly string[]): number | null {
  const lookup = state as Record<string, unknown>;
  for (const key of keys) {
    const count = normalizeCount(lookup[key]);
    if (count !== null) {
      return count;
    }
  }
  return null;
}

function readStateStringList(state: DiversityState, keys: readonly string[]): string[] {
  const lookup = state as Record<string, unknown>;
  for (const key of keys) {
    const value = lookup[key];
    if (!Array.isArray(value)) {
      continue;
    }

    const list: string[] = [];
    for (const item of value) {
      if (typeof item === "string" && item.length > 0) {
        list.push(item);
      }
    }
    return list;
  }
  return [];
}

function tokenizeWords(text: string): string[] {
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9@#$%&*+\-?]+/g)
    .filter((word) => word.length > 0);
  if (words.length > 0) {
    return words;
  }
  if (text.length === 0) {
    return [];
  }
  return [text.toLowerCase()];
}

function motifFragments(word: string): string[] {
  if (word.length === 0) {
    return [];
  }
  if (word.length < 2) {
    return [word];
  }
  const motifs: string[] = [];
  for (let i = 0; i < word.length - 1; i += 1) {
    motifs.push(word.slice(i, i + 2));
  }
  return motifs;
}

function readDiversityCounts(state: DiversityState): {
  motifs: number;
  words: number;
  phrases: number;
} {
  const phraseSet = new Set(state.phrases.filter((phrase) => phrase.length > 0));
  const phraseFallbackCount = phraseSet.size;

  const words = readStateStringList(state, ["wordVocabulary", "words"]);
  const motifs = readStateStringList(state, ["motifVocabulary", "motifs"]);

  const wordSet = new Set(words);
  if (wordSet.size === 0) {
    for (const phrase of phraseSet) {
      for (const word of tokenizeWords(phrase)) {
        wordSet.add(word);
      }
    }
  }

  const motifSet = new Set(motifs);
  if (motifSet.size === 0) {
    for (const word of wordSet) {
      for (const motif of motifFragments(word)) {
        motifSet.add(motif);
      }
    }
  }

  return {
    motifs:
      readStateCount(state, ["maxUniqueMotifs", "uniqueMotifs", "motifCount"]) ??
      motifSet.size,
    words:
      readStateCount(state, ["maxUniqueWords", "uniqueWords", "wordCount"]) ?? wordSet.size,
    phrases:
      readStateCount(state, ["maxUniquePhrases", "uniquePhrases", "phraseCount"]) ??
      phraseFallbackCount
  };
}

function maybeApplyAdaptiveNurture(
  tick: number,
  width: number,
  height: number,
  population: number,
  meanEnergy: number,
  cooldownUntil: number,
  runtime: ReturnType<typeof initSimulation>
): { applied: boolean; nextCooldownUntil: number } {
  if (tick < cooldownUntil) {
    return { applied: false, nextCooldownUntil: cooldownUntil };
  }

  let severity = -1;
  if (population < 34 || meanEnergy < 0.46) {
    severity = 2;
  } else if (population < 58 || meanEnergy < 0.58) {
    severity = 1;
  } else if (population < 88 && meanEnergy < 0.69) {
    severity = 0;
  }
  if (severity < 0) {
    return { applied: false, nextCooldownUntil: cooldownUntil };
  }

  const angle = tick * 0.11;
  const orbit = Math.min(width, height) * (severity === 2 ? 0.18 : 0.26);
  const x = width / 2 + Math.cos(angle) * orbit;
  const y = height / 2 + Math.sin(angle) * orbit;
  const radius = severity === 2 ? 170 : severity === 1 ? 145 : 120;
  const cooldown = severity === 2 ? 8 : severity === 1 ? 14 : 22;

  applyFoodBurst(runtime, x, y, radius);
  return { applied: true, nextCooldownUntil: tick + cooldown };
}

export function buildSeedList(count: number, baseSeed = 20260222): number[] {
  const total = Math.max(1, Math.floor(count));
  const rng = new Rng(baseSeed >>> 0);
  const seeds: number[] = [];
  const seen = new Set<number>();

  while (seeds.length < total) {
    const seed = rng.int(1, 0x7fffffff);
    if (seen.has(seed)) {
      continue;
    }
    seen.add(seed);
    seeds.push(seed);
  }

  return seeds;
}

export function runResearchRun(
  seed: number,
  ticks: number,
  width: number,
  height: number,
  policy: ResearchPolicy = "none"
): ResearchRunMetrics {
  const runtime = initSimulation(seed, width, height);
  const initialDiversity = readDiversityCounts(runtime.state);
  let assistCount = 0;
  let assistCooldownUntil = 0;
  let peakPopulation = runtime.state.lexemes.length;
  let minPopulation = runtime.state.lexemes.length;
  let maxDialects = runtime.state.dialects.length;
  let maxUniqueMotifs = initialDiversity.motifs;
  let maxUniqueWords = initialDiversity.words;
  let maxUniquePhrases = initialDiversity.phrases;
  let firstCollapseTick: number | null = null;
  let recoveredAfterCollapse = false;
  let collapseTicks = 0;
  let massExtinctionEvents = 0;
  let dominantDialectEvents = 0;
  let lastEventCount = 0;

  for (let step = 0; step < ticks; step += 1) {
    if (policy === "adaptive-nurture") {
      const prePopulation = runtime.state.lexemes.length;
      const preMeanEnergy = computeMeanEnergy(
        runtime.state.lexemes.map((lexeme) => lexeme.energy)
      );
      const assist = maybeApplyAdaptiveNurture(
        runtime.state.tick,
        width,
        height,
        prePopulation,
        preMeanEnergy,
        assistCooldownUntil,
        runtime
      );
      if (assist.applied) {
        assistCount += 1;
      }
      assistCooldownUntil = assist.nextCooldownUntil;
    }

    const state = tickSimulation(runtime);
    const population = state.lexemes.length;
    peakPopulation = Math.max(peakPopulation, population);
    minPopulation = Math.min(minPopulation, population);
    maxDialects = Math.max(maxDialects, state.dialects.length);
    const diversity = readDiversityCounts(state);
    maxUniqueMotifs = Math.max(maxUniqueMotifs, diversity.motifs);
    maxUniqueWords = Math.max(maxUniqueWords, diversity.words);
    maxUniquePhrases = Math.max(maxUniquePhrases, diversity.phrases);

    if (population < COLLAPSE_THRESHOLD) {
      collapseTicks += 1;
      if (firstCollapseTick === null) {
        firstCollapseTick = state.tick;
      }
    } else if (firstCollapseTick !== null && population >= RECOVERY_THRESHOLD) {
      recoveredAfterCollapse = true;
    }

    if (state.events.length > lastEventCount) {
      for (let i = lastEventCount; i < state.events.length; i += 1) {
        const event = state.events[i];
        if (event.type === "mass-extinction") {
          massExtinctionEvents += 1;
        } else if (event.type === "dialect-dominant") {
          dominantDialectEvents += 1;
        }
      }
      lastEventCount = state.events.length;
    }
  }

  const finalPopulation = runtime.state.lexemes.length;
  const finalMeanEnergy = computeMeanEnergy(runtime.state.lexemes.map((lexeme) => lexeme.energy));

  return {
    seed,
    policy,
    firstCollapseTick,
    recoveredAfterCollapse,
    collapseTicks,
    assistCount,
    peakPopulation,
    minPopulation,
    finalPopulation,
    maxDialects,
    maxUniqueMotifs,
    maxUniqueWords,
    maxUniquePhrases,
    massExtinctionEvents,
    dominantDialectEvents,
    finalMeanEnergy: round(finalMeanEnergy)
  };
}

export function runResearchSweep(config: ResearchSweepConfig): ResearchSweepSummary {
  const ticks = Math.max(1, Math.floor(config.ticks));
  const width = Math.max(1, Math.floor(config.width));
  const height = Math.max(1, Math.floor(config.height));
  const policy = config.policy ?? "none";

  const runs = config.seeds.map((seed) =>
    runResearchRun(seed, ticks, width, height, policy)
  );
  const collapsedRuns = runs.filter((run) => run.firstCollapseTick !== null);
  const recoveredRuns = collapsedRuns.filter((run) => run.recoveredAfterCollapse);
  const finalPopulations = runs.map((run) => run.finalPopulation);

  const fragileSeeds = [...runs]
    .sort((a, b) => a.finalPopulation - b.finalPopulation || a.seed - b.seed)
    .slice(0, 5)
    .map((run) => run.seed);

  const resilientSeeds = [...runs]
    .sort((a, b) => b.finalPopulation - a.finalPopulation || a.seed - b.seed)
    .slice(0, 5)
    .map((run) => run.seed);

  return {
    runCount: runs.length,
    ticks,
    width,
    height,
    policy,
    collapseRate: round(collapsedRuns.length / Math.max(1, runs.length)),
    recoveryRateAmongCollapsed: round(
      recoveredRuns.length / Math.max(1, collapsedRuns.length)
    ),
    meanPeakPopulation: round(mean(runs.map((run) => run.peakPopulation))),
    meanFinalPopulation: round(mean(finalPopulations)),
    medianFinalPopulation: round(median(finalPopulations)),
    minFinalPopulation: runs.length === 0 ? 0 : Math.min(...finalPopulations),
    maxFinalPopulation: runs.length === 0 ? 0 : Math.max(...finalPopulations),
    meanMaxDialects: round(mean(runs.map((run) => run.maxDialects))),
    meanMaxUniqueMotifs: round(mean(runs.map((run) => run.maxUniqueMotifs))),
    meanMaxUniqueWords: round(mean(runs.map((run) => run.maxUniqueWords))),
    meanMaxUniquePhrases: round(mean(runs.map((run) => run.maxUniquePhrases))),
    meanMassExtinctionEvents: round(mean(runs.map((run) => run.massExtinctionEvents))),
    meanAssistCount: round(mean(runs.map((run) => run.assistCount))),
    fragileSeeds,
    resilientSeeds,
    runs
  };
}

export function formatResearchSummary(summary: ResearchSweepSummary): string {
  const lines: string[] = [];
  lines.push("# Lexicon Reef Research Sweep");
  lines.push("");
  lines.push(
    `policy=${summary.policy} runs=${summary.runCount} ticks=${summary.ticks} arena=${summary.width}x${summary.height}`
  );
  lines.push(`collapseRate=${(summary.collapseRate * 100).toFixed(2)}%`);
  lines.push(
    `recoveryAmongCollapsed=${(summary.recoveryRateAmongCollapsed * 100).toFixed(2)}%`
  );
  lines.push(
    `finalPopulation mean=${summary.meanFinalPopulation.toFixed(
      2
    )} median=${summary.medianFinalPopulation.toFixed(2)} range=${
      summary.minFinalPopulation
    }..${summary.maxFinalPopulation}`
  );
  lines.push(`peakPopulation mean=${summary.meanPeakPopulation.toFixed(2)}`);
  lines.push(
    `diversity meanMax motifs=${summary.meanMaxUniqueMotifs.toFixed(
      2
    )} words=${summary.meanMaxUniqueWords.toFixed(2)} phrases=${summary.meanMaxUniquePhrases.toFixed(
      2
    )} dialects=${summary.meanMaxDialects.toFixed(2)}`
  );
  lines.push(`massExtinctions mean=${summary.meanMassExtinctionEvents.toFixed(2)}`);
  lines.push(`assistCount mean=${summary.meanAssistCount.toFixed(2)}`);
  lines.push(`fragileSeeds=${summary.fragileSeeds.join(", ")}`);
  lines.push(`resilientSeeds=${summary.resilientSeeds.join(", ")}`);
  return lines.join("\n");
}
