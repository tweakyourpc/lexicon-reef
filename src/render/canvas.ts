import type { SimEvent, SimState } from "../types";

export interface RenderOptions {
  showDetailedHud?: boolean;
}

export const DIALECT_COLORS = [
  "#f4a261",
  "#e76f51",
  "#2a9d8f",
  "#e9c46a",
  "#264653",
  "#a8dadc",
  "#457b9d",
  "#1d3557"
];

const EVENT_COLORS: Record<SimEvent["type"], string> = {
  "dialect-born": "#2a9d8f",
  "dialect-extinct": "#e76f51",
  "dialect-dominant": "#e9c46a",
  "mass-extinction": "#f72585"
};

function energyColor(energy: number): string {
  const clamped = Math.max(0, Math.min(2.4, energy));
  const t = clamped / 2.4;
  const hue = 8 + t * 172;
  const sat = 78;
  const light = 42 + t * 24;
  return `hsl(${hue.toFixed(1)} ${sat}% ${light.toFixed(1)}%)`;
}

function computeRunScore(state: SimState): number {
  const uniquePhrases = new Set(state.phrases).size;
  const hasDominance = state.events.some((event) => event.type === "dialect-dominant");
  const recoveredFromCrash =
    state.events.some((event) => event.type === "mass-extinction") && state.lexemes.length >= 140;

  let score = 0;
  score += uniquePhrases * 12;
  score += state.dialects.length * 35;
  score += Math.min(180, state.bonds.length);
  score += Math.floor(state.lexemes.length * 0.4);
  if (hasDominance) {
    score += 180;
  }
  if (recoveredFromCrash) {
    score += 140;
  }
  return Math.floor(score);
}

function describeReefState(state: SimState, meanEnergy: number): string {
  const population = state.lexemes.length;
  const diversity = state.dialects.length;

  if (population < 30 || meanEnergy < 0.35) {
    return "reef state: collapse risk";
  }
  if (population < 70 || meanEnergy < 0.52) {
    return "reef state: fragile";
  }
  if (diversity >= 3 && meanEnergy > 0.72 && population > 120) {
    return "reef state: thriving";
  }
  if (diversity >= 2 && meanEnergy > 0.62 && population > 85) {
    return "reef state: stable growth";
  }
  return "reef state: transitional";
}

export function render(ctx: CanvasRenderingContext2D, state: SimState, options: RenderOptions = {}): void {
  const showDetailedHud = options.showDetailedHud ?? false;
  const width = state.width;
  const height = state.height;

  ctx.fillStyle = "rgba(7, 9, 15, 0.34)";
  ctx.fillRect(0, 0, width, height);

  const lexemeById = new Map<number, { x: number; y: number }>();
  for (const lexeme of state.lexemes) {
    lexemeById.set(lexeme.id, { x: lexeme.x, y: lexeme.y });
  }

  for (const bond of state.bonds) {
    const a = lexemeById.get(bond.idA);
    const b = lexemeById.get(bond.idB);
    if (a === undefined || b === undefined) {
      continue;
    }

    const opacity = Math.min(0.45, Math.max(0.05, bond.strength * 0.35));
    ctx.strokeStyle = `rgba(128, 196, 255, ${opacity.toFixed(3)})`;
    ctx.lineWidth = 0.7 + Math.min(1.6, bond.strength * 1.1);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  for (const lexeme of state.lexemes) {
    const size = 10 + Math.min(9, lexeme.traits.speed * 2.3 + lexeme.age * 0.004);
    ctx.font = `${size.toFixed(1)}px "Iosevka", "SF Mono", Menlo, Consolas, monospace`;
    ctx.fillStyle = energyColor(lexeme.energy);
    ctx.fillText(lexeme.glyph, lexeme.x, lexeme.y);
  }

  let meanEnergy = 0;
  if (state.lexemes.length > 0) {
    const totalEnergy = state.lexemes.reduce((sum, lexeme) => sum + lexeme.energy, 0);
    meanEnergy = totalEnergy / state.lexemes.length;
  }
  const uniqueMotifs = new Set(state.motifs).size;
  const uniqueWords = new Set(state.words).size;
  const uniquePhrases = new Set(state.phrases).size;

  const hudWidth = 270;
  const hudHeight = 156;
  ctx.fillStyle = "rgba(2, 4, 8, 0.62)";
  ctx.fillRect(12, 12, hudWidth, hudHeight);
  ctx.strokeStyle = "rgba(162, 211, 255, 0.45)";
  ctx.strokeRect(12.5, 12.5, hudWidth - 1, hudHeight - 1);

  ctx.fillStyle = "#d3edff";
  ctx.font = '12px "Iosevka", "SF Mono", Menlo, Consolas, monospace';
  ctx.fillText(`seed: ${state.seed}`, 20, 34);
  ctx.fillText(`tick: ${state.tick}`, 20, 50);
  ctx.fillText(`population: ${state.lexemes.length}`, 20, 66);
  ctx.fillText(`mean energy: ${meanEnergy.toFixed(3)}`, 20, 82);
  ctx.fillText(`motifs: ${uniqueMotifs}`, 20, 98);
  ctx.fillText(`words: ${uniqueWords} | phrases: ${uniquePhrases}`, 20, 114);

  const biasTicks = state.biasTicksRemaining ?? 0;
  if (biasTicks > 0) {
    const glyph = state.biasGlyph ?? "?";
    ctx.fillStyle = "#e9c46a";
    ctx.fillText(`bias: ${glyph} (${biasTicks} ticks)`, 20, 132);
  }

  const stormTicks = state.bondStormTicksRemaining ?? 0;
  if (stormTicks > 0) {
    ctx.fillStyle = "#9d4edd";
    ctx.fillText(`bond storm: ${stormTicks}`, 20, 148);
  }

  if (showDetailedHud) {
    const phraseHudWidth = 248;
    const phraseHudHeight = 152;
    const phraseHudX = 12;
    const phraseHudY = Math.max(12, height - phraseHudHeight - 12);
    const phraseLines = state.phrases.slice(-8);

    ctx.fillStyle = "rgba(2, 4, 8, 0.62)";
    ctx.fillRect(phraseHudX, phraseHudY, phraseHudWidth, phraseHudHeight);
    ctx.strokeStyle = "rgba(162, 211, 255, 0.45)";
    ctx.strokeRect(phraseHudX + 0.5, phraseHudY + 0.5, phraseHudWidth - 1, phraseHudHeight - 1);

    ctx.fillStyle = "#d3edff";
    ctx.font = '12px "Iosevka", "SF Mono", Menlo, Consolas, monospace';
    ctx.fillText("phrases (word pairs, latest 8)", phraseHudX + 8, phraseHudY + 20);

    if (phraseLines.length === 0) {
      ctx.fillStyle = "rgba(184, 214, 236, 0.75)";
      ctx.fillText("(no phrases yet)", phraseHudX + 8, phraseHudY + 40);
    } else {
      ctx.fillStyle = "rgba(184, 214, 236, 0.95)";
      for (let i = 0; i < phraseLines.length; i += 1) {
        const y = phraseHudY + 40 + i * 14;
        ctx.fillText(`${i + 1}. ${phraseLines[i]}`, phraseHudX + 8, y);
      }
    }

    const dialectHudWidth = 282;
    const dialectHudHeight = 152;
    const dialectHudX = Math.max(12, width - dialectHudWidth - 12);
    const dialectHudY = 12;

    ctx.fillStyle = "rgba(2, 4, 8, 0.62)";
    ctx.fillRect(dialectHudX, dialectHudY, dialectHudWidth, dialectHudHeight);
    ctx.strokeStyle = "rgba(162, 211, 255, 0.45)";
    ctx.strokeRect(dialectHudX + 0.5, dialectHudY + 0.5, dialectHudWidth - 1, dialectHudHeight - 1);

    ctx.fillStyle = "#d3edff";
    ctx.font = '12px "Iosevka", "SF Mono", Menlo, Consolas, monospace';
    ctx.fillText("dialects", dialectHudX + 8, dialectHudY + 20);

    if (state.dialects.length === 0) {
      ctx.fillStyle = "rgba(184, 214, 236, 0.75)";
      ctx.fillText("(no active dialects)", dialectHudX + 8, dialectHudY + 40);
    } else {
      for (let i = 0; i < state.dialects.length && i < 8; i += 1) {
        const dialect = state.dialects[i];
        const y = dialectHudY + 40 + i * 14;
        ctx.fillStyle = DIALECT_COLORS[i % DIALECT_COLORS.length];
        ctx.fillText(
          `${dialect.dominantGlyph}  pop:${dialect.population}  age:${dialect.age}`,
          dialectHudX + 8,
          y
        );
      }
    }

    const eventHudWidth = 352;
    const eventHudHeight = 124;
    const eventHudX = Math.max(12, width - eventHudWidth - 12);
    const eventHudY = Math.max(12, height - eventHudHeight - 12);
    const recentEvents = state.events.slice(-6).reverse();

    ctx.fillStyle = "rgba(2, 4, 8, 0.62)";
    ctx.fillRect(eventHudX, eventHudY, eventHudWidth, eventHudHeight);
    ctx.strokeStyle = "rgba(162, 211, 255, 0.45)";
    ctx.strokeRect(eventHudX + 0.5, eventHudY + 0.5, eventHudWidth - 1, eventHudHeight - 1);

    ctx.fillStyle = "#d3edff";
    ctx.font = '12px "Iosevka", "SF Mono", Menlo, Consolas, monospace';
    ctx.fillText("event log", eventHudX + 8, eventHudY + 20);

    if (recentEvents.length === 0) {
      ctx.fillStyle = "rgba(184, 214, 236, 0.75)";
      ctx.fillText("(no events yet)", eventHudX + 8, eventHudY + 40);
    } else {
      for (let i = 0; i < recentEvents.length; i += 1) {
        const event = recentEvents[i];
        const y = eventHudY + 40 + i * 14;
        ctx.fillStyle = EVENT_COLORS[event.type];
        ctx.fillText(`[${event.tick}] ${event.type}: ${event.payload}`, eventHudX + 8, y);
      }
    }
  } else {
    ctx.fillStyle = "rgba(184, 214, 236, 0.88)";
    ctx.font = '11px "Iosevka", "SF Mono", Menlo, Consolas, monospace';
    ctx.fillText("H toggles detailed HUD", Math.max(12, width - 172), height - 16);
  }

  const hasDominance = state.events.some((event) => event.type === "dialect-dominant");
  const recoveredFromCrash =
    state.events.some((event) => event.type === "mass-extinction") && state.lexemes.length >= 140;
  const objectiveA = uniquePhrases >= 12;
  const objectiveB = state.dialects.length >= 3;
  const objectiveC = hasDominance || recoveredFromCrash;
  const objectiveScore = computeRunScore(state);

  const objectiveHudWidth = 368;
  const objectiveHudHeight = 112;
  const objectiveHudX = Math.max(12, Math.floor(width / 2 - objectiveHudWidth / 2));
  const objectiveHudY = 12;

  ctx.fillStyle = "rgba(2, 4, 8, 0.62)";
  ctx.fillRect(objectiveHudX, objectiveHudY, objectiveHudWidth, objectiveHudHeight);
  ctx.strokeStyle = "rgba(162, 211, 255, 0.45)";
  ctx.strokeRect(objectiveHudX + 0.5, objectiveHudY + 0.5, objectiveHudWidth - 1, objectiveHudHeight - 1);

  ctx.fillStyle = "#d3edff";
  ctx.font = '12px "Iosevka", "SF Mono", Menlo, Consolas, monospace';
  ctx.fillText(`run score: ${objectiveScore}`, objectiveHudX + 8, objectiveHudY + 20);
  ctx.fillStyle = "rgba(184, 214, 236, 0.92)";
  ctx.fillText(describeReefState(state, meanEnergy), objectiveHudX + 8, objectiveHudY + 36);

  const objectiveLines = [
    `${objectiveA ? "[x]" : "[ ]"} 12 unique phrases (${uniquePhrases}/12)`,
    `${objectiveB ? "[x]" : "[ ]"} 3 active dialects (${state.dialects.length}/3)`,
    `${objectiveC ? "[x]" : "[ ]"} dominance or crash recovery`
  ];
  for (let i = 0; i < objectiveLines.length; i += 1) {
    const done = (i === 0 && objectiveA) || (i === 1 && objectiveB) || (i === 2 && objectiveC);
    ctx.fillStyle = done ? "#9be564" : "rgba(184, 214, 236, 0.95)";
    ctx.fillText(objectiveLines[i], objectiveHudX + 8, objectiveHudY + 54 + i * 16);
  }
}
