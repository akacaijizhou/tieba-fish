import * as vscode from "vscode";
import { ForumSubscription } from "../models/tieba";
import { STORAGE_KEYS } from "./storageKeys";

export class ForumsStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  list(): ForumSubscription[] {
    const forums = this.context.globalState.get<ForumSubscription[]>(STORAGE_KEYS.forums, []);
    return [...forums].sort((a, b) => a.displayName.localeCompare(b.displayName, "zh-CN"));
  }

  async add(forumName: string): Promise<ForumSubscription> {
    const normalized = forumName.trim();
    const forums = this.list();
    const existing = forums.find((forum) => forum.forumName === normalized);
    if (existing) {
      return existing;
    }

    const next: ForumSubscription = {
      forumName: normalized,
      displayName: normalized,
      addedAt: Date.now()
    };

    await this.context.globalState.update(STORAGE_KEYS.forums, [...forums, next]);
    return next;
  }

  async remove(forumName: string): Promise<void> {
    const next = this.list().filter((forum) => forum.forumName !== forumName);
    await this.context.globalState.update(STORAGE_KEYS.forums, next);
  }
}
