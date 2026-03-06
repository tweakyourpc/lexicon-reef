export interface LexemeTraits {
  mutationRate: number;
  speed: number;
}

export interface Lexeme {
  id: number;
  parentId: number | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  glyph: string;
  energy: number;
  age: number;
  traits: LexemeTraits;
}

export interface Bond {
  idA: number;
  idB: number;
  strength: number;
  age: number;
}

export interface Dialect {
  id: number;
  dominantGlyph: string;
  population: number;
  age: number;
}

export interface SimEvent {
  tick: number;
  type: "dialect-born" | "dialect-extinct" | "dialect-dominant" | "mass-extinction";
  payload: string;
}

export interface FoodBurstAction {
  kind: "food-burst";
  x: number;
  y: number;
  radius: number;
}

export interface GlyphBiasAction {
  kind: "glyph-bias";
  glyph: string;
  ticks: number;
}

export interface BondStormAction {
  kind: "bond-storm";
  ticks: number;
}

export type WorkerAction = FoodBurstAction | GlyphBiasAction | BondStormAction;

export interface ScoreEntry {
  tick: number;
  action: WorkerAction;
}

export interface DialectEpoch {
  glyph: string;
  bornAt: number;
  extinctAt: number | null;
  peakPopulation: number;
}

export interface PlaytestFeedback {
  clarity: number;
  agency: number;
  surprise: number;
  replay: number;
}

export interface PlaytestGoals {
  foodBurstTriggered: boolean;
  branchCreated: boolean;
  exportRunCompleted: boolean;
}

export interface PlaytestTelemetry {
  startedAt: string;
  timeToFirstActionMs: number | null;
  actionCount: number;
  actionsUsed: WorkerAction["kind"][];
  timelineOpened: boolean;
  branchCreated: boolean;
  exportUsed: boolean;
  goals: PlaytestGoals;
  feedback: PlaytestFeedback | null;
}

export interface RunArtifact {
  seed: number;
  totalTicks: number;
  peakPopulation: number;
  dialectEpochs: DialectEpoch[];
  keyEvents: SimEvent[];
  phraseVocabulary: string[];
  scoreJson: string;
  playtest: PlaytestTelemetry | null;
  exportedAt: string;
}

export interface SimState {
  seed: number;
  tick: number;
  width: number;
  height: number;
  biasGlyph?: string;
  biasTicksRemaining?: number;
  bondStormTicksRemaining?: number;
  lexemes: Lexeme[];
  bonds: Bond[];
  motifs: string[];
  words: string[];
  phrases: string[];
  dialects: Dialect[];
  events: SimEvent[];
}
