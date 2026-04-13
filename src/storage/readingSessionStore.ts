import * as vscode from "vscode";
import { ReadingSession, ThreadSummary } from "../models/tieba";
import { STORAGE_KEYS } from "./storageKeys";

export class ReadingSessionStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  get(): ReadingSession | undefined {
    const session = this.context.globalState.get<ReadingSession | undefined>(STORAGE_KEYS.readingSession);
    return session
      ? {
          ...session,
          thread: { ...session.thread }
        }
      : undefined;
  }

  async set(thread: ThreadSummary, page: number): Promise<ReadingSession> {
    const next: ReadingSession = {
      thread: { ...thread },
      page: Math.max(1, page),
      updatedAt: Date.now()
    };

    await this.context.globalState.update(STORAGE_KEYS.readingSession, next);
    return next;
  }

  async clear(): Promise<void> {
    await this.context.globalState.update(STORAGE_KEYS.readingSession, undefined);
  }
}
