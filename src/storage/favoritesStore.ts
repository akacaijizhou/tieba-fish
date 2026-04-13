import * as vscode from "vscode";
import { FavoriteEntry, ThreadSummary } from "../models/tieba";
import { STORAGE_KEYS } from "./storageKeys";

export class FavoritesStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  list(): FavoriteEntry[] {
    const favorites = this.context.globalState.get<FavoriteEntry[]>(STORAGE_KEYS.favorites, []);
    return [...favorites].sort((a, b) => b.favoritedAt - a.favoritedAt);
  }

  isFavorite(threadId: string): boolean {
    return this.list().some((entry) => entry.thread.threadId === threadId);
  }

  async toggle(thread: ThreadSummary): Promise<boolean> {
    const favorites = this.list();
    const exists = favorites.some((entry) => entry.thread.threadId === thread.threadId);
    const next = exists
      ? favorites.filter((entry) => entry.thread.threadId !== thread.threadId)
      : [
          {
            thread,
            favoritedAt: Date.now()
          },
          ...favorites
        ];

    await this.context.globalState.update(STORAGE_KEYS.favorites, next);
    return !exists;
  }

  async clear(): Promise<void> {
    await this.context.globalState.update(STORAGE_KEYS.favorites, []);
  }
}
