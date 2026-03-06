import { Score } from "../engine/score";
import { DIALECT_COLORS } from "../render/canvas";
import type { DialectEpoch, ScoreEntry, SimState, WorkerAction } from "../types";

const ACTION_COLORS: Record<WorkerAction["kind"], string> = {
  "food-burst": "#32d5ff",
  "glyph-bias": "#ffd166",
  "bond-storm": "#9d4edd"
};

const EVENT_COLORS: Record<string, string> = {
  "mass-extinction": "#ef233c",
  "dialect-dominant": "#f7b801"
};

export interface BranchPoint {
  id: number;
  seed: number;
  tick: number;
  scoreJson: string;
}

interface DragState {
  index: number;
  pointerId: number;
  startClientX: number;
  originalTick: number;
}

export class TimelinePanel {
  readonly root: HTMLDivElement;
  onReschedule: ((entryIndex: number, newTick: number) => void) | null = null;
  onBranchSelect: ((branch: BranchPoint) => void) | null = null;

  private readonly scroll: HTMLDivElement;
  private readonly track: HTMLDivElement;
  private readonly axisLayer: HTMLDivElement;
  private readonly dialectLayer: HTMLDivElement;
  private readonly actionLayer: HTMLDivElement;
  private readonly eventLayer: HTMLDivElement;
  private readonly branchLayer: HTMLDivElement;
  private readonly diffLayer: HTMLDivElement;
  private readonly playhead: HTMLDivElement;
  private readonly legend: HTMLDivElement;
  private readonly pixelsPerTick = 1.6;
  private readonly laneHeight = 42;
  private readonly laneGap = 10;
  private readonly trackPadding = 40;
  private readonly trackHeight = 288;
  private dialectEpochs: DialectEpoch[] = [];
  private branches: BranchPoint[] = [];
  private dragState: DragState | null = null;
  private hoveredBranchId: number | null = null;
  private lastKnownState: SimState | null = null;
  private lastKnownScore: Score = new Score();

  constructor() {
    this.root = document.createElement("div");
    this.root.style.height = "100%";
    this.root.style.display = "flex";
    this.root.style.flexDirection = "column";
    this.root.style.minHeight = "0";

    this.legend = document.createElement("div");
    this.legend.style.padding = "10px 12px";
    this.legend.style.borderBottom = "1px solid rgba(162, 211, 255, 0.18)";
    this.legend.style.fontFamily = '"Iosevka", "SF Mono", Menlo, Consolas, monospace';
    this.legend.style.fontSize = "11px";
    this.legend.style.color = "rgba(188, 216, 238, 0.9)";
    this.legend.style.lineHeight = "1.4";
    this.legend.textContent =
      "Drag action blocks to reschedule. Hover branch diamonds to view score diffs. Click branch diamonds to replay.";

    this.scroll = document.createElement("div");
    this.scroll.style.flex = "1";
    this.scroll.style.minHeight = "0";
    this.scroll.style.overflowX = "auto";
    this.scroll.style.overflowY = "auto";
    this.scroll.style.padding = "8px 8px 16px 8px";
    this.scroll.style.background =
      "linear-gradient(180deg, rgba(12,18,28,0.62) 0%, rgba(7,12,19,0.82) 100%)";

    this.track = document.createElement("div");
    this.track.style.position = "relative";
    this.track.style.height = `${this.trackHeight}px`;
    this.track.style.minWidth = "900px";
    this.track.style.border = "1px solid rgba(162, 211, 255, 0.22)";
    this.track.style.borderRadius = "8px";
    this.track.style.background = "rgba(7, 12, 19, 0.88)";

    this.axisLayer = this.makeLayer();
    this.dialectLayer = this.makeLayer();
    this.actionLayer = this.makeLayer();
    this.eventLayer = this.makeLayer();
    this.branchLayer = this.makeLayer();
    this.diffLayer = this.makeLayer();

    this.playhead = document.createElement("div");
    this.playhead.style.position = "absolute";
    this.playhead.style.top = "0";
    this.playhead.style.bottom = "0";
    this.playhead.style.width = "2px";
    this.playhead.style.background = "rgba(250, 250, 250, 0.9)";
    this.playhead.style.boxShadow = "0 0 6px rgba(255,255,255,0.5)";
    this.playhead.style.pointerEvents = "none";

    this.track.appendChild(this.axisLayer);
    this.track.appendChild(this.dialectLayer);
    this.track.appendChild(this.actionLayer);
    this.track.appendChild(this.eventLayer);
    this.track.appendChild(this.branchLayer);
    this.track.appendChild(this.diffLayer);
    this.track.appendChild(this.playhead);
    this.scroll.appendChild(this.track);
    this.root.appendChild(this.legend);
    this.root.appendChild(this.scroll);
  }

  private makeLayer(): HTMLDivElement {
    const layer = document.createElement("div");
    layer.style.position = "absolute";
    layer.style.inset = "0";
    return layer;
  }

  setDialectEpochs(epochs: DialectEpoch[]): void {
    this.dialectEpochs = epochs.map((epoch) => ({
      glyph: epoch.glyph,
      bornAt: epoch.bornAt,
      extinctAt: epoch.extinctAt,
      peakPopulation: epoch.peakPopulation
    }));
  }

  setBranchPoints(branches: BranchPoint[]): void {
    this.branches = branches.map((branch) => ({ ...branch }));
  }

  update(state: SimState, score: Score): void {
    this.lastKnownState = state;
    this.lastKnownScore = score.clone();

    const maxScoreTick = score.entries.reduce((max, entry) => Math.max(max, entry.tick), 0);
    const maxDialectTick = this.dialectEpochs.reduce(
      (max, epoch) => Math.max(max, epoch.extinctAt ?? state.tick),
      0
    );
    const maxBranchTick = this.branches.reduce((max, branch) => Math.max(max, branch.tick), 0);
    const maxTick = Math.max(state.tick + 500, maxScoreTick + 120, maxDialectTick + 120, maxBranchTick + 120);
    const trackWidth = Math.max(900, Math.floor(maxTick * this.pixelsPerTick + this.trackPadding));
    this.track.style.width = `${trackWidth}px`;

    this.updatePlayhead(state.tick);

    if (this.dragState !== null) {
      return;
    }

    this.renderAxis(maxTick);
    this.renderDialectEpochs(maxTick);
    this.renderActions(score.entries);
    this.renderEvents(state.events, maxTick);
    this.renderBranches(maxTick);
    this.renderDiffOverlay(score.entries, maxTick);
  }

  private laneTop(index: number): number {
    return 24 + index * (this.laneHeight + this.laneGap);
  }

  private tickToX(tick: number): number {
    return Math.max(0, tick * this.pixelsPerTick);
  }

  private xToTick(x: number): number {
    return Math.max(0, Math.round(x / this.pixelsPerTick));
  }

  private updatePlayhead(tick: number): void {
    this.playhead.style.left = `${this.tickToX(tick)}px`;
  }

  private renderAxis(maxTick: number): void {
    this.axisLayer.replaceChildren();

    for (let tick = 0; tick <= maxTick; tick += 50) {
      const x = this.tickToX(tick);
      const line = document.createElement("div");
      line.style.position = "absolute";
      line.style.left = `${x}px`;
      line.style.top = "0";
      line.style.bottom = "0";
      line.style.width = tick % 100 === 0 ? "1px" : "0.5px";
      line.style.background =
        tick % 100 === 0 ? "rgba(198, 221, 241, 0.18)" : "rgba(198, 221, 241, 0.08)";
      this.axisLayer.appendChild(line);

      if (tick % 100 === 0) {
        const label = document.createElement("div");
        label.style.position = "absolute";
        label.style.left = `${x + 3}px`;
        label.style.top = "2px";
        label.style.color = "rgba(184, 214, 236, 0.85)";
        label.style.fontSize = "10px";
        label.style.fontFamily = '"Iosevka", "SF Mono", Menlo, Consolas, monospace';
        label.textContent = `${tick}`;
        this.axisLayer.appendChild(label);
      }
    }
  }

  private renderDialectEpochs(maxTick: number): void {
    this.dialectLayer.replaceChildren();
    const top = this.laneTop(0);

    for (let i = 0; i < this.dialectEpochs.length; i += 1) {
      const epoch = this.dialectEpochs[i];
      const left = this.tickToX(epoch.bornAt);
      const endTick = epoch.extinctAt ?? maxTick;
      const width = Math.max(4, this.tickToX(endTick) - left);
      const bar = document.createElement("button");
      bar.type = "button";
      bar.style.position = "absolute";
      bar.style.left = `${left}px`;
      bar.style.top = `${top}px`;
      bar.style.width = `${width}px`;
      bar.style.height = "18px";
      bar.style.border = "none";
      bar.style.borderRadius = "4px";
      bar.style.background = DIALECT_COLORS[i % DIALECT_COLORS.length];
      bar.style.opacity = "0.72";
      bar.style.cursor = "default";
      bar.title = `${epoch.glyph}: born ${epoch.bornAt}, extinct ${epoch.extinctAt ?? "active"}, peak ${
        epoch.peakPopulation
      }`;
      this.dialectLayer.appendChild(bar);

      const label = document.createElement("div");
      label.style.position = "absolute";
      label.style.left = `${left + 4}px`;
      label.style.top = `${top + 2}px`;
      label.style.fontFamily = '"Iosevka", "SF Mono", Menlo, Consolas, monospace';
      label.style.fontSize = "10px";
      label.style.color = "rgba(7, 12, 20, 0.9)";
      label.textContent = epoch.glyph;
      this.dialectLayer.appendChild(label);
    }
  }

  private renderActions(entries: ScoreEntry[]): void {
    this.actionLayer.replaceChildren();
    const top = this.laneTop(1);

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const block = document.createElement("button");
      block.type = "button";
      block.style.position = "absolute";
      block.style.left = `${this.tickToX(entry.tick)}px`;
      block.style.top = `${top}px`;
      block.style.width = "14px";
      block.style.height = "28px";
      block.style.border = "1px solid rgba(10, 14, 20, 0.7)";
      block.style.borderRadius = "4px";
      block.style.background = ACTION_COLORS[entry.action.kind];
      block.style.cursor = "grab";
      block.style.padding = "0";
      block.style.boxShadow = "0 1px 4px rgba(0,0,0,0.25)";
      block.title = `${entry.action.kind} @ ${entry.tick}`;
      block.dataset.index = `${index}`;

      block.addEventListener("pointerdown", (event) => this.startDrag(event, index, entry.tick));
      this.actionLayer.appendChild(block);
    }
  }

  private renderEvents(events: SimState["events"], maxTick: number): void {
    this.eventLayer.replaceChildren();
    const top = this.laneTop(2);
    const bottom = top + this.laneHeight;

    const keyEvents = events.filter(
      (event) => event.type === "mass-extinction" || event.type === "dialect-dominant"
    );

    for (const event of keyEvents) {
      const x = this.tickToX(Math.min(event.tick, maxTick));
      const spike = document.createElement("div");
      spike.style.position = "absolute";
      spike.style.left = `${x}px`;
      spike.style.top = `${top}px`;
      spike.style.width = "2px";
      spike.style.height = `${bottom - top}px`;
      spike.style.background = EVENT_COLORS[event.type] ?? "#ffffff";
      spike.style.boxShadow = "0 0 4px rgba(0,0,0,0.4)";
      spike.title = `[${event.tick}] ${event.type}: ${event.payload}`;
      this.eventLayer.appendChild(spike);
    }
  }

  private renderBranches(maxTick: number): void {
    this.branchLayer.replaceChildren();
    const top = this.laneTop(3) + 12;

    for (const branch of this.branches) {
      const x = this.tickToX(Math.min(branch.tick, maxTick));
      const diamond = document.createElement("button");
      diamond.type = "button";
      diamond.style.position = "absolute";
      diamond.style.left = `${x - 6}px`;
      diamond.style.top = `${top}px`;
      diamond.style.width = "12px";
      diamond.style.height = "12px";
      diamond.style.border = "1px solid rgba(231, 111, 81, 0.9)";
      diamond.style.background = "rgba(255, 181, 167, 0.88)";
      diamond.style.transform = "rotate(45deg)";
      diamond.style.cursor = "pointer";
      diamond.title = `Branch @ tick ${branch.tick} (seed ${branch.seed})`;
      if (this.hoveredBranchId === branch.id) {
        diamond.style.background = "rgba(255, 232, 188, 0.95)";
        diamond.style.borderColor = "rgba(255, 210, 84, 0.95)";
      }
      diamond.addEventListener("mouseenter", () => {
        this.hoveredBranchId = branch.id;
        if (this.lastKnownState !== null) {
          this.update(this.lastKnownState, this.lastKnownScore);
        }
      });
      diamond.addEventListener("mouseleave", () => {
        this.hoveredBranchId = null;
        if (this.lastKnownState !== null) {
          this.update(this.lastKnownState, this.lastKnownScore);
        }
      });
      diamond.addEventListener("click", () => {
        if (this.onBranchSelect !== null) {
          this.onBranchSelect(branch);
        }
      });
      this.branchLayer.appendChild(diamond);
    }
  }

  private renderDiffOverlay(currentEntries: ScoreEntry[], maxTick: number): void {
    this.diffLayer.replaceChildren();
    const top = this.laneTop(4);
    const height = this.laneHeight;

    const lane = document.createElement("div");
    lane.style.position = "absolute";
    lane.style.left = "0";
    lane.style.top = `${top}px`;
    lane.style.width = "100%";
    lane.style.height = `${height}px`;
    lane.style.background = "rgba(22, 30, 42, 0.55)";
    lane.style.borderTop = "1px solid rgba(162, 211, 255, 0.12)";
    lane.style.borderBottom = "1px solid rgba(162, 211, 255, 0.12)";
    this.diffLayer.appendChild(lane);

    const laneLabel = document.createElement("div");
    laneLabel.style.position = "absolute";
    laneLabel.style.left = "8px";
    laneLabel.style.top = `${top + 4}px`;
    laneLabel.style.fontFamily = '"Iosevka", "SF Mono", Menlo, Consolas, monospace';
    laneLabel.style.fontSize = "10px";
    laneLabel.style.color = "rgba(188, 216, 238, 0.88)";
    laneLabel.textContent = "diff overlay";
    this.diffLayer.appendChild(laneLabel);

    if (this.hoveredBranchId === null) {
      const hint = document.createElement("div");
      hint.style.position = "absolute";
      hint.style.left = "76px";
      hint.style.top = `${top + 4}px`;
      hint.style.fontFamily = '"Iosevka", "SF Mono", Menlo, Consolas, monospace';
      hint.style.fontSize = "10px";
      hint.style.color = "rgba(188, 216, 238, 0.62)";
      hint.textContent = "(hover a branch marker)";
      this.diffLayer.appendChild(hint);
      return;
    }

    const branch = this.branches.find((item) => item.id === this.hoveredBranchId);
    if (branch === undefined) {
      return;
    }

    let branchEntries: ScoreEntry[] = [];
    try {
      branchEntries = Score.deserialize(branch.scoreJson).entries;
    } catch {
      return;
    }

    const signature = (entry: ScoreEntry): string => `${entry.tick}|${JSON.stringify(entry.action)}`;
    const currentSet = new Set(currentEntries.map(signature));
    const branchSet = new Set(branchEntries.map(signature));

    const branchOnly: ScoreEntry[] = [];
    for (const entry of branchEntries) {
      if (!currentSet.has(signature(entry))) {
        branchOnly.push(entry);
      }
    }

    const currentOnly: ScoreEntry[] = [];
    for (const entry of currentEntries) {
      if (!branchSet.has(signature(entry))) {
        currentOnly.push(entry);
      }
    }

    for (const entry of branchOnly) {
      const x = this.tickToX(Math.min(entry.tick, maxTick));
      const line = document.createElement("div");
      line.style.position = "absolute";
      line.style.left = `${x}px`;
      line.style.top = `${top + 14}px`;
      line.style.width = "2px";
      line.style.height = `${height - 16}px`;
      line.style.background = "rgba(92, 240, 206, 0.9)";
      line.style.boxShadow = "0 0 4px rgba(92,240,206,0.55)";
      line.title = `branch-only: ${entry.action.kind} @ ${entry.tick}`;
      this.diffLayer.appendChild(line);
    }

    for (const entry of currentOnly) {
      const x = this.tickToX(Math.min(entry.tick, maxTick));
      const line = document.createElement("div");
      line.style.position = "absolute";
      line.style.left = `${x}px`;
      line.style.top = `${top + 14}px`;
      line.style.width = "2px";
      line.style.height = `${height - 16}px`;
      line.style.background = "rgba(255, 124, 180, 0.88)";
      line.style.boxShadow = "0 0 4px rgba(255,124,180,0.5)";
      line.title = `current-only: ${entry.action.kind} @ ${entry.tick}`;
      this.diffLayer.appendChild(line);
    }

    const summary = document.createElement("div");
    summary.style.position = "absolute";
    summary.style.right = "8px";
    summary.style.top = `${top + 4}px`;
    summary.style.fontFamily = '"Iosevka", "SF Mono", Menlo, Consolas, monospace';
    summary.style.fontSize = "10px";
    summary.style.color = "rgba(188, 216, 238, 0.88)";
    summary.textContent = `branch-only ${branchOnly.length} | current-only ${currentOnly.length}`;
    this.diffLayer.appendChild(summary);
  }

  private startDrag(event: PointerEvent, index: number, tick: number): void {
    const dragTarget = event.currentTarget;
    if (!(dragTarget instanceof HTMLElement)) {
      return;
    }
    event.preventDefault();
    this.dragState = {
      index,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      originalTick: tick
    };
    dragTarget.setPointerCapture(event.pointerId);
    dragTarget.style.cursor = "grabbing";

    const move = (moveEvent: PointerEvent): void => {
      if (this.dragState === null || moveEvent.pointerId !== this.dragState.pointerId) {
        return;
      }
      const deltaX = moveEvent.clientX - this.dragState.startClientX;
      const newTick = this.xToTick(this.tickToX(this.dragState.originalTick) + deltaX);
      dragTarget.style.left = `${this.tickToX(newTick)}px`;
    };

    const end = (endEvent: PointerEvent): void => {
      if (this.dragState === null || endEvent.pointerId !== this.dragState.pointerId) {
        return;
      }

      const deltaX = endEvent.clientX - this.dragState.startClientX;
      const newTick = this.xToTick(this.tickToX(this.dragState.originalTick) + deltaX);
      if (this.onReschedule !== null) {
        this.onReschedule(this.dragState.index, newTick);
      }

      if (dragTarget.hasPointerCapture(endEvent.pointerId)) {
        dragTarget.releasePointerCapture(endEvent.pointerId);
      }
      dragTarget.style.cursor = "grab";
      this.dragState = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);

      if (this.lastKnownState !== null) {
        this.update(this.lastKnownState, this.lastKnownScore);
      }
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }
}
