import * as vscode from "vscode";
import { HistoryEntry, ThreadSummary } from "../models/tieba";
import { STORAGE_KEYS } from "./storageKeys";

export class HistoryStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  list(): HistoryEntry[] {
    const history = this.context.globalState.get<HistoryEntry[]>(STORAGE_KEYS.history, []);
    return [...history].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
  }

  async push(thread: ThreadSummary, maxHistory: number): Promise<void> {
    const history = this.list().filter((entry) => entry.thread.threadId !== thread.threadId);
    const next: HistoryEntry[] = [
      {
        thread,
        lastOpenedAt: Date.now()
      },
      ...history
    ].slice(0, maxHistory);

    await this.context.globalState.update(STORAGE_KEYS.history, next);
  }
}
