import * as vscode from "vscode";
import { ForumSubscription } from "../models/tieba";
import { STORAGE_KEYS } from "./storageKeys";

export interface SyncForumInput {
  forumId?: string;
  forumName: string;
  displayName?: string;
}

export interface SyncForumsResult {
  added: number;
  existing: number;
  total: number;
}

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

  async clear(): Promise<void> {
    await this.context.globalState.update(STORAGE_KEYS.forums, []);
  }

  async mergeFromAccount(inputs: SyncForumInput[]): Promise<SyncForumsResult> {
    const forums = this.list();
    const next = [...forums];
    const existingByName = new Map(forums.map((forum) => [forum.forumName, forum]));
    let added = 0;
    let existing = 0;

    for (const input of inputs) {
      const forumName = input.forumName.trim();
      if (!forumName) {
        continue;
      }

      const current = existingByName.get(forumName);
      if (current) {
        existing += 1;
        if (!current.forumId && input.forumId) {
          current.forumId = input.forumId;
        }
        if (!current.displayName && input.displayName?.trim()) {
          current.displayName = input.displayName.trim();
        }
        continue;
      }

      const created: ForumSubscription = {
        forumId: input.forumId?.trim() || undefined,
        forumName,
        displayName: input.displayName?.trim() || forumName,
        addedAt: Date.now()
      };
      next.push(created);
      existingByName.set(forumName, created);
      added += 1;
    }

    await this.context.globalState.update(STORAGE_KEYS.forums, next);
    return {
      added,
      existing,
      total: added + existing
    };
  }
}
