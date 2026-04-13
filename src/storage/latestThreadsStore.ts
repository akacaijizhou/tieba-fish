import * as vscode from "vscode";
import { LatestThreadsSnapshot } from "../models/tieba";
import { STORAGE_KEYS } from "./storageKeys";

export class LatestThreadsStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  get(): LatestThreadsSnapshot | undefined {
    const snapshot = this.context.globalState.get<LatestThreadsSnapshot | undefined>(STORAGE_KEYS.latestThreads);
    return snapshot ? { ...snapshot, threads: [...snapshot.threads] } : undefined;
  }

  async set(snapshot: LatestThreadsSnapshot): Promise<void> {
    await this.context.globalState.update(STORAGE_KEYS.latestThreads, snapshot);
  }

  async clear(): Promise<void> {
    await this.context.globalState.update(STORAGE_KEYS.latestThreads, undefined);
  }
}
