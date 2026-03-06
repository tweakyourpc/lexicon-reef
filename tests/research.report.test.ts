import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildSeedList,
  formatResearchSummary,
  runResearchSweep
} from "../src/engine/research";

function parseEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

describe("research sweep report", () => {
  it("generates deterministic sweep metrics and writes artifacts", () => {
    const runCount = Math.max(1, parseEnvInt("LEXICON_RESEARCH_RUNS", 24));
    const ticks = Math.max(1, parseEnvInt("LEXICON_RESEARCH_TICKS", 1200));
    const width = Math.max(1, parseEnvInt("LEXICON_RESEARCH_WIDTH", 900));
    const height = Math.max(1, parseEnvInt("LEXICON_RESEARCH_HEIGHT", 600));
    const baseSeed = Math.max(1, parseEnvInt("LEXICON_RESEARCH_BASE_SEED", 20260222));
    const seeds = buildSeedList(runCount, baseSeed);

    const baselineA = runResearchSweep({ seeds, ticks, width, height, policy: "none" });
    const baselineB = runResearchSweep({ seeds, ticks, width, height, policy: "none" });
    const adaptiveA = runResearchSweep({
      seeds,
      ticks,
      width,
      height,
      policy: "adaptive-nurture"
    });
    const adaptiveB = runResearchSweep({
      seeds,
      ticks,
      width,
      height,
      policy: "adaptive-nurture"
    });
    expect(baselineA).toEqual(baselineB);
    expect(adaptiveA).toEqual(adaptiveB);

    const reportLines = [
      formatResearchSummary(baselineA),
      "",
      formatResearchSummary(adaptiveA),
      "",
      "# Policy Delta",
      "",
      `collapseRate delta=${((adaptiveA.collapseRate - baselineA.collapseRate) * 100).toFixed(2)}pp`,
      `recoveryAmongCollapsed delta=${(
        (adaptiveA.recoveryRateAmongCollapsed - baselineA.recoveryRateAmongCollapsed) *
        100
      ).toFixed(2)}pp`,
      `meanFinalPopulation delta=${(
        adaptiveA.meanFinalPopulation - baselineA.meanFinalPopulation
      ).toFixed(2)}`,
      `meanMaxDialects delta=${(adaptiveA.meanMaxDialects - baselineA.meanMaxDialects).toFixed(
        2
      )}`,
      `meanMaxUniqueMotifs delta=${(
        adaptiveA.meanMaxUniqueMotifs - baselineA.meanMaxUniqueMotifs
      ).toFixed(2)}`,
      `meanMaxUniqueWords delta=${(
        adaptiveA.meanMaxUniqueWords - baselineA.meanMaxUniqueWords
      ).toFixed(2)}`,
      `meanMaxUniquePhrases delta=${(
        adaptiveA.meanMaxUniquePhrases - baselineA.meanMaxUniquePhrases
      ).toFixed(2)}`,
      `meanAssistCount delta=${(adaptiveA.meanAssistCount - baselineA.meanAssistCount).toFixed(2)}`
    ];
    const report = reportLines.join("\n");
    const artifactDir = resolve("artifacts", "research");
    mkdirSync(artifactDir, { recursive: true });

    const stamp = `${baselineA.runCount}x${baselineA.ticks}-seed${baseSeed}`;
    const jsonPath = resolve(artifactDir, `sweep-${stamp}.json`);
    const markdownPath = resolve(artifactDir, `sweep-${stamp}.md`);
    const latestJsonPath = resolve(artifactDir, "latest.json");
    const latestMarkdownPath = resolve(artifactDir, "latest.md");

    const payload = {
      generatedAt: new Date().toISOString(),
      baseSeed,
      baseline: baselineA,
      adaptive: adaptiveA
    };

    writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
    writeFileSync(markdownPath, `${report}\n`);
    writeFileSync(latestJsonPath, `${JSON.stringify(payload, null, 2)}\n`);
    writeFileSync(latestMarkdownPath, `${report}\n`);

    console.log("\n" + report + "\n");
    console.log(`[research] wrote ${jsonPath}`);
    console.log(`[research] wrote ${markdownPath}`);
    console.log(`[research] updated ${latestJsonPath}`);
    console.log(`[research] updated ${latestMarkdownPath}`);

    expect(baselineA.runs).toHaveLength(runCount);
    expect(adaptiveA.runs).toHaveLength(runCount);
    expect(baselineA.collapseRate).toBeGreaterThanOrEqual(0);
    expect(baselineA.collapseRate).toBeLessThanOrEqual(1);
    expect(adaptiveA.collapseRate).toBeGreaterThanOrEqual(0);
    expect(adaptiveA.collapseRate).toBeLessThanOrEqual(1);
    expect(report).toContain("diversity meanMax motifs=");
    expect(report).toContain("meanMaxUniqueMotifs delta=");
    expect(report).toContain("meanMaxUniqueWords delta=");
    expect(report).toContain("meanMaxUniquePhrases delta=");
  }, 30000);
});
