import type { Bond, Dialect, DialectEpoch, Lexeme, SimEvent, SimState } from "../types";
import { UniformGrid } from "./grid";
import { Rng } from "./rng";
import { Score } from "./score";

export const START_POPULATION = 200;
const RESPAWN_POPULATION = 24;
export const CONTACT_RADIUS = 20;
const CONTACT_RADIUS_SQ = CONTACT_RADIUS * CONTACT_RADIUS;
const GRID_CELL_SIZE = CONTACT_RADIUS * 2;
const BASE_DECAY = 0.0028;
const SPEED_DECAY_MULTIPLIER = 0.0011;
const AMBIENT_ENERGY_GAIN = 0.0014;
const REPRODUCTION_THRESHOLD = 1.55;
const REPRODUCTION_CHANCE = 0.048;
export const MAX_POPULATION = 450;
export const MAX_BONDS = 300;
const MAX_MUTATION_RATE = 0.3;
const MIN_MUTATION_RATE = 0.002;
const MIN_SPEED_TRAIT = 0.35;
const MAX_SPEED_TRAIT = 3.2;
const BOND_FORMATION_CHANCE = 0.008;
const BOND_STRENGTHEN_RATE = 0.004;
const BOND_WEAKEN_RATE = 0.008;
const MOTIF_FORMATION_CHANCE = 0.18;
const MAX_MOTIF_HISTORY = 96;
const MAX_WORD_HISTORY = 96;
const MAX_PHRASE_HISTORY = 64;
const MOTIF_MIN_CLUSTER_SIZE = 3;
const MOTIF_MAX_LENGTH = 6;
const MOTIF_MIN_UNIQUE_GLYPHS = 2;
const DIALECT_SCAN_INTERVAL = 100;
const DIALECT_MIN_POPULATION = 12;
const MAX_DIALECTS = 8;
const MAX_EVENTS = 128;
const MASS_EXTINCTION_THRESHOLD = 30;
const DIALECT_DOMINANCE_RATIO = 0.4;
const GLYPH_BIAS_CHANCE = 0.6;
const GLYPHS = "abcdefghijklmnopqrstuvwxyz0123456789@#$%&*+-?".split("");
const WORD_LEXICON = [
  "amber",
  "arch",
  "bloom",
  "brine",
  "cairn",
  "cedar",
  "cinder",
  "clove",
  "coral",
  "crest",
  "dawn",
  "drift",
  "ember",
  "fable",
  "fjord",
  "flint",
  "flora",
  "forge",
  "frost",
  "gale",
  "glen",
  "glint",
  "grove",
  "harbor",
  "haven",
  "helix",
  "hollow",
  "ivory",
  "juniper",
  "keel",
  "lattice",
  "lumen",
  "marble",
  "meadow",
  "morrow",
  "moss",
  "nadir",
  "nacre",
  "nova",
  "oasis",
  "onyx",
  "orbit",
  "petal",
  "pylon",
  "quartz",
  "quill",
  "ripple",
  "sable",
  "saffron",
  "shale",
  "solace",
  "spindle",
  "sprig",
  "tallow",
  "thicket",
  "tide",
  "truss",
  "umbra",
  "vale",
  "velvet",
  "vigor",
  "willow",
  "wisp",
  "zenith"
] as const;

export interface SimulationRuntime {
  rng: Rng;
  state: SimState;
  nextId: number;
  nextDialectId: number;
  grid: UniformGrid;
  biasGlyph: string | null;
  biasTicksRemaining: number;
  bondStormTicksRemaining: number;
  peakPopulation: number;
  dialectEpochs: DialectEpoch[];
  massExtinctionActive: boolean;
  score: Score;
  scoreArchive: Score;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function randomGlyph(rng: Rng): string {
  return rng.pick(GLYPHS);
}

function pairKey(idA: number, idB: number): string {
  if (idA < idB) {
    return `${idA}:${idB}`;
  }
  return `${idB}:${idA}`;
}

function appendWithHistoryCap(history: string[], value: string, maxSize: number): void {
  history.push(value);
  if (history.length > maxSize) {
    history.splice(0, history.length - maxSize);
  }
}

function appendMotif(state: SimState, motif: string): void {
  appendWithHistoryCap(state.motifs, motif, MAX_MOTIF_HISTORY);
}

function appendWord(state: SimState, word: string): void {
  appendWithHistoryCap(state.words, word, MAX_WORD_HISTORY);
}

function appendPhrase(state: SimState, phrase: string): void {
  appendWithHistoryCap(state.phrases, phrase, MAX_PHRASE_HISTORY);
}

function hashMotif(motif: string): number {
  let hash = 2166136261;
  for (let i = 0; i < motif.length; i += 1) {
    hash ^= motif.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function wordFromMotif(motif: string): string {
  return WORD_LEXICON[hashMotif(motif) % WORD_LEXICON.length];
}

function appendClusterLanguageSignals(
  state: SimState,
  rng: Rng,
  bonds: Bond[],
  contactPairs: Set<string>,
  livingLexemes: Map<number, Lexeme>
): void {
  const adjacency = new Map<number, number[]>();
  for (const bond of bonds) {
    if (!contactPairs.has(pairKey(bond.idA, bond.idB))) {
      continue;
    }
    if (bond.strength < 0.16) {
      continue;
    }

    const aNeighbors = adjacency.get(bond.idA);
    if (aNeighbors === undefined) {
      adjacency.set(bond.idA, [bond.idB]);
    } else {
      aNeighbors.push(bond.idB);
    }

    const bNeighbors = adjacency.get(bond.idB);
    if (bNeighbors === undefined) {
      adjacency.set(bond.idB, [bond.idA]);
    } else {
      bNeighbors.push(bond.idA);
    }
  }

  if (adjacency.size === 0) {
    return;
  }

  const visited = new Set<number>();
  for (const startId of adjacency.keys()) {
    if (visited.has(startId)) {
      continue;
    }

    const queue: number[] = [startId];
    const component: number[] = [];
    visited.add(startId);

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) {
        continue;
      }
      component.push(current);
      const neighbors = adjacency.get(current);
      if (neighbors === undefined) {
        continue;
      }
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) {
          continue;
        }
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }

    if (component.length < MOTIF_MIN_CLUSTER_SIZE) {
      continue;
    }
    if (!rng.chance(MOTIF_FORMATION_CHANCE)) {
      continue;
    }

    const lexemeSequence: Lexeme[] = [];
    for (const id of component) {
      const lexeme = livingLexemes.get(id);
      if (lexeme !== undefined) {
        lexemeSequence.push(lexeme);
      }
    }

    if (lexemeSequence.length < MOTIF_MIN_CLUSTER_SIZE) {
      continue;
    }

    lexemeSequence.sort((a, b) => a.x - b.x || a.y - b.y || a.id - b.id);
    const motif = lexemeSequence
      .slice(0, MOTIF_MAX_LENGTH)
      .map((lexeme) => lexeme.glyph)
      .join("");

    if (motif.length < MOTIF_MIN_CLUSTER_SIZE) {
      continue;
    }
    if (new Set(motif).size < MOTIF_MIN_UNIQUE_GLYPHS) {
      continue;
    }

    appendMotif(state, motif);
    const previousWord = state.words[state.words.length - 1];
    const word = wordFromMotif(motif);
    appendWord(state, word);
    if (previousWord !== undefined) {
      // Phrases are now sequential word pairs derived from motif tokens.
      appendPhrase(state, `${previousWord} ${word}`);
    }
  }
}

function appendEvent(state: SimState, event: SimEvent): void {
  state.events.push(event);
  if (state.events.length > MAX_EVENTS) {
    state.events.splice(0, state.events.length - MAX_EVENTS);
  }
}

function mutateGlyph(glyph: string, rng: Rng): string {
  if (glyph.length === 0) {
    return randomGlyph(rng);
  }

  const choice = rng.int(0, 2);
  if (choice === 0 || glyph.length === 1) {
    return randomGlyph(rng);
  }
  if (choice === 1) {
    const idx = rng.int(0, glyph.length - 1);
    return glyph.slice(0, idx) + randomGlyph(rng) + glyph.slice(idx + 1);
  }

  return glyph.slice(0, 2);
}

function chooseSpawnGlyph(
  rng: Rng,
  biasGlyph: string | null,
  biasTicksRemaining: number
): string {
  if (biasGlyph !== null && biasTicksRemaining > 0 && rng.chance(GLYPH_BIAS_CHANCE)) {
    return biasGlyph;
  }
  return randomGlyph(rng);
}

function makeRandomLexeme(
  id: number,
  width: number,
  height: number,
  rng: Rng,
  biasGlyph: string | null,
  biasTicksRemaining: number
): Lexeme {
  const speedTrait = rng.float(0.6, 2.1);
  const angle = rng.float(0, Math.PI * 2);
  const speed = rng.float(0.2, speedTrait);
  return {
    id,
    parentId: null,
    x: rng.float(0, width),
    y: rng.float(0, height),
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    glyph: chooseSpawnGlyph(rng, biasGlyph, biasTicksRemaining),
    energy: rng.float(0.8, 1.4),
    age: 0,
    traits: {
      mutationRate: rng.float(0.01, 0.09),
      speed: speedTrait
    }
  };
}

function spawnChild(parent: Lexeme, id: number, width: number, height: number, rng: Rng): Lexeme {
  const angle = rng.float(0, Math.PI * 2);
  const childSpeedTrait = clamp(
    parent.traits.speed + rng.float(-0.22, 0.22),
    MIN_SPEED_TRAIT,
    MAX_SPEED_TRAIT
  );
  const childMutationRate = clamp(
    parent.traits.mutationRate + rng.float(-0.014, 0.014),
    MIN_MUTATION_RATE,
    MAX_MUTATION_RATE
  );
  const glyph =
    rng.chance(parent.traits.mutationRate) || rng.chance(childMutationRate)
      ? mutateGlyph(parent.glyph, rng)
      : parent.glyph;

  return {
    id,
    parentId: parent.id,
    x: clamp(parent.x + rng.float(-8, 8), 0, width),
    y: clamp(parent.y + rng.float(-8, 8), 0, height),
    vx: Math.cos(angle) * rng.float(0.2, childSpeedTrait),
    vy: Math.sin(angle) * rng.float(0.2, childSpeedTrait),
    glyph,
    energy: 0,
    age: 0,
    traits: {
      mutationRate: childMutationRate,
      speed: childSpeedTrait
    }
  };
}

function integrateMotion(lexeme: Lexeme, width: number, height: number, rng: Rng): void {
  lexeme.vx += rng.float(-0.08, 0.08);
  lexeme.vy += rng.float(-0.08, 0.08);

  const velocity = Math.hypot(lexeme.vx, lexeme.vy);
  const maxSpeed = lexeme.traits.speed;
  if (velocity > maxSpeed && velocity > 0) {
    const ratio = maxSpeed / velocity;
    lexeme.vx *= ratio;
    lexeme.vy *= ratio;
  }

  lexeme.x += lexeme.vx;
  lexeme.y += lexeme.vy;

  if (lexeme.x <= 0) {
    lexeme.x = 0;
    lexeme.vx = Math.abs(lexeme.vx);
  } else if (lexeme.x >= width) {
    lexeme.x = width;
    lexeme.vx = -Math.abs(lexeme.vx);
  }

  if (lexeme.y <= 0) {
    lexeme.y = 0;
    lexeme.vy = Math.abs(lexeme.vy);
  } else if (lexeme.y >= height) {
    lexeme.y = height;
    lexeme.vy = -Math.abs(lexeme.vy);
  }
}

function findActiveDialectEpoch(
  dialectEpochs: DialectEpoch[],
  glyph: string
): DialectEpoch | null {
  for (let i = dialectEpochs.length - 1; i >= 0; i -= 1) {
    const epoch = dialectEpochs[i];
    if (epoch.glyph === glyph && epoch.extinctAt === null) {
      return epoch;
    }
  }
  return null;
}

function updateDialects(runtime: SimulationRuntime): void {
  const { state } = runtime;
  const totalLexemes = state.lexemes.length;
  const glyphCounts = new Map<string, number>();
  for (const lexeme of state.lexemes) {
    const count = glyphCounts.get(lexeme.glyph) ?? 0;
    glyphCounts.set(lexeme.glyph, count + 1);
  }

  const candidates = [...glyphCounts.entries()]
    .filter((entry) => entry[1] >= DIALECT_MIN_POPULATION)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_DIALECTS);

  const existingByGlyph = new Map<string, Dialect>();
  for (const dialect of state.dialects) {
    existingByGlyph.set(dialect.dominantGlyph, dialect);
  }

  const nextDialects: Dialect[] = [];
  const nextGlyphs = new Set<string>();
  for (const [dominantGlyph, population] of candidates) {
    nextGlyphs.add(dominantGlyph);
    const existing = existingByGlyph.get(dominantGlyph);
    if (existing !== undefined) {
      nextDialects.push({
        id: existing.id,
        dominantGlyph,
        population,
        age: existing.age + DIALECT_SCAN_INTERVAL
      });

      const activeEpoch = findActiveDialectEpoch(runtime.dialectEpochs, dominantGlyph);
      if (activeEpoch !== null) {
        activeEpoch.peakPopulation = Math.max(activeEpoch.peakPopulation, population);
      } else {
        runtime.dialectEpochs.push({
          glyph: dominantGlyph,
          bornAt: state.tick,
          extinctAt: null,
          peakPopulation: population
        });
      }
      continue;
    }

    nextDialects.push({
      id: runtime.nextDialectId,
      dominantGlyph,
      population,
      age: 0
    });
    appendEvent(state, {
      tick: state.tick,
      type: "dialect-born",
      payload: `${dominantGlyph} emerged with ${population}`
    });
    runtime.dialectEpochs.push({
      glyph: dominantGlyph,
      bornAt: state.tick,
      extinctAt: null,
      peakPopulation: population
    });
    runtime.nextDialectId += 1;
  }

  for (const previous of state.dialects) {
    if (nextGlyphs.has(previous.dominantGlyph)) {
      continue;
    }
    appendEvent(state, {
      tick: state.tick,
      type: "dialect-extinct",
      payload: `${previous.dominantGlyph} vanished at age ${previous.age}`
    });
    const activeEpoch = findActiveDialectEpoch(runtime.dialectEpochs, previous.dominantGlyph);
    if (activeEpoch !== null) {
      activeEpoch.extinctAt = state.tick;
    }
  }

  if (totalLexemes > 0) {
    const dominantDialects = nextDialects.filter(
      (dialect) => dialect.population > totalLexemes * DIALECT_DOMINANCE_RATIO
    );
    if (dominantDialects.length === 1) {
      const dominant = dominantDialects[0];
      appendEvent(state, {
        tick: state.tick,
        type: "dialect-dominant",
        payload: `${dominant.dominantGlyph} at ${dominant.population}/${totalLexemes}`
      });
    }
  }

  state.dialects = nextDialects;
}

export function applyFoodBurst(
  runtime: SimulationRuntime,
  x: number,
  y: number,
  radius: number
): void {
  const radiusSq = radius * radius;
  for (const lexeme of runtime.state.lexemes) {
    const dx = lexeme.x - x;
    const dy = lexeme.y - y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= radiusSq) {
      lexeme.energy += 0.6;
    }
  }
}

export function initSimulation(seed: number, width: number, height: number): SimulationRuntime {
  const rng = new Rng(seed);
  const state: SimState = {
    seed,
    tick: 0,
    width,
    height,
    biasGlyph: undefined,
    biasTicksRemaining: 0,
    bondStormTicksRemaining: 0,
    lexemes: [],
    bonds: [],
    motifs: [],
    words: [],
    phrases: [],
    dialects: [],
    events: []
  };

  let nextId = 1;
  for (let i = 0; i < START_POPULATION; i += 1) {
    state.lexemes.push(makeRandomLexeme(nextId, width, height, rng, null, 0));
    nextId += 1;
  }

  return {
    rng,
    state,
    nextId,
    nextDialectId: 1,
    grid: new UniformGrid(width, height, GRID_CELL_SIZE),
    biasGlyph: null,
    biasTicksRemaining: 0,
    bondStormTicksRemaining: 0,
    peakPopulation: state.lexemes.length,
    dialectEpochs: [],
    massExtinctionActive: false,
    score: new Score(),
    scoreArchive: new Score()
  };
}

export function tickSimulation(runtime: SimulationRuntime): SimState {
  const { state, rng } = runtime;
  state.tick += 1;

  const scarcityBoost = state.lexemes.length < 80 ? 1 + (80 - state.lexemes.length) / 80 : 1;

  for (const lexeme of state.lexemes) {
    lexeme.age += 1;
    // Passive environmental gain keeps the reef from collapsing into mandatory micromanagement.
    lexeme.energy += AMBIENT_ENERGY_GAIN * scarcityBoost;
    lexeme.energy -= BASE_DECAY + lexeme.traits.speed * SPEED_DECAY_MULTIPLIER;
    integrateMotion(lexeme, state.width, state.height, rng);
  }

  const contactPairs = new Set<string>();
  const visitedPairs = new Set<string>();
  const bondByKey = new Map<string, Bond>();
  for (const bond of state.bonds) {
    bondByKey.set(pairKey(bond.idA, bond.idB), bond);
  }

  runtime.grid.clear();
  const lexemeById = new Map<number, Lexeme>();
  for (const lexeme of state.lexemes) {
    lexemeById.set(lexeme.id, lexeme);
    runtime.grid.insert(lexeme.id, lexeme.x, lexeme.y);
  }

  const effectiveBondChance = Math.min(
    1,
    BOND_FORMATION_CHANCE * (runtime.bondStormTicksRemaining > 0 ? 10 : 1)
  );

  const newBonds: Bond[] = [];
  for (const a of state.lexemes) {
    const neighborIds = runtime.grid.queryNeighbors(a.x, a.y);
    for (const neighborId of neighborIds) {
      if (neighborId === a.id) {
        continue;
      }

      const key = pairKey(a.id, neighborId);
      if (visitedPairs.has(key)) {
        continue;
      }
      visitedPairs.add(key);

      const b = lexemeById.get(neighborId);
      if (b === undefined) {
        continue;
      }

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distSq = dx * dx + dy * dy;
      if (distSq > CONTACT_RADIUS_SQ) {
        continue;
      }

      contactPairs.add(key);

      const energyDiff = a.energy - b.energy;
      const transfer = energyDiff * 0.022;
      a.energy -= transfer;
      b.energy += transfer;

      if (distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        const nx = dx / dist;
        const ny = dy / dist;
        const repel = (CONTACT_RADIUS - dist) * 0.0018;
        a.vx -= nx * repel;
        a.vy -= ny * repel;
        b.vx += nx * repel;
        b.vy += ny * repel;
      }

      if (rng.chance(0.009)) {
        const pulse = rng.float(0.02, 0.055);
        if (rng.chance(0.5)) {
          a.energy += pulse;
        } else {
          b.energy += pulse;
        }
      }

      if (
        a.energy > 0.9 &&
        b.energy > 0.9 &&
        !bondByKey.has(key) &&
        state.bonds.length + newBonds.length < MAX_BONDS &&
        rng.chance(effectiveBondChance)
      ) {
        const idA = Math.min(a.id, b.id);
        const idB = Math.max(a.id, b.id);
        const bond: Bond = {
          idA,
          idB,
          strength: 0.12,
          age: 0
        };
        newBonds.push(bond);
        bondByKey.set(key, bond);
      }
    }
  }
  if (newBonds.length > 0) {
    state.bonds.push(...newBonds);
  }

  const newborns: Lexeme[] = [];
  for (const lexeme of state.lexemes) {
    if (lexeme.energy < REPRODUCTION_THRESHOLD) {
      continue;
    }
    if (state.lexemes.length + newborns.length >= MAX_POPULATION) {
      break;
    }

    const fertility = REPRODUCTION_CHANCE + lexeme.traits.mutationRate * 0.25;
    if (!rng.chance(fertility)) {
      continue;
    }

    const child = spawnChild(lexeme, runtime.nextId, state.width, state.height, rng);
    runtime.nextId += 1;
    const childEnergy = lexeme.energy * 0.46;
    lexeme.energy *= 0.54;
    child.energy = childEnergy;
    newborns.push(child);
  }

  state.lexemes = state.lexemes.filter((lexeme) => lexeme.energy >= 0);
  if (newborns.length > 0) {
    state.lexemes.push(...newborns);
  }

  if (state.lexemes.length === 0) {
    for (let i = 0; i < RESPAWN_POPULATION; i += 1) {
      state.lexemes.push(
        makeRandomLexeme(
          runtime.nextId,
          state.width,
          state.height,
          rng,
          runtime.biasGlyph,
          runtime.biasTicksRemaining
        )
      );
      runtime.nextId += 1;
    }
  }

  runtime.peakPopulation = Math.max(runtime.peakPopulation, state.lexemes.length);

  const belowMassThreshold = state.lexemes.length < MASS_EXTINCTION_THRESHOLD;
  if (belowMassThreshold && !runtime.massExtinctionActive) {
    appendEvent(state, {
      tick: state.tick,
      type: "mass-extinction",
      payload: `population at ${state.lexemes.length}`
    });
  }
  runtime.massExtinctionActive = belowMassThreshold;

  const livingLexemes = new Map<number, Lexeme>();
  for (const lexeme of state.lexemes) {
    livingLexemes.set(lexeme.id, lexeme);
  }

  const nextBonds: Bond[] = [];
  for (const bond of state.bonds) {
    const a = livingLexemes.get(bond.idA);
    const b = livingLexemes.get(bond.idB);
    if (a === undefined || b === undefined) {
      continue;
    }

    const inContact = contactPairs.has(pairKey(bond.idA, bond.idB));
    bond.age += 1;
    if (inContact) {
      bond.strength += BOND_STRENGTHEN_RATE;
    } else {
      bond.strength -= BOND_WEAKEN_RATE;
    }

    if (bond.strength < 0) {
      continue;
    }

    bond.strength = clamp(bond.strength, 0, 1.5);
    nextBonds.push(bond);
  }
  state.bonds = nextBonds;
  appendClusterLanguageSignals(state, rng, state.bonds, contactPairs, livingLexemes);

  if (state.tick % DIALECT_SCAN_INTERVAL === 0) {
    updateDialects(runtime);
  }

  if (runtime.biasTicksRemaining > 0) {
    runtime.biasTicksRemaining -= 1;
    if (runtime.biasTicksRemaining === 0) {
      runtime.biasGlyph = null;
    }
  }

  if (runtime.bondStormTicksRemaining > 0) {
    runtime.bondStormTicksRemaining -= 1;
  }

  state.biasGlyph = runtime.biasGlyph === null ? undefined : runtime.biasGlyph;
  state.biasTicksRemaining = runtime.biasTicksRemaining;
  state.bondStormTicksRemaining = runtime.bondStormTicksRemaining;

  return state;
}
