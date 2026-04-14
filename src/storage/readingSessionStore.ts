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
          thread: { ...session.thread },
          onlyLz: Boolean(session.onlyLz),
          lastFullPageBeforeOnlyLz: normalizeStoredPage(session.lastFullPageBeforeOnlyLz)
        }
      : undefined;
  }

  async set(
    thread: ThreadSummary,
    page: number,
    options?: { onlyLz?: boolean; lastFullPageBeforeOnlyLz?: number | null }
  ): Promise<ReadingSession> {
    const onlyLz = Boolean(options?.onlyLz);
    const next: ReadingSession = {
      thread: { ...thread },
      page: Math.max(1, page),
      onlyLz,
      lastFullPageBeforeOnlyLz: onlyLz ? normalizeStoredPage(options?.lastFullPageBeforeOnlyLz) : null,
      updatedAt: Date.now()
    };

    await this.context.globalState.update(STORAGE_KEYS.readingSession, next);
    return next;
  }

  async clear(): Promise<void> {
    await this.context.globalState.update(STORAGE_KEYS.readingSession, undefined);
  }
}

function normalizeStoredPage(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.max(1, Math.floor(value));
}
