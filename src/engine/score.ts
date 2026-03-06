import type { ScoreEntry, WorkerAction } from "../types";

function cloneAction(action: WorkerAction): WorkerAction {
  return JSON.parse(JSON.stringify(action)) as WorkerAction;
}

function cloneEntry(entry: ScoreEntry): ScoreEntry {
  return {
    tick: entry.tick,
    action: cloneAction(entry.action)
  };
}

export class Score {
  entries: ScoreEntry[];

  constructor(entries?: ScoreEntry[]) {
    this.entries = [];
    if (entries !== undefined) {
      for (const entry of entries) {
        this.schedule(entry.tick, entry.action);
      }
    }
  }

  schedule(tick: number, action: WorkerAction): void {
    const entry: ScoreEntry = {
      tick: Math.max(0, Math.floor(tick)),
      action: cloneAction(action)
    };

    let insertIndex = this.entries.length;
    for (let i = 0; i < this.entries.length; i += 1) {
      if (this.entries[i].tick > entry.tick) {
        insertIndex = i;
        break;
      }
    }

    this.entries.splice(insertIndex, 0, entry);
  }

  drain(currentTick: number): WorkerAction[] {
    const actions: WorkerAction[] = [];
    while (this.entries.length > 0 && this.entries[0].tick <= currentTick) {
      const entry = this.entries.shift();
      if (entry !== undefined) {
        actions.push(cloneAction(entry.action));
      }
    }
    return actions;
  }

  clone(): Score {
    return new Score(this.entries.map(cloneEntry));
  }

  serialize(): string {
    return JSON.stringify(this.entries.map(cloneEntry));
  }

  static deserialize(json: string): Score {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("Invalid score JSON: expected array.");
    }

    const entries: ScoreEntry[] = [];
    for (const item of parsed) {
      if (typeof item !== "object" || item === null) {
        throw new Error("Invalid score entry.");
      }
      const maybeTick = (item as { tick?: unknown }).tick;
      const maybeAction = (item as { action?: unknown }).action;
      if (typeof maybeTick !== "number" || typeof maybeAction !== "object" || maybeAction === null) {
        throw new Error("Invalid score entry shape.");
      }
      entries.push({
        tick: maybeTick,
        action: cloneAction(maybeAction as WorkerAction)
      });
    }

    return new Score(entries);
  }
}
