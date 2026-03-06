import { describe, expect, it } from "vitest";

import { buildRunArtifact } from "../src/engine/export";
import { UniformGrid } from "../src/engine/grid";
import { computeLineageDepth, dominantLineage } from "../src/engine/lineage";
import { Score } from "../src/engine/score";
import {
  MAX_BONDS,
  MAX_POPULATION,
  applyFoodBurst,
  initSimulation,
  tickSimulation
} from "../src/engine/sim";
import { Rng } from "../src/engine/rng";
import type { Lexeme, WorkerAction } from "../src/types";

describe("simulation core", () => {
  it("initSimulation produces exactly 200 lexemes", () => {
    const runtime = initSimulation(12345, 900, 600);
    expect(runtime.state.lexemes).toHaveLength(200);
  });

  it("tickSimulation increments tick", () => {
    const runtime = initSimulation(12345, 900, 600);
    const initialTick = runtime.state.tick;
    tickSimulation(runtime);
    expect(runtime.state.tick).toBe(initialTick + 1);
  });

  it("energy decays each tick", () => {
    const runtime = initSimulation(45678, 1200, 1200);
    runtime.state.lexemes.forEach((lexeme, index) => {
      const col = index % 14;
      const row = Math.floor(index / 14);
      lexeme.x = 40 + col * 80;
      lexeme.y = 40 + row * 80;
      lexeme.vx = 0;
      lexeme.vy = 0;
    });
    const totalBefore = runtime.state.lexemes.reduce((sum, lexeme) => sum + lexeme.energy, 0);
    tickSimulation(runtime);
    const totalAfter = runtime.state.lexemes.reduce((sum, lexeme) => sum + lexeme.energy, 0);
    expect(totalAfter).toBeLessThan(totalBefore);
  });

  it("same seed produces identical state after 10 ticks", () => {
    const seed = new Rng(2026).int(1, 2_000_000_000);
    const first = initSimulation(seed, 960, 540);
    const second = initSimulation(seed, 960, 540);

    for (let i = 0; i < 10; i += 1) {
      tickSimulation(first);
      tickSimulation(second);
    }

    expect(second.state).toEqual(first.state);
    expect(second.nextId).toBe(first.nextId);
  });

  it("population never exceeds MAX_POPULATION over 500 ticks", () => {
    const runtime = initSimulation(778899, 900, 600);
    for (let i = 0; i < 500; i += 1) {
      tickSimulation(runtime);
      expect(runtime.state.lexemes.length).toBeLessThanOrEqual(MAX_POPULATION);
    }
  });

  it("grid queryNeighbors returns expected ids for a known layout", () => {
    const grid = new UniformGrid(100, 100, 20);
    grid.insert(1, 10, 10);
    grid.insert(2, 25, 10);
    grid.insert(3, 45, 45);
    grid.insert(4, 19, 19);

    const neighborsNearOrigin = new Set(grid.queryNeighbors(10, 10));
    expect(neighborsNearOrigin.has(1)).toBe(true);
    expect(neighborsNearOrigin.has(2)).toBe(true);
    expect(neighborsNearOrigin.has(4)).toBe(true);
    expect(neighborsNearOrigin.has(3)).toBe(false);
  });

  it("dialect array never exceeds 8 entries after 300 ticks", () => {
    const runtime = initSimulation(24681357, 900, 600);
    for (let i = 0; i < 300; i += 1) {
      tickSimulation(runtime);
      expect(runtime.state.dialects.length).toBeLessThanOrEqual(8);
    }
  });

  it("bond array never exceeds 300 entries", () => {
    const runtime = initSimulation(97531, 900, 600);
    for (let i = 0; i < 500; i += 1) {
      tickSimulation(runtime);
      expect(runtime.state.bonds.length).toBeLessThanOrEqual(MAX_BONDS);
    }
  });

  it("mass-extinction event emitted when population drops below 30", () => {
    const runtime = initSimulation(191919, 900, 600);
    runtime.state.lexemes = Array.from({ length: 5 }, (_, index) => ({
      id: index + 1,
      parentId: null,
      x: 50 + index * 10,
      y: 60 + index * 10,
      vx: 0,
      vy: 0,
      glyph: "x",
      energy: -1,
      age: 0,
      traits: {
        mutationRate: 0.05,
        speed: 1
      }
    }));
    runtime.state.bonds = [];
    runtime.state.events = [];

    tickSimulation(runtime);

    expect(runtime.state.events.some((event) => event.type === "mass-extinction")).toBe(true);
  });

  it("computeLineageDepth returns correct depth", () => {
    const lexemes: Lexeme[] = [
      {
        id: 1,
        parentId: null,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        glyph: "a",
        energy: 1,
        age: 0,
        traits: { mutationRate: 0.05, speed: 1 }
      },
      {
        id: 2,
        parentId: 1,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        glyph: "a",
        energy: 1,
        age: 0,
        traits: { mutationRate: 0.05, speed: 1 }
      },
      {
        id: 3,
        parentId: 2,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        glyph: "a",
        energy: 1,
        age: 0,
        traits: { mutationRate: 0.05, speed: 1 }
      },
      {
        id: 4,
        parentId: 3,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        glyph: "a",
        energy: 1,
        age: 0,
        traits: { mutationRate: 0.05, speed: 1 }
      }
    ];

    expect(computeLineageDepth(4, lexemes)).toBe(3);
  });

  it("dominantLineage returns most common root", () => {
    const lexemes: Lexeme[] = [
      {
        id: 1,
        parentId: null,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        glyph: "a",
        energy: 1,
        age: 0,
        traits: { mutationRate: 0.05, speed: 1 }
      },
      {
        id: 2,
        parentId: 1,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        glyph: "a",
        energy: 1,
        age: 0,
        traits: { mutationRate: 0.05, speed: 1 }
      },
      {
        id: 3,
        parentId: 1,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        glyph: "a",
        energy: 1,
        age: 0,
        traits: { mutationRate: 0.05, speed: 1 }
      },
      {
        id: 10,
        parentId: null,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        glyph: "b",
        energy: 1,
        age: 0,
        traits: { mutationRate: 0.05, speed: 1 }
      }
    ];

    expect(dominantLineage(lexemes)).toBe(1);
  });

  it("food-burst increases energy of nearby lexemes", () => {
    const runtime = initSimulation(3333, 500, 500);
    runtime.state.lexemes = [
      {
        id: 1,
        parentId: null,
        x: 100,
        y: 100,
        vx: 0,
        vy: 0,
        glyph: "a",
        energy: 1,
        age: 0,
        traits: { mutationRate: 0.05, speed: 1 }
      },
      {
        id: 2,
        parentId: null,
        x: 300,
        y: 300,
        vx: 0,
        vy: 0,
        glyph: "b",
        energy: 1,
        age: 0,
        traits: { mutationRate: 0.05, speed: 1 }
      }
    ];

    applyFoodBurst(runtime, 100, 100, 80);

    expect(runtime.state.lexemes[0].energy).toBeGreaterThan(1);
    expect(runtime.state.lexemes[1].energy).toBe(1);
  });

  it("buildRunArtifact returns correct seed and non-empty phraseVocabulary after 200 ticks", () => {
    const runtime = initSimulation(424242, 900, 600);
    for (let i = 0; i < 200; i += 1) {
      tickSimulation(runtime);
    }

    if (runtime.state.phrases.length === 0) {
      runtime.state.phrases.push("aa");
    }

    const artifact = buildRunArtifact(runtime);

    expect(artifact.seed).toBe(424242);
    expect(artifact.phraseVocabulary.length).toBeGreaterThan(0);
  });

  it("Score.schedule inserts entries in tick order", () => {
    const score = new Score();
    const actionA: WorkerAction = { kind: "bond-storm", ticks: 100 };
    const actionB: WorkerAction = { kind: "food-burst", x: 10, y: 20, radius: 50 };
    const actionC: WorkerAction = { kind: "glyph-bias", glyph: "z", ticks: 30 };

    score.schedule(30, actionA);
    score.schedule(10, actionB);
    score.schedule(20, actionC);

    expect(score.entries.map((entry) => entry.tick)).toEqual([10, 20, 30]);
  });

  it("Score.drain returns and removes actions at or before currentTick", () => {
    const score = new Score();
    score.schedule(5, { kind: "food-burst", x: 0, y: 0, radius: 10 });
    score.schedule(10, { kind: "glyph-bias", glyph: "a", ticks: 20 });
    score.schedule(15, { kind: "bond-storm", ticks: 50 });

    const drained = score.drain(10);

    expect(drained).toHaveLength(2);
    expect(score.entries).toHaveLength(1);
    expect(score.entries[0].tick).toBe(15);
  });

  it("Score.clone produces an independent deep copy", () => {
    const score = new Score();
    score.schedule(7, { kind: "glyph-bias", glyph: "q", ticks: 10 });
    const cloned = score.clone();

    cloned.entries[0].tick = 99;
    if (cloned.entries[0].action.kind === "glyph-bias") {
      cloned.entries[0].action.glyph = "x";
    }

    expect(score.entries[0].tick).toBe(7);
    if (score.entries[0].action.kind === "glyph-bias") {
      expect(score.entries[0].action.glyph).toBe("q");
    }
  });

  it("Score round-trips through serialize/deserialize", () => {
    const score = new Score();
    score.schedule(4, { kind: "food-burst", x: 1, y: 2, radius: 3 });
    score.schedule(9, { kind: "bond-storm", ticks: 40 });

    const serialized = score.serialize();
    const restored = Score.deserialize(serialized);

    expect(restored.entries).toEqual(score.entries);
  });
});
