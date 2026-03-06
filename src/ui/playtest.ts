import type { PlaytestFeedback, PlaytestGoals, PlaytestTelemetry, WorkerAction } from "../types";

type RatingKey = keyof PlaytestFeedback;

const ACTION_LABEL: Record<WorkerAction["kind"], string> = {
  "food-burst": "food burst",
  "glyph-bias": "glyph bias",
  "bond-storm": "bond storm"
};

export class PlaytestMode {
  private readonly goalsRoot: HTMLDivElement;
  private readonly nextActionLine: HTMLDivElement;
  private readonly goalFood: HTMLDivElement;
  private readonly goalBranch: HTMLDivElement;
  private readonly goalExport: HTMLDivElement;
  private readonly statsLine: HTMLDivElement;
  private readonly feedbackOverlay: HTMLDivElement;
  private readonly feedbackCard: HTMLDivElement;
  private readonly feedbackStatus: HTMLDivElement;
  private readonly submitButton: HTMLButtonElement;
  private readonly skipButton: HTMLButtonElement;
  private readonly ratingButtons: Record<RatingKey, HTMLButtonElement[]> = {
    clarity: [],
    agency: [],
    surprise: [],
    replay: []
  };

  private readonly startedAt = new Date().toISOString();
  private readonly startedAtMs = performance.now();
  private firstActionMs: number | null = null;
  private actionCount = 0;
  private actionsUsed = new Set<WorkerAction["kind"]>();
  private timelineOpened = false;
  private branchCreated = false;
  private exportUsed = false;
  private goals: PlaytestGoals = {
    foodBurstTriggered: false,
    branchCreated: false,
    exportRunCompleted: false
  };
  private feedback: PlaytestFeedback | null = null;
  private draftFeedback: Partial<PlaytestFeedback> = {};
  private pendingFeedbackCompletion: (() => void) | null = null;

  constructor() {
    this.goalsRoot = document.createElement("div");
    this.goalsRoot.style.position = "fixed";
    this.goalsRoot.style.top = "14px";
    this.goalsRoot.style.left = "14px";
    this.goalsRoot.style.zIndex = "24";
    this.goalsRoot.style.padding = "10px 12px";
    this.goalsRoot.style.borderRadius = "10px";
    this.goalsRoot.style.border = "1px solid rgba(162, 211, 255, 0.26)";
    this.goalsRoot.style.background = "rgba(6, 11, 18, 0.84)";
    this.goalsRoot.style.boxShadow = "0 8px 20px rgba(0,0,0,0.32)";
    this.goalsRoot.style.fontFamily = '"Iosevka", "SF Mono", Menlo, Consolas, monospace';
    this.goalsRoot.style.maxWidth = "330px";
    this.goalsRoot.style.backdropFilter = "blur(2px)";

    const title = document.createElement("div");
    title.textContent = "playtest mode";
    title.style.color = "#d3edff";
    title.style.fontSize = "12px";
    title.style.marginBottom = "6px";
    this.goalsRoot.appendChild(title);

    this.nextActionLine = document.createElement("div");
    this.nextActionLine.style.fontSize = "11px";
    this.nextActionLine.style.color = "#e9c46a";
    this.nextActionLine.style.marginBottom = "8px";
    this.nextActionLine.style.lineHeight = "1.35";
    this.goalsRoot.appendChild(this.nextActionLine);

    this.goalFood = document.createElement("div");
    this.goalBranch = document.createElement("div");
    this.goalExport = document.createElement("div");
    this.goalFood.style.fontSize = "11px";
    this.goalBranch.style.fontSize = "11px";
    this.goalExport.style.fontSize = "11px";
    this.goalFood.style.marginBottom = "4px";
    this.goalBranch.style.marginBottom = "4px";
    this.goalExport.style.marginBottom = "8px";
    this.goalsRoot.appendChild(this.goalFood);
    this.goalsRoot.appendChild(this.goalBranch);
    this.goalsRoot.appendChild(this.goalExport);

    this.statsLine = document.createElement("div");
    this.statsLine.style.fontSize = "10px";
    this.statsLine.style.color = "rgba(197, 223, 244, 0.85)";
    this.statsLine.style.lineHeight = "1.45";
    this.goalsRoot.appendChild(this.statsLine);
    document.body.appendChild(this.goalsRoot);

    this.feedbackOverlay = document.createElement("div");
    this.feedbackOverlay.style.position = "fixed";
    this.feedbackOverlay.style.inset = "0";
    this.feedbackOverlay.style.zIndex = "32";
    this.feedbackOverlay.style.display = "none";
    this.feedbackOverlay.style.alignItems = "center";
    this.feedbackOverlay.style.justifyContent = "center";
    this.feedbackOverlay.style.background = "rgba(3, 6, 12, 0.66)";
    this.feedbackOverlay.style.padding = "24px";

    this.feedbackCard = document.createElement("div");
    this.feedbackCard.style.width = "min(640px, 94vw)";
    this.feedbackCard.style.padding = "16px";
    this.feedbackCard.style.borderRadius = "12px";
    this.feedbackCard.style.border = "1px solid rgba(162, 211, 255, 0.32)";
    this.feedbackCard.style.background = "rgba(7, 12, 19, 0.96)";
    this.feedbackCard.style.boxShadow = "0 14px 34px rgba(0,0,0,0.42)";
    this.feedbackCard.style.fontFamily = '"Iosevka", "SF Mono", Menlo, Consolas, monospace';

    const feedbackTitle = document.createElement("div");
    feedbackTitle.textContent = "post-run feedback";
    feedbackTitle.style.fontSize = "14px";
    feedbackTitle.style.color = "#d3edff";
    feedbackTitle.style.marginBottom = "4px";
    this.feedbackCard.appendChild(feedbackTitle);

    const feedbackHint = document.createElement("div");
    feedbackHint.textContent = "Rate each axis from 1 (low) to 5 (high).";
    feedbackHint.style.fontSize = "11px";
    feedbackHint.style.color = "rgba(197, 223, 244, 0.86)";
    feedbackHint.style.marginBottom = "12px";
    this.feedbackCard.appendChild(feedbackHint);

    this.feedbackCard.appendChild(this.createRatingRow("clarity", "clarity"));
    this.feedbackCard.appendChild(this.createRatingRow("agency", "agency"));
    this.feedbackCard.appendChild(this.createRatingRow("surprise", "surprise"));
    this.feedbackCard.appendChild(this.createRatingRow("want to replay", "replay"));

    this.feedbackStatus = document.createElement("div");
    this.feedbackStatus.style.minHeight = "16px";
    this.feedbackStatus.style.marginTop = "10px";
    this.feedbackStatus.style.fontSize = "11px";
    this.feedbackStatus.style.color = "rgba(197, 223, 244, 0.86)";
    this.feedbackCard.appendChild(this.feedbackStatus);

    const actionsRow = document.createElement("div");
    actionsRow.style.display = "flex";
    actionsRow.style.justifyContent = "flex-end";
    actionsRow.style.gap = "8px";
    actionsRow.style.marginTop = "12px";

    this.skipButton = document.createElement("button");
    this.skipButton.type = "button";
    this.skipButton.textContent = "Skip";
    this.skipButton.style.border = "1px solid rgba(162, 211, 255, 0.34)";
    this.skipButton.style.background = "#1a2431";
    this.skipButton.style.color = "#d3edff";
    this.skipButton.style.borderRadius = "6px";
    this.skipButton.style.padding = "6px 10px";
    this.skipButton.style.cursor = "pointer";
    this.skipButton.addEventListener("click", () => {
      this.hideFeedback();
      this.resolveFeedbackRequest();
    });
    actionsRow.appendChild(this.skipButton);

    this.submitButton = document.createElement("button");
    this.submitButton.type = "button";
    this.submitButton.textContent = "Submit & Export";
    this.submitButton.style.border = "1px solid rgba(161, 230, 140, 0.45)";
    this.submitButton.style.background = "#203424";
    this.submitButton.style.color = "#dcffd0";
    this.submitButton.style.borderRadius = "6px";
    this.submitButton.style.padding = "6px 10px";
    this.submitButton.style.cursor = "pointer";
    this.submitButton.disabled = true;
    this.submitButton.style.opacity = "0.5";
    this.submitButton.addEventListener("click", () => {
      const feedback = this.completeFeedbackFromDraft();
      if (feedback === null) {
        this.feedbackStatus.textContent = "Please fill all four ratings.";
        this.feedbackStatus.style.color = "#ff8fab";
        return;
      }
      this.feedback = feedback;
      this.feedbackStatus.textContent = "";
      this.hideFeedback();
      this.resolveFeedbackRequest();
      this.renderSummary();
    });
    actionsRow.appendChild(this.submitButton);

    this.feedbackCard.appendChild(actionsRow);
    this.feedbackOverlay.appendChild(this.feedbackCard);
    document.body.appendChild(this.feedbackOverlay);

    this.renderSummary();
  }

  markAction(kind: WorkerAction["kind"]): void {
    this.actionCount += 1;
    this.actionsUsed.add(kind);

    if (this.firstActionMs === null) {
      this.firstActionMs = Math.round(performance.now() - this.startedAtMs);
    }

    if (kind === "food-burst" && !this.goals.foodBurstTriggered) {
      this.goals.foodBurstTriggered = true;
    }

    this.renderSummary();
  }

  markTimelineOpened(): void {
    if (this.timelineOpened) {
      return;
    }
    this.timelineOpened = true;
    this.renderSummary();
  }

  markBranchCreated(): void {
    this.branchCreated = true;
    if (!this.goals.branchCreated) {
      this.goals.branchCreated = true;
    }
    this.renderSummary();
  }

  markRunExported(): void {
    this.exportUsed = true;
    if (!this.goals.exportRunCompleted) {
      this.goals.exportRunCompleted = true;
    }
    this.renderSummary();
  }

  hasFeedback(): boolean {
    return this.feedback !== null;
  }

  requestFeedback(onComplete: () => void): void {
    if (this.feedback !== null) {
      onComplete();
      return;
    }
    this.pendingFeedbackCompletion = onComplete;
    this.showFeedback();
  }

  getTelemetry(): PlaytestTelemetry {
    return {
      startedAt: this.startedAt,
      timeToFirstActionMs: this.firstActionMs,
      actionCount: this.actionCount,
      actionsUsed: [...this.actionsUsed],
      timelineOpened: this.timelineOpened,
      branchCreated: this.branchCreated,
      exportUsed: this.exportUsed,
      goals: {
        foodBurstTriggered: this.goals.foodBurstTriggered,
        branchCreated: this.goals.branchCreated,
        exportRunCompleted: this.goals.exportRunCompleted
      },
      feedback: this.feedback
    };
  }

  private createRatingRow(label: string, key: RatingKey): HTMLDivElement {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.justifyContent = "space-between";
    row.style.marginBottom = "8px";

    const labelNode = document.createElement("div");
    labelNode.textContent = label;
    labelNode.style.fontSize = "12px";
    labelNode.style.color = "#d3edff";
    row.appendChild(labelNode);

    const buttonsWrap = document.createElement("div");
    buttonsWrap.style.display = "flex";
    buttonsWrap.style.gap = "6px";

    for (let score = 1; score <= 5; score += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${score}`;
      button.style.width = "28px";
      button.style.height = "24px";
      button.style.borderRadius = "6px";
      button.style.border = "1px solid rgba(162, 211, 255, 0.32)";
      button.style.background = "#0d1722";
      button.style.color = "#d3edff";
      button.style.fontSize = "11px";
      button.style.cursor = "pointer";
      button.addEventListener("click", () => {
        this.draftFeedback[key] = score;
        this.refreshRatingButtons(key);
        this.refreshSubmitState();
      });
      this.ratingButtons[key].push(button);
      buttonsWrap.appendChild(button);
    }

    row.appendChild(buttonsWrap);
    return row;
  }

  private refreshRatingButtons(key: RatingKey): void {
    const value = this.draftFeedback[key] ?? 0;
    for (let i = 0; i < this.ratingButtons[key].length; i += 1) {
      const button = this.ratingButtons[key][i];
      const selected = i + 1 === value;
      button.style.background = selected ? "#2a9d8f" : "#0d1722";
      button.style.borderColor = selected ? "rgba(162, 230, 201, 0.72)" : "rgba(162, 211, 255, 0.32)";
      button.style.color = selected ? "#041015" : "#d3edff";
    }
  }

  private refreshSubmitState(): void {
    const ready =
      this.draftFeedback.clarity !== undefined &&
      this.draftFeedback.agency !== undefined &&
      this.draftFeedback.surprise !== undefined &&
      this.draftFeedback.replay !== undefined;
    this.submitButton.disabled = !ready;
    this.submitButton.style.opacity = ready ? "1" : "0.5";
  }

  private completeFeedbackFromDraft(): PlaytestFeedback | null {
    const clarity = this.draftFeedback.clarity;
    const agency = this.draftFeedback.agency;
    const surprise = this.draftFeedback.surprise;
    const replay = this.draftFeedback.replay;

    if (
      clarity === undefined ||
      agency === undefined ||
      surprise === undefined ||
      replay === undefined
    ) {
      return null;
    }

    return { clarity, agency, surprise, replay };
  }

  private showFeedback(): void {
    this.feedbackStatus.textContent = "";
    this.feedbackOverlay.style.display = "flex";
    window.addEventListener("keydown", this.handleFeedbackEscape, true);
  }

  private hideFeedback(): void {
    this.feedbackOverlay.style.display = "none";
    window.removeEventListener("keydown", this.handleFeedbackEscape, true);
  }

  private readonly handleFeedbackEscape = (event: Event): void => {
    if (!(event instanceof KeyboardEvent)) {
      return;
    }
    if (event.key !== "Escape") {
      return;
    }
    event.preventDefault();
    this.hideFeedback();
    this.resolveFeedbackRequest();
  };

  private resolveFeedbackRequest(): void {
    if (this.pendingFeedbackCompletion === null) {
      return;
    }
    const callback = this.pendingFeedbackCompletion;
    this.pendingFeedbackCompletion = null;
    callback();
  }

  private renderSummary(): void {
    this.nextActionLine.textContent = this.getNextActionText();
    this.renderGoalLine(this.goalFood, "Trigger Food Burst", this.goals.foodBurstTriggered);
    this.renderGoalLine(this.goalBranch, "Create a branch (B)", this.goals.branchCreated);
    this.renderGoalLine(this.goalExport, "Export a run", this.goals.exportRunCompleted);

    const firstAction =
      this.firstActionMs === null ? "pending" : `${this.firstActionMs}ms`;
    const actions =
      this.actionsUsed.size === 0
        ? "none"
        : [...this.actionsUsed].map((kind) => ACTION_LABEL[kind]).join(", ");
    const timeline = this.timelineOpened ? "opened" : "closed";
    const feedbackState = this.feedback === null ? "not submitted" : "submitted";

    this.statsLine.innerHTML = [
      `<div>first action: ${firstAction}</div>`,
      `<div>actions used: ${actions}</div>`,
      `<div>timeline: ${timeline} | feedback: ${feedbackState}</div>`
    ].join("");
  }

  private getNextActionText(): string {
    if (!this.goals.foodBurstTriggered) {
      return "Next: trigger Food Burst to kickstart energy exchange.";
    }
    if (!this.timelineOpened) {
      return "Next: press T to open the timeline instrument.";
    }
    if (!this.goals.branchCreated) {
      return "Next: press B to capture a branch point.";
    }
    if (!this.goals.exportRunCompleted) {
      return "Next: click Export Run to save this trajectory.";
    }
    return "Loop complete. Perturb, branch, compare, then export again.";
  }

  private renderGoalLine(target: HTMLDivElement, label: string, completed: boolean): void {
    target.textContent = `${completed ? "[x]" : "[ ]"} ${label}`;
    target.style.color = completed ? "#9be564" : "rgba(197, 223, 244, 0.95)";
  }
}
