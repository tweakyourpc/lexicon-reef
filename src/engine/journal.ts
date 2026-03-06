import type { SimEvent, SimState, WorkerAction } from "../types";

type ActionKind = WorkerAction["kind"];

interface RunSnapshot {
  tick: number;
  population: number;
  meanEnergy: number;
  bonds: number;
  dialects: number;
  phrases: number;
}

interface RunJournalEntry {
  id: string;
  seed: number;
  startedAt: string;
  lastUpdatedAt: string;
  firstTick: number;
  lastTick: number;
  peakPopulation: number;
  lowestPopulation: number;
  maxDialects: number;
  maxPhrases: number;
  actions: Record<ActionKind, number>;
  autoAssistCount: number;
  branchCount: number;
  exportCount: number;
  snapshots: RunSnapshot[];
  events: SimEvent[];
}

interface JournalStore {
  runs: RunJournalEntry[];
}

const STORAGE_KEY = "lexicon-reef-journal-v1";
const MAX_STORED_RUNS = 12;
const MAX_SNAPSHOTS = 240;
const MAX_EVENTS = 220;
const SNAPSHOT_INTERVAL_TICKS = 25;

function nowIso(): string {
  return new Date().toISOString();
}

function cloneEvent(event: SimEvent): SimEvent {
  return {
    tick: event.tick,
    type: event.type,
    payload: event.payload
  };
}

function makeEmptyActions(): Record<ActionKind, number> {
  return {
    "food-burst": 0,
    "glyph-bias": 0,
    "bond-storm": 0
  };
}

function safeParseStore(raw: string | null): JournalStore {
  if (raw === null || raw.trim() === "") {
    return { runs: [] };
  }
  try {
    const parsed = JSON.parse(raw) as { runs?: unknown };
    if (!Array.isArray(parsed.runs)) {
      return { runs: [] };
    }
    const runs: RunJournalEntry[] = [];
    for (const item of parsed.runs) {
      if (typeof item !== "object" || item === null) {
        continue;
      }
      const maybe = item as Partial<RunJournalEntry>;
      if (
        typeof maybe.id !== "string" ||
        typeof maybe.seed !== "number" ||
        typeof maybe.startedAt !== "string" ||
        typeof maybe.lastUpdatedAt !== "string" ||
        typeof maybe.firstTick !== "number" ||
        typeof maybe.lastTick !== "number"
      ) {
        continue;
      }
      runs.push({
        id: maybe.id,
        seed: maybe.seed,
        startedAt: maybe.startedAt,
        lastUpdatedAt: maybe.lastUpdatedAt,
        firstTick: maybe.firstTick,
        lastTick: maybe.lastTick,
        peakPopulation: typeof maybe.peakPopulation === "number" ? maybe.peakPopulation : 0,
        lowestPopulation: typeof maybe.lowestPopulation === "number" ? maybe.lowestPopulation : 0,
        maxDialects: typeof maybe.maxDialects === "number" ? maybe.maxDialects : 0,
        maxPhrases: typeof maybe.maxPhrases === "number" ? maybe.maxPhrases : 0,
        actions:
          typeof maybe.actions === "object" && maybe.actions !== null
            ? {
                "food-burst":
                  typeof (maybe.actions as Partial<Record<ActionKind, number>>)["food-burst"] ===
                  "number"
                    ? (maybe.actions as Partial<Record<ActionKind, number>>)["food-burst"] ?? 0
                    : 0,
                "glyph-bias":
                  typeof (maybe.actions as Partial<Record<ActionKind, number>>)["glyph-bias"] ===
                  "number"
                    ? (maybe.actions as Partial<Record<ActionKind, number>>)["glyph-bias"] ?? 0
                    : 0,
                "bond-storm":
                  typeof (maybe.actions as Partial<Record<ActionKind, number>>)["bond-storm"] ===
                  "number"
                    ? (maybe.actions as Partial<Record<ActionKind, number>>)["bond-storm"] ?? 0
                    : 0
              }
            : makeEmptyActions(),
        autoAssistCount: typeof maybe.autoAssistCount === "number" ? maybe.autoAssistCount : 0,
        branchCount: typeof maybe.branchCount === "number" ? maybe.branchCount : 0,
        exportCount: typeof maybe.exportCount === "number" ? maybe.exportCount : 0,
        snapshots: Array.isArray(maybe.snapshots)
          ? maybe.snapshots.filter((snapshot): snapshot is RunSnapshot => {
              return (
                typeof snapshot === "object" &&
                snapshot !== null &&
                typeof (snapshot as Partial<RunSnapshot>).tick === "number" &&
                typeof (snapshot as Partial<RunSnapshot>).population === "number" &&
                typeof (snapshot as Partial<RunSnapshot>).meanEnergy === "number" &&
                typeof (snapshot as Partial<RunSnapshot>).bonds === "number" &&
                typeof (snapshot as Partial<RunSnapshot>).dialects === "number" &&
                typeof (snapshot as Partial<RunSnapshot>).phrases === "number"
              );
            })
          : [],
        events: Array.isArray(maybe.events)
          ? maybe.events.filter((event): event is SimEvent => {
              return (
                typeof event === "object" &&
                event !== null &&
                typeof (event as Partial<SimEvent>).tick === "number" &&
                typeof (event as Partial<SimEvent>).type === "string" &&
                typeof (event as Partial<SimEvent>).payload === "string"
              );
            })
          : []
      });
    }
    return { runs };
  } catch {
    return { runs: [] };
  }
}

function detectStorage(): Storage | null {
  try {
    if (typeof window === "undefined") {
      return null;
    }
    return window.localStorage;
  } catch {
    return null;
  }
}

export class RunJournal {
  private readonly storage: Storage | null;
  private currentRun: RunJournalEntry | null = null;
  private lastSnapshotTick = -1;
  private seenEventKeys = new Set<string>();

  constructor(storage: Storage | null = detectStorage()) {
    this.storage = storage;
  }

  ingestState(state: SimState): void {
    this.ensureRun(state);
    if (this.currentRun === null) {
      return;
    }

    const current = this.currentRun;
    current.lastTick = state.tick;
    current.lastUpdatedAt = nowIso();
    current.peakPopulation = Math.max(current.peakPopulation, state.lexemes.length);
    current.lowestPopulation = Math.min(current.lowestPopulation, state.lexemes.length);
    current.maxDialects = Math.max(current.maxDialects, state.dialects.length);
    current.maxPhrases = Math.max(current.maxPhrases, new Set(state.phrases).size);

    if (state.tick === 0 || this.lastSnapshotTick < 0 || state.tick - this.lastSnapshotTick >= SNAPSHOT_INTERVAL_TICKS) {
      this.lastSnapshotTick = state.tick;
      let meanEnergy = 0;
      if (state.lexemes.length > 0) {
        const totalEnergy = state.lexemes.reduce((sum, lexeme) => sum + lexeme.energy, 0);
        meanEnergy = totalEnergy / state.lexemes.length;
      }

      current.snapshots.push({
        tick: state.tick,
        population: state.lexemes.length,
        meanEnergy: Number(meanEnergy.toFixed(4)),
        bonds: state.bonds.length,
        dialects: state.dialects.length,
        phrases: new Set(state.phrases).size
      });
      if (current.snapshots.length > MAX_SNAPSHOTS) {
        current.snapshots.splice(0, current.snapshots.length - MAX_SNAPSHOTS);
      }
    }

    for (const event of state.events) {
      const key = `${event.tick}|${event.type}|${event.payload}`;
      if (this.seenEventKeys.has(key)) {
        continue;
      }
      this.seenEventKeys.add(key);
      current.events.push(cloneEvent(event));
      if (current.events.length > MAX_EVENTS) {
        current.events.splice(0, current.events.length - MAX_EVENTS);
      }
    }
  }

  noteAction(kind: ActionKind): void {
    if (this.currentRun === null) {
      return;
    }
    this.currentRun.actions[kind] += 1;
    this.currentRun.lastUpdatedAt = nowIso();
  }

  noteBranch(): void {
    if (this.currentRun === null) {
      return;
    }
    this.currentRun.branchCount += 1;
    this.currentRun.lastUpdatedAt = nowIso();
  }

  noteAutoAssist(): void {
    if (this.currentRun === null) {
      return;
    }
    this.currentRun.autoAssistCount += 1;
    this.currentRun.lastUpdatedAt = nowIso();
  }

  noteExport(): void {
    if (this.currentRun === null) {
      return;
    }
    this.currentRun.exportCount += 1;
    this.currentRun.lastUpdatedAt = nowIso();
  }

  persist(): void {
    if (this.storage === null || this.currentRun === null) {
      return;
    }

    const store = safeParseStore(this.storage.getItem(STORAGE_KEY));
    const filtered = store.runs.filter((run) => run.id !== this.currentRun?.id);
    filtered.unshift(this.currentRun);
    if (filtered.length > MAX_STORED_RUNS) {
      filtered.splice(MAX_STORED_RUNS, filtered.length - MAX_STORED_RUNS);
    }
    const payload: JournalStore = { runs: filtered };
    this.storage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  buildReport(): string {
    if (this.currentRun === null) {
      return "No active run journal data available yet.";
    }

    const run = this.currentRun;
    const snapshotTail = run.snapshots.slice(-12);
    const eventTail = run.events.slice(-12);

    const lines: string[] = [];
    lines.push("# Lexicon Reef Run Report");
    lines.push("");
    lines.push(`- runId: ${run.id}`);
    lines.push(`- seed: ${run.seed}`);
    lines.push(`- startedAt: ${run.startedAt}`);
    lines.push(`- updatedAt: ${run.lastUpdatedAt}`);
    lines.push(`- tickRange: ${run.firstTick} -> ${run.lastTick}`);
    lines.push(`- peakPopulation: ${run.peakPopulation}`);
    lines.push(
      `- lowestPopulation: ${
        run.lowestPopulation === Number.MAX_SAFE_INTEGER ? 0 : run.lowestPopulation
      }`
    );
    lines.push(`- maxDialects: ${run.maxDialects}`);
    lines.push(`- maxUniquePhrases: ${run.maxPhrases}`);
    lines.push(`- actions: foodBurst=${run.actions["food-burst"]}, glyphBias=${run.actions["glyph-bias"]}, bondStorm=${run.actions["bond-storm"]}`);
    lines.push(`- autoAssists: ${run.autoAssistCount}`);
    lines.push(`- branches: ${run.branchCount}`);
    lines.push(`- exports: ${run.exportCount}`);
    lines.push("");

    const firstSnapshot = run.snapshots[0];
    const lastSnapshot = run.snapshots[run.snapshots.length - 1];
    const totalTicks = Math.max(1, run.lastTick - run.firstTick + 1);
    const totalActions =
      run.actions["food-burst"] + run.actions["glyph-bias"] + run.actions["bond-storm"];
    const actionsPer100Ticks = (totalActions / totalTicks) * 100;
    const hadCrash = run.events.some((event) => event.type === "mass-extinction");
    const recoveredFromCrash = hadCrash && run.peakPopulation >= 120;
    const trendPopulation =
      firstSnapshot === undefined || lastSnapshot === undefined
        ? "unknown"
        : lastSnapshot.population > firstSnapshot.population
          ? "growing"
          : lastSnapshot.population < firstSnapshot.population
            ? "declining"
            : "flat";

    lines.push("## Narrative");
    lines.push(
      `- System trend: ${trendPopulation} (actions/100 ticks: ${actionsPer100Ticks.toFixed(2)})`
    );
    if (hadCrash) {
      lines.push(
        `- Crash behavior: mass-extinction observed; recovery=${
          recoveredFromCrash ? "yes" : "no"
        }`
      );
    } else {
      lines.push("- Crash behavior: no mass-extinction events observed.");
    }
    lines.push(
      `- Diversity pressure: maxDialects=${run.maxDialects}, maxUniquePhrases=${run.maxPhrases}`
    );
    lines.push("");

    lines.push("## Snapshot Tail");
    if (snapshotTail.length === 0) {
      lines.push("- (none)");
    } else {
      for (const snapshot of snapshotTail) {
        lines.push(
          `- [${snapshot.tick}] pop=${snapshot.population} meanEnergy=${snapshot.meanEnergy.toFixed(
            3
          )} bonds=${snapshot.bonds} dialects=${snapshot.dialects} phrases=${snapshot.phrases}`
        );
      }
    }
    lines.push("");

    lines.push("## Event Tail");
    if (eventTail.length === 0) {
      lines.push("- (none)");
    } else {
      for (const event of eventTail) {
        lines.push(`- [${event.tick}] ${event.type}: ${event.payload}`);
      }
    }

    return lines.join("\n");
  }

  private ensureRun(state: SimState): void {
    if (this.currentRun === null) {
      this.startRun(state.seed, state.tick);
      return;
    }

    if (state.seed !== this.currentRun.seed || state.tick < this.currentRun.lastTick) {
      this.persist();
      this.startRun(state.seed, state.tick);
    }
  }

  private startRun(seed: number, tick: number): void {
    this.currentRun = {
      id: `${seed}-${Date.now().toString(36)}`,
      seed,
      startedAt: nowIso(),
      lastUpdatedAt: nowIso(),
      firstTick: tick,
      lastTick: tick,
      peakPopulation: 0,
      lowestPopulation: Number.MAX_SAFE_INTEGER,
      maxDialects: 0,
      maxPhrases: 0,
      actions: makeEmptyActions(),
      autoAssistCount: 0,
      branchCount: 0,
      exportCount: 0,
      snapshots: [],
      events: []
    };
    this.lastSnapshotTick = -1;
    this.seenEventKeys = new Set<string>();
  }
}
