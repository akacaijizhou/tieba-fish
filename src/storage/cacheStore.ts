import * as vscode from "vscode";
import { CacheEntry } from "../models/tieba";

type CacheBucket<T> = Record<string, CacheEntry<T>>;

export class CacheStore<T> {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly key: string,
    private readonly version: number
  ) {}

  get(cacheKey: string): T | undefined {
    const bucket = this.context.globalState.get<CacheBucket<T>>(this.key, {});
    const entry = bucket[cacheKey];
    if (!entry) {
      return undefined;
    }

    if (entry.version !== this.version || entry.expiresAt <= Date.now()) {
      return undefined;
    }

    return entry.value;
  }

  async set(cacheKey: string, value: T, ttlMs: number): Promise<void> {
    const bucket = this.context.globalState.get<CacheBucket<T>>(this.key, {});
    bucket[cacheKey] = {
      value,
      updatedAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
      version: this.version
    };
    await this.context.globalState.update(this.key, bucket);
  }

  async clear(): Promise<void> {
    await this.context.globalState.update(this.key, {});
  }
}
