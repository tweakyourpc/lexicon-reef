import { Sonify } from "./audio/sonify";
import { RunJournal } from "./engine/journal";
import { Score } from "./engine/score";
import { render } from "./render/canvas";
import type {
  DialectEpoch,
  PlaytestTelemetry,
  RunArtifact,
  ScoreEntry,
  SimState
} from "./types";
import { SidePanel } from "./ui/panel";
import { PlaytestMode } from "./ui/playtest";
import { type BranchPoint, TimelinePanel } from "./ui/timeline";
import { WelcomeOverlay } from "./ui/welcome";

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

type ImportScoreMessage = {
  type: "import-score";
  json: string;
};

type LoadScoreMessage = {
  type: "load-score";
  entries: ScoreEntry[];
};

type WorkerMessage =
  | InitMessage
  | TickMessage
  | FoodBurstMessage
  | GlyphBiasMessage
  | BondStormMessage
  | ExportMessage
  | ImportScoreMessage
  | LoadScoreMessage;

type ArtifactMessage = {
  type: "artifact";
  data: RunArtifact;
};

type WorkerStateMessage = {
  type: "state";
  state: SimState;
  scoreEntries: ScoreEntry[];
  dialectEpochs: DialectEpoch[];
};

type WorkerInboundMessage = WorkerStateMessage | ArtifactMessage;

type StatusTone = "info" | "ok" | "error";

function requireCanvas(id: string): HTMLCanvasElement {
  const node = document.getElementById(id);
  if (!(node instanceof HTMLCanvasElement)) {
    throw new Error(`Canvas with id '${id}' was not found.`);
  }
  return node;
}

function requireButton(id: string, label: string): HTMLButtonElement {
  const node = document.getElementById(id);
  if (!(node instanceof HTMLButtonElement)) {
    throw new Error(`${label} button was not found.`);
  }
  return node;
}

function requireDiv(id: string, label: string): HTMLDivElement {
  const node = document.getElementById(id);
  if (!(node instanceof HTMLDivElement)) {
    throw new Error(`${label} was not found.`);
  }
  return node;
}

function requireInput(id: string, label: string): HTMLInputElement {
  const node = document.getElementById(id);
  if (!(node instanceof HTMLInputElement)) {
    throw new Error(`${label} was not found.`);
  }
  return node;
}

function requireTextArea(id: string, label: string): HTMLTextAreaElement {
  const node = document.getElementById(id);
  if (!(node instanceof HTMLTextAreaElement)) {
    throw new Error(`${label} was not found.`);
  }
  return node;
}

const canvas = requireCanvas("reef");

const ctxValue = canvas.getContext("2d");
if (ctxValue === null) {
  throw new Error("Unable to acquire 2D canvas context.");
}
const ctx: CanvasRenderingContext2D = ctxValue;

const foodBurstButton = requireButton("btn-food-burst", "Food Burst");
const autoNurtureButton = requireButton("btn-auto-nurture", "Auto Nurture");
const glyphBiasButton = requireButton("btn-glyph-bias", "Glyph Bias");
const bondStormButton = requireButton("btn-bond-storm", "Bond Storm");
const exportRunButton = requireButton("btn-export-run", "Export Run");
const pauseButton = requireButton("btn-pause", "Pause");
const stopButton = requireButton("btn-stop", "Stop");
const saveScoreButton = requireButton("btn-save-score", "Save Score");
const loadScoreButton = requireButton("btn-load-score", "Load Score");
const copyReportButton = requireButton("btn-copy-report", "Copy Report");
const advancedToggleButton = requireButton("btn-advanced-toggle", "Advanced toggle");
const glyphBiasEditor = requireDiv("glyph-bias-editor", "Glyph Bias editor");
const glyphBiasInput = requireInput("glyph-bias-input", "Glyph Bias input");
const loadScoreEditor = requireDiv("load-score-editor", "Load Score editor");
const loadScoreInput = requireTextArea("load-score-input", "Load Score input");
const loadScoreApplyButton = requireButton("btn-load-score-apply", "Load Score apply");
const loadScoreCancelButton = requireButton("btn-load-score-cancel", "Load Score cancel");
const controlRowMain = requireDiv("control-row-main", "Control row");
const controlHint = requireDiv("control-hint", "Control hint label");
const controlMeta = requireDiv("control-meta", "Control meta label");
const controlStatus = requireDiv("control-status", "Control status label");

function getSeed(): number {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("seed");
  if (fromQuery !== null && fromQuery.trim() !== "") {
    const parsed = Number.parseInt(fromQuery, 10);
    if (Number.isFinite(parsed)) {
      return parsed >>> 0;
    }
  }
  return Date.now() >>> 0;
}

function isArtifactMessage(value: WorkerInboundMessage): value is ArtifactMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "artifact"
  );
}

function downloadArtifact(artifact: RunArtifact): void {
  const payload = JSON.stringify(artifact, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `lexicon-reef-${artifact.seed}-${artifact.totalTicks}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard !== undefined) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const fallback = document.createElement("textarea");
  fallback.value = text;
  fallback.style.position = "fixed";
  fallback.style.opacity = "0";
  document.body.appendChild(fallback);
  fallback.focus();
  fallback.select();
  document.execCommand("copy");
  fallback.remove();
}

const seed = getSeed();
let worker: Worker | null = null;
const sonify = new Sonify();
const sidePanel = new SidePanel("Timeline Instrument");
const timeline = new TimelinePanel();
const welcome = new WelcomeOverlay();
const playtest = new PlaytestMode();
const journal = new RunJournal();
sidePanel.setContent(timeline.root);

let state: SimState | null = null;
let waitingForTick = false;
let cssWidth = 0;
let cssHeight = 0;
let audioContext: AudioContext | null = null;
let currentScore = new Score();
let branchPoints: BranchPoint[] = [];
let nextBranchId = 1;
let captureBranchOnArtifact = false;
let activeSeed = seed;
let statusTimer: number | null = null;
let showDetailedHud = false;
let autoNurtureEnabled = true;
let autoNurtureCooldownUntil = 0;
let autoNurtureAssistCount = 0;
let autoNurtureLastTick: number | null = null;
let advancedModeEnabled = false;
let paused = false;
let stopped = false;
const branchSnapshots = new Map<number, { population: number; dialects: number; uniquePhrases: number; meanEnergy: number; tick: number }>();

function resizeCanvas(): void {
  const dpr = window.devicePixelRatio || 1;
  cssWidth = Math.max(1, Math.floor(window.innerWidth));
  cssHeight = Math.max(1, Math.floor(window.innerHeight));
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function postToWorker(message: WorkerMessage): void {
  if (worker === null) {
    return;
  }
  worker.postMessage(message satisfies WorkerMessage);
}

function requestTick(): void {
  if (waitingForTick || paused || stopped) {
    return;
  }
  const message: TickMessage = { type: "tick" };
  postToWorker(message);
  waitingForTick = true;
}

function requestExport(): void {
  const message: ExportMessage = {
    type: "export",
    playtest: playtest.getTelemetry()
  };
  postToWorker(message);
}

function drawBootScreen(): void {
  ctx.fillStyle = "rgba(7, 9, 15, 0.86)";
  ctx.fillRect(0, 0, cssWidth, cssHeight);
  ctx.fillStyle = "#d3edff";
  ctx.font = '16px "Iosevka", "SF Mono", Menlo, Consolas, monospace';
  ctx.fillText("Lexicon Reef: seeding ecosystem...", 24, 36);
}

function postFoodBurst(x: number, y: number, radius: number, record = true): void {
  const message: FoodBurstMessage = {
    type: "food-burst",
    x,
    y,
    radius,
    record
  };
  postToWorker(message);
}

function applyScoreEntries(entries: ScoreEntry[]): void {
  currentScore = new Score(entries);
  const loadMessage: LoadScoreMessage = {
    type: "load-score",
    entries
  };
  postToWorker(loadMessage);
}

function restartFromBranch(branch: BranchPoint): void {
  if (stopped) {
    setControlStatus("Run is stopped. Click Restart first.", "error");
    return;
  }
  activeSeed = branch.seed;
  state = null;
  waitingForTick = false;
  currentScore = Score.deserialize(branch.scoreJson);
  autoNurtureCooldownUntil = 0;

  const initMessage: InitMessage = {
    type: "init",
    seed: branch.seed,
    width: cssWidth,
    height: cssHeight
  };
  postToWorker(initMessage);

  const importMessage: ImportScoreMessage = {
    type: "import-score",
    json: branch.scoreJson
  };
  postToWorker(importMessage);
}

function setControlStatus(message: string, tone: StatusTone = "info"): void {
  if (statusTimer !== null) {
    window.clearTimeout(statusTimer);
    statusTimer = null;
  }

  if (message.trim() === "") {
    controlStatus.textContent = "";
    return;
  }

  controlStatus.textContent = message;
  if (tone === "error") {
    controlStatus.style.color = "#ff8fab";
  } else if (tone === "ok") {
    controlStatus.style.color = "#9be564";
  } else {
    controlStatus.style.color = "#d3edff";
  }

  statusTimer = window.setTimeout(() => {
    controlStatus.textContent = "";
    statusTimer = null;
  }, 3200);
}

function setControlHint(message: string): void {
  controlHint.textContent = message;
}

function defaultControlHint(): string {
  if (advancedModeEnabled) {
    return "Hover a control to preview impact. Keys: A auto nurture, P pause, X stop/restart, H HUD, T timeline, B branch.";
  }
  return "Hover a control to preview impact. Keys: A auto nurture, P pause, X stop/restart, H HUD. Advanced ON enables T timeline and B branch.";
}

function updateAdvancedToggleButton(): void {
  advancedToggleButton.textContent = `Advanced: ${advancedModeEnabled ? "ON" : "OFF"}`;
  if (advancedModeEnabled) {
    advancedToggleButton.style.background = "#203424";
    advancedToggleButton.style.borderColor = "rgba(161,230,140,0.45)";
    advancedToggleButton.style.color = "#dcffd0";
  } else {
    advancedToggleButton.style.background = "#1f2730";
    advancedToggleButton.style.borderColor = "rgba(162,211,255,0.34)";
    advancedToggleButton.style.color = "#b8d6ec";
  }
}

function setAdvancedMode(enabled: boolean): void {
  const changed = advancedModeEnabled !== enabled;
  advancedModeEnabled = enabled;
  updateAdvancedToggleButton();

  saveScoreButton.style.display = advancedModeEnabled ? "" : "none";
  loadScoreButton.style.display = advancedModeEnabled ? "" : "none";

  if (!advancedModeEnabled) {
    captureBranchOnArtifact = false;
    closeLoadScoreEditor();
    if (sidePanel.isOpen()) {
      sidePanel.setOpen(false);
    }
  }

  setControlHint(defaultControlHint());

  if (!changed) {
    return;
  }

  setControlStatus(
    advancedModeEnabled
      ? "Advanced ON: Save/Load and T/B hotkeys enabled."
      : "Advanced OFF: Save/Load hidden, T/B hotkeys disabled."
  );
}

function setAdvancedBlockedHint(action: "timeline" | "branch" | "save-load"): void {
  let actionLabel = "timeline (T)";
  if (action === "branch") {
    actionLabel = "branch capture (B)";
  } else if (action === "save-load") {
    actionLabel = "Save/Load score tools";
  }
  setControlHint("Advanced OFF: Save/Load, timeline (T), and branch capture (B) are disabled.");
  setControlStatus(`Advanced is OFF. Turn it ON to use ${actionLabel}.`);
}

function updatePauseButton(): void {
  pauseButton.textContent = paused ? "Resume" : "Pause";
  pauseButton.disabled = stopped;
  pauseButton.style.opacity = stopped ? "0.45" : "1";
}

function updateStopButton(): void {
  stopButton.textContent = stopped ? "Restart" : "Stop";
  if (stopped) {
    stopButton.style.background = "#203424";
    stopButton.style.borderColor = "rgba(161,230,140,0.45)";
    stopButton.style.color = "#dcffd0";
  } else {
    stopButton.style.background = "#312024";
    stopButton.style.borderColor = "rgba(255,143,171,0.45)";
    stopButton.style.color = "#ffd6dd";
  }
}

function setPaused(value: boolean): void {
  if (stopped) {
    paused = false;
    updatePauseButton();
    return;
  }
  paused = value;
  updatePauseButton();
  if (!paused) {
    waitingForTick = false;
  }
}

function ensureRunning(actionLabel: string): boolean {
  if (!stopped && worker !== null) {
    return true;
  }
  setControlStatus(`Run is stopped. Click Restart to ${actionLabel}.`, "error");
  return false;
}

function attachWorkerHandlers(nextWorker: Worker): void {
  nextWorker.onmessage = (event: MessageEvent<WorkerInboundMessage>): void => {
    const message = event.data;
    if (isArtifactMessage(message)) {
      if (captureBranchOnArtifact) {
        captureBranchOnArtifact = false;
        const branch: BranchPoint = {
          id: nextBranchId,
          seed: message.data.seed,
          tick: message.data.totalTicks,
          scoreJson: message.data.scoreJson
        };
        nextBranchId += 1;
        branchPoints = [...branchPoints, branch];
        timeline.setBranchPoints(branchPoints);
        if (state !== null) {
          const meanEnergy =
            state.lexemes.length === 0
              ? 0
              : state.lexemes.reduce((sum, lexeme) => sum + lexeme.energy, 0) /
                state.lexemes.length;
          branchSnapshots.set(branch.id, {
            tick: state.tick,
            population: state.lexemes.length,
            dialects: state.dialects.length,
            uniquePhrases: new Set(state.phrases).size,
            meanEnergy
          });
        }
        playtest.markBranchCreated();
        journal.noteBranch();
        journal.persist();
        setControlStatus(`Branch captured at tick ${branch.tick}.`, "ok");
        return;
      }

      playtest.markRunExported();
      journal.noteExport();
      journal.persist();
      downloadArtifact(message.data);
      setControlStatus("Run artifact downloaded.", "ok");
      return;
    }

    // The worker publishes score entries with every state snapshot so the UI
    // can render and edit the timeline without an extra request/response roundtrip.
    state = message.state;
    journal.ingestState(state);
    if (state.tick > 0 && state.tick % 120 === 0) {
      journal.persist();
    }
    maybeApplyAutoNurture(state);
    currentScore = new Score(message.scoreEntries);
    timeline.setDialectEpochs(message.dialectEpochs);
    timeline.setBranchPoints(branchPoints);
    waitingForTick = false;
  };
}

function createWorker(): Worker {
  const nextWorker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  attachWorkerHandlers(nextWorker);
  return nextWorker;
}

function initRun(runSeed: number): void {
  if (worker === null) {
    worker = createWorker();
  }
  const initMessage: InitMessage = {
    type: "init",
    seed: runSeed,
    width: cssWidth,
    height: cssHeight
  };
  postToWorker(initMessage);
  waitingForTick = false;
}

function stopRun(): void {
  if (worker !== null) {
    worker.terminate();
    worker = null;
  }
  stopped = true;
  paused = false;
  waitingForTick = false;
  captureBranchOnArtifact = false;
  closeLoadScoreEditor();
  closeGlyphBiasEditor();
  if (sidePanel.isOpen()) {
    sidePanel.setOpen(false);
  }
  updatePauseButton();
  updateStopButton();
}

function restartRun(): void {
  state = null;
  stopped = false;
  paused = false;
  waitingForTick = false;
  autoNurtureCooldownUntil = 0;
  initRun(activeSeed);
  updatePauseButton();
  updateStopButton();
}

function updateAutoNurtureButton(): void {
  autoNurtureButton.textContent = `Auto Nurture: ${autoNurtureEnabled ? "ON" : "OFF"}`;
  if (autoNurtureEnabled) {
    autoNurtureButton.style.background = "#203424";
    autoNurtureButton.style.borderColor = "rgba(161,230,140,0.45)";
    autoNurtureButton.style.color = "#dcffd0";
  } else {
    autoNurtureButton.style.background = "#1f2730";
    autoNurtureButton.style.borderColor = "rgba(162,211,255,0.34)";
    autoNurtureButton.style.color = "#b8d6ec";
  }
}

function refreshControlMeta(): void {
  const lastText = autoNurtureLastTick === null ? "none yet" : `tick ${autoNurtureLastTick}`;
  controlMeta.textContent = `auto nurture: ${autoNurtureEnabled ? "on" : "off"} | assists: ${autoNurtureAssistCount} | last: ${lastText}`;
  controlMeta.style.color = autoNurtureEnabled
    ? "rgba(161,230,140,0.9)"
    : "rgba(184,214,236,0.78)";
}

function toggleAutoNurture(source: "button" | "hotkey"): void {
  autoNurtureEnabled = !autoNurtureEnabled;
  if (autoNurtureEnabled) {
    autoNurtureCooldownUntil = 0;
  }
  updateAutoNurtureButton();
  refreshControlMeta();
  setControlStatus(
    autoNurtureEnabled
      ? `Auto nurture enabled${source === "hotkey" ? " (A)." : "."}`
      : `Auto nurture disabled${source === "hotkey" ? " (A)." : "."}`,
    "info"
  );
}

function maybeApplyAutoNurture(current: SimState): void {
  if (!autoNurtureEnabled) {
    return;
  }
  if (current.tick < autoNurtureCooldownUntil) {
    return;
  }
  if (current.lexemes.length === 0) {
    return;
  }

  const totalEnergy = current.lexemes.reduce((sum, lexeme) => sum + lexeme.energy, 0);
  const meanEnergy = totalEnergy / current.lexemes.length;
  const population = current.lexemes.length;

  let severity = -1;
  if (population < 34 || meanEnergy < 0.46) {
    severity = 2;
  } else if (population < 58 || meanEnergy < 0.58) {
    severity = 1;
  } else if (population < 88 && meanEnergy < 0.69) {
    severity = 0;
  }
  if (severity < 0) {
    return;
  }

  const angle = current.tick * 0.11;
  const orbit = Math.min(current.width, current.height) * (severity === 2 ? 0.18 : 0.26);
  const x = current.width / 2 + Math.cos(angle) * orbit;
  const y = current.height / 2 + Math.sin(angle) * orbit;
  const radius = severity === 2 ? 170 : severity === 1 ? 145 : 120;
  const cooldown = severity === 2 ? 8 : severity === 1 ? 14 : 22;

  postFoodBurst(x, y, radius, true);
  autoNurtureCooldownUntil = current.tick + cooldown;
  autoNurtureAssistCount += 1;
  autoNurtureLastTick = current.tick;
  refreshControlMeta();
  journal.noteAutoAssist();
}

function isEditorVisible(editor: HTMLDivElement): boolean {
  return editor.style.display !== "none";
}

function closeGlyphBiasEditor(): void {
  glyphBiasEditor.style.display = "none";
  glyphBiasInput.value = "";
}

function openGlyphBiasEditor(): void {
  closeLoadScoreEditor();
  glyphBiasEditor.style.display = "flex";
  glyphBiasInput.value = "";
  glyphBiasInput.focus();
  glyphBiasInput.select();
  setControlStatus("Type one glyph and press Enter to apply.");
}

function closeLoadScoreEditor(): void {
  loadScoreEditor.style.display = "none";
}

function openLoadScoreEditor(): void {
  closeGlyphBiasEditor();
  loadScoreEditor.style.display = "flex";
  loadScoreInput.focus();
  setControlStatus("Paste RunArtifact JSON, then click Apply.");
}

function submitGlyphBiasFromInput(): void {
  if (!ensureRunning("apply glyph bias")) {
    return;
  }
  const glyph = glyphBiasInput.value.trim().slice(0, 1);
  if (glyph.length === 0) {
    setControlStatus("Glyph bias requires one character.", "error");
    return;
  }

  const message: GlyphBiasMessage = {
    type: "glyph-bias",
    glyph,
    ticks: 200
  };
  postToWorker(message);
  playtest.markAction("glyph-bias");
  journal.noteAction("glyph-bias");
  closeGlyphBiasEditor();
  setControlStatus(`Glyph bias '${glyph}' enabled for 200 ticks.`, "ok");
}

function submitRunArtifactJson(value: string): void {
  if (!ensureRunning("import score")) {
    return;
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    setControlStatus("RunArtifact JSON is empty.", "error");
    return;
  }

  try {
    const parsed = JSON.parse(trimmed) as { scoreJson?: unknown };
    if (typeof parsed.scoreJson !== "string") {
      throw new Error("Missing scoreJson");
    }

    currentScore = Score.deserialize(parsed.scoreJson);
    const message: ImportScoreMessage = {
      type: "import-score",
      json: parsed.scoreJson
    };
    postToWorker(message);
    closeLoadScoreEditor();
    setControlStatus("Score imported from artifact.", "ok");
  } catch {
    setControlStatus("Invalid RunArtifact JSON.", "error");
  }
}

function requestUserExport(): void {
  playtest.requestFeedback(() => {
    captureBranchOnArtifact = false;
    requestExport();
  });
}

function describeBranchDelta(
  current: SimState,
  target: { population: number; dialects: number; uniquePhrases: number; meanEnergy: number; tick: number }
): string {
  const currentUniquePhrases = new Set(current.phrases).size;
  const currentMeanEnergy =
    current.lexemes.length === 0
      ? 0
      : current.lexemes.reduce((sum, lexeme) => sum + lexeme.energy, 0) / current.lexemes.length;
  const popDelta = current.lexemes.length - target.population;
  const dialectDelta = current.dialects.length - target.dialects;
  const phraseDelta = currentUniquePhrases - target.uniquePhrases;
  const energyDelta = currentMeanEnergy - target.meanEnergy;

  return `Compared to branch tick ${target.tick}: pop ${popDelta >= 0 ? "+" : ""}${popDelta}, dialects ${
    dialectDelta >= 0 ? "+" : ""
  }${dialectDelta}, unique phrases ${phraseDelta >= 0 ? "+" : ""}${phraseDelta}, mean energy ${
    energyDelta >= 0 ? "+" : ""
  }${energyDelta.toFixed(2)}.`;
}

timeline.onReschedule = (entryIndex: number, newTick: number) => {
  const score = currentScore.clone();
  if (entryIndex < 0 || entryIndex >= score.entries.length) {
    return;
  }
  score.entries[entryIndex].tick = Math.max(0, newTick);
  score.entries.sort((a, b) => a.tick - b.tick);
  applyScoreEntries(score.entries);
};

timeline.onBranchSelect = (branch: BranchPoint) => {
  if (state !== null) {
    const snapshot = branchSnapshots.get(branch.id);
    if (snapshot !== undefined) {
      setControlStatus(describeBranchDelta(state, snapshot));
    }
  }
  restartFromBranch(branch);
};

function handleFirstInteraction(): void {
  if (audioContext !== null) {
    return;
  }

  audioContext = new AudioContext();
  sonify.init(audioContext);
}

resizeCanvas();
drawBootScreen();
welcome.show();
updateAutoNurtureButton();
refreshControlMeta();
setAdvancedMode(false);
updatePauseButton();
updateStopButton();
initRun(seed);

window.addEventListener("click", handleFirstInteraction, { once: true });

foodBurstButton.addEventListener("click", () => {
  if (!ensureRunning("inject food burst")) {
    return;
  }
  closeGlyphBiasEditor();
  closeLoadScoreEditor();
  postFoodBurst(cssWidth / 2, cssHeight / 2, 120, true);
  playtest.markAction("food-burst");
  journal.noteAction("food-burst");
  setControlStatus("Food burst injected at center.", "ok");
});
foodBurstButton.addEventListener("mouseenter", () => {
  setControlHint("Food Burst: immediate +0.6 energy pulse in a center radius.");
});
foodBurstButton.addEventListener("focus", () => {
  setControlHint("Food Burst: immediate +0.6 energy pulse in a center radius.");
});

autoNurtureButton.addEventListener("click", () => {
  closeGlyphBiasEditor();
  closeLoadScoreEditor();
  toggleAutoNurture("button");
});
autoNurtureButton.addEventListener("mouseenter", () => {
  setControlHint("Auto Nurture: adaptive food bursts when the reef becomes fragile. Toggle with A.");
});
autoNurtureButton.addEventListener("focus", () => {
  setControlHint("Auto Nurture: adaptive food bursts when the reef becomes fragile. Toggle with A.");
});

glyphBiasButton.addEventListener("click", () => {
  if (isEditorVisible(glyphBiasEditor)) {
    closeGlyphBiasEditor();
    setControlStatus("Glyph bias editor closed.");
    return;
  }
  openGlyphBiasEditor();
});
glyphBiasButton.addEventListener("mouseenter", () => {
  setControlHint("Glyph Bias: steer new lexemes toward one glyph for 200 ticks.");
});
glyphBiasButton.addEventListener("focus", () => {
  setControlHint("Glyph Bias: steer new lexemes toward one glyph for 200 ticks.");
});

glyphBiasInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    submitGlyphBiasFromInput();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    closeGlyphBiasEditor();
    setControlStatus("Glyph bias cancelled.");
  }
});

bondStormButton.addEventListener("click", () => {
  if (!ensureRunning("trigger bond storm")) {
    return;
  }
  closeGlyphBiasEditor();
  closeLoadScoreEditor();
  const message: BondStormMessage = {
    type: "bond-storm",
    ticks: 150
  };
  postToWorker(message);
  playtest.markAction("bond-storm");
  journal.noteAction("bond-storm");
  setControlStatus("Bond storm triggered for 150 ticks.", "ok");
});
bondStormButton.addEventListener("mouseenter", () => {
  setControlHint("Bond Storm: multiplies bond formation chance by 10 for 150 ticks.");
});
bondStormButton.addEventListener("focus", () => {
  setControlHint("Bond Storm: multiplies bond formation chance by 10 for 150 ticks.");
});

copyReportButton.addEventListener("click", () => {
  const report = journal.buildReport();
  void copyTextToClipboard(report)
    .then(() => {
      journal.persist();
      setControlStatus("Run report copied to clipboard.", "ok");
    })
    .catch(() => {
      setControlStatus("Clipboard copy failed.", "error");
    });
});
copyReportButton.addEventListener("mouseenter", () => {
  setControlHint("Copy Report: plain-language run summary for quick sharing.");
});
copyReportButton.addEventListener("focus", () => {
  setControlHint("Copy Report: plain-language run summary for quick sharing.");
});

advancedToggleButton.addEventListener("click", () => {
  setAdvancedMode(!advancedModeEnabled);
});
advancedToggleButton.addEventListener("mouseenter", () => {
  setControlHint("Advanced: shows Save/Load controls and enables T timeline + B branch hotkeys.");
});
advancedToggleButton.addEventListener("focus", () => {
  setControlHint("Advanced: shows Save/Load controls and enables T timeline + B branch hotkeys.");
});

exportRunButton.addEventListener("click", () => {
  if (!ensureRunning("export run")) {
    return;
  }
  requestUserExport();
});

saveScoreButton.addEventListener("click", () => {
  if (!ensureRunning("save score")) {
    return;
  }
  if (!advancedModeEnabled) {
    setAdvancedBlockedHint("save-load");
    return;
  }
  requestUserExport();
});
exportRunButton.addEventListener("mouseenter", () => {
  setControlHint("Export Run: feedback prompt, then full JSON artifact download.");
});
exportRunButton.addEventListener("focus", () => {
  setControlHint("Export Run: feedback prompt, then full JSON artifact download.");
});
saveScoreButton.addEventListener("mouseenter", () => {
  setControlHint("Save Score: export scoreJson for deterministic replay and branching.");
});
saveScoreButton.addEventListener("focus", () => {
  setControlHint("Save Score: export scoreJson for deterministic replay and branching.");
});

loadScoreButton.addEventListener("click", () => {
  if (!ensureRunning("load score")) {
    return;
  }
  if (!advancedModeEnabled) {
    setAdvancedBlockedHint("save-load");
    return;
  }
  if (isEditorVisible(loadScoreEditor)) {
    closeLoadScoreEditor();
    setControlStatus("Load score editor closed.");
    return;
  }
  openLoadScoreEditor();
});
loadScoreButton.addEventListener("mouseenter", () => {
  setControlHint("Load Score: import scoreJson from a prior RunArtifact.");
});
loadScoreButton.addEventListener("focus", () => {
  setControlHint("Load Score: import scoreJson from a prior RunArtifact.");
});
controlRowMain.addEventListener("mouseleave", () => {
  setControlHint(defaultControlHint());
});

loadScoreApplyButton.addEventListener("click", () => {
  submitRunArtifactJson(loadScoreInput.value);
});

loadScoreCancelButton.addEventListener("click", () => {
  closeLoadScoreEditor();
  setControlStatus("Load score cancelled.");
});

loadScoreInput.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    closeLoadScoreEditor();
    setControlStatus("Load score cancelled.");
    return;
  }
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    submitRunArtifactJson(loadScoreInput.value);
  }
});

pauseButton.addEventListener("click", () => {
  if (stopped) {
    setControlStatus("Run is stopped. Click Restart.", "error");
    return;
  }
  setPaused(!paused);
  setControlStatus(paused ? "Simulation paused." : "Simulation resumed.", "info");
});
pauseButton.addEventListener("mouseenter", () => {
  setControlHint("Pause/Resume: freeze or continue tick progression without stopping the run.");
});
pauseButton.addEventListener("focus", () => {
  setControlHint("Pause/Resume: freeze or continue tick progression without stopping the run.");
});

stopButton.addEventListener("click", () => {
  if (!stopped) {
    stopRun();
    setControlStatus("Simulation stopped. Click Restart to continue.", "ok");
    return;
  }
  restartRun();
  setControlStatus("Simulation restarted.", "ok");
});
stopButton.addEventListener("mouseenter", () => {
  setControlHint("Stop/Restart: terminate the current run or start it again without killing the dev server.");
});
stopButton.addEventListener("focus", () => {
  setControlHint("Stop/Restart: terminate the current run or start it again without killing the dev server.");
});

window.addEventListener("keydown", (event) => {
  if (event.repeat) {
    return;
  }

  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return;
  }

  if (event.key === "t" || event.key === "T") {
    if (!advancedModeEnabled) {
      setAdvancedBlockedHint("timeline");
      return;
    }
    sidePanel.toggle();
    if (sidePanel.isOpen()) {
      playtest.markTimelineOpened();
    }
    return;
  }

  if (event.key === "a" || event.key === "A") {
    toggleAutoNurture("hotkey");
    return;
  }

  if (event.key === "h" || event.key === "H") {
    showDetailedHud = !showDetailedHud;
    setControlStatus(showDetailedHud ? "Detailed HUD enabled." : "Detailed HUD hidden.");
    return;
  }

  if (event.key === "p" || event.key === "P") {
    if (stopped) {
      setControlStatus("Run is stopped. Click Restart.", "error");
      return;
    }
    setPaused(!paused);
    setControlStatus(paused ? "Simulation paused." : "Simulation resumed.", "info");
    return;
  }

  if (event.key === "x" || event.key === "X") {
    if (!stopped) {
      stopRun();
      setControlStatus("Simulation stopped. Press X again or click Restart to run again.", "ok");
      return;
    }
    restartRun();
    setControlStatus("Simulation restarted.", "ok");
    return;
  }

  if (event.key === "b" || event.key === "B") {
    if (!advancedModeEnabled) {
      setAdvancedBlockedHint("branch");
      return;
    }
    if (state === null) {
      return;
    }
    captureBranchOnArtifact = true;
    requestExport();
  }
});

window.addEventListener("resize", () => {
  resizeCanvas();
  if (stopped) {
    return;
  }
  const refreshInit: InitMessage = {
    type: "init",
    seed: activeSeed,
    width: cssWidth,
    height: cssHeight
  };
  postToWorker(refreshInit);
  waitingForTick = false;
});

function frame(): void {
  if (state !== null) {
    render(ctx, state, { showDetailedHud });
    sonify.update(state);
    timeline.update(state, currentScore);
  } else {
    drawBootScreen();
  }

  requestTick();
  window.requestAnimationFrame(frame);
}

window.requestAnimationFrame(frame);

window.addEventListener("beforeunload", () => {
  journal.persist();
  if (worker !== null) {
    worker.terminate();
    worker = null;
  }
  if (audioContext !== null) {
    void audioContext.close();
  }
});
