import * as vscode from "vscode";
import {
  FavoriteEntry,
  ForumSubscription,
  ForumThreadPage,
  HistoryEntry,
  LatestThreadsSnapshot,
  PostCommentsPage,
  ReadingSession,
  ThreadDetailPage,
  ThreadSummary,
  TiebaSettings
} from "../models/tieba";
import { CacheStore } from "../storage/cacheStore";
import { FavoritesStore } from "../storage/favoritesStore";
import { ForumsStore, SyncForumsResult } from "../storage/forumsStore";
import { HistoryStore } from "../storage/historyStore";
import { LatestThreadsStore } from "../storage/latestThreadsStore";
import { ReadingSessionStore } from "../storage/readingSessionStore";
import { SettingsStore } from "../storage/settingsStore";
import { STORAGE_KEYS } from "../storage/storageKeys";
import { AuthStore } from "../storage/authStore";
import { TiebaError } from "./errors";
import { LiveTiebaDataSource, buildForumUrl, buildThreadUrl } from "./datasource/liveTiebaDataSource";
import { PythonAiotiebaDataSource, PythonRuntimeCheckResult } from "./datasource/pythonAiotiebaDataSource";
import { TiebaDataSource } from "./datasource/tiebaDataSource";

const CACHE_VERSION = 1;
const BAIDU_SUGGEST_URL = "https://suggestion.baidu.com/su";
const FORUM_SUGGESTION_STOP_WORDS = ["官网", "下载", "入口", "实时行情", "官服"];

export interface ForumNameSuggestion {
  forumName: string;
  hint: string;
}

export type TiebaResolvedSource = "aiotieba" | "web";

export interface TiebaStatusSnapshot {
  hasBduss: boolean;
  hasStoken: boolean;
  hasCookie: boolean;
  lastResolvedSource?: TiebaResolvedSource;
  lastResolvedAt?: number;
  lastFailure?: {
    code: string;
    message: string;
    at: number;
  };
}

export interface TiebaDiagnosticsReport extends TiebaStatusSnapshot {
  bridge: {
    available: boolean;
    version?: string;
    modulePath?: string;
    loadMode?: "installed" | "local";
    pythonAvailable: boolean;
    pythonVersion?: string;
    canInstallAiotieba: boolean;
    pythonPath: string;
    message: string;
  };
  settings: TiebaSettings;
}

export interface FollowedForumsSyncResult extends SyncForumsResult {}

export class TiebaService {
  private readonly forumsStore: ForumsStore;
  private readonly favoritesStore: FavoritesStore;
  private readonly historyStore: HistoryStore;
  private readonly latestThreadsStore: LatestThreadsStore;
  private readonly readingSessionStore: ReadingSessionStore;
  private readonly settingsStore: SettingsStore;
  private readonly authStore: AuthStore;
  private readonly forumCache: CacheStore<ForumThreadPage>;
  private readonly threadCache: CacheStore<ThreadDetailPage>;
  private readonly liveDataSource: TiebaDataSource;
  private readonly bridgeDataSource: PythonAiotiebaDataSource;
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  private readonly statusEmitter = new vscode.EventEmitter<void>();
  private lastResolvedSource?: TiebaResolvedSource;
  private lastResolvedAt?: number;
  private lastFailure?: TiebaStatusSnapshot["lastFailure"];

  readonly onDidChange = this.changeEmitter.event;
  readonly onDidChangeStatus = this.statusEmitter.event;

  constructor(context: vscode.ExtensionContext) {
    this.forumsStore = new ForumsStore(context);
    this.favoritesStore = new FavoritesStore(context);
    this.historyStore = new HistoryStore(context);
    this.latestThreadsStore = new LatestThreadsStore(context);
    this.readingSessionStore = new ReadingSessionStore(context);
    this.settingsStore = new SettingsStore();
    this.authStore = new AuthStore(context);
    this.forumCache = new CacheStore(context, STORAGE_KEYS.forumCache, CACHE_VERSION);
    this.threadCache = new CacheStore(context, STORAGE_KEYS.threadCache, CACHE_VERSION);
    this.liveDataSource = new LiveTiebaDataSource(() => this.authStore.getCookie());
    this.bridgeDataSource = new PythonAiotiebaDataSource(
      context,
      () => this.authStore.getAccountAuth(),
      () => vscode.workspace.getConfiguration("tieba").get<string>("pythonPath")?.trim() || "python"
    );
  }

  listForums(): ForumSubscription[] {
    return this.forumsStore.list();
  }

  getLatestThreads(): LatestThreadsSnapshot | undefined {
    return this.latestThreadsStore.get();
  }

  listFavorites(): FavoriteEntry[] {
    return this.favoritesStore.list();
  }

  listHistory(): HistoryEntry[] {
    return this.historyStore.list();
  }

  getReadingSession(): ReadingSession | undefined {
    return this.readingSessionStore.get();
  }

  listForumSuggestions(query = ""): ForumNameSuggestion[] {
    return this.collectLocalForumSuggestions(query.trim());
  }

  getSettings(): TiebaSettings {
    return this.settingsStore.get();
  }

  async getStatusSnapshot(): Promise<TiebaStatusSnapshot> {
    const [auth, cookie] = await Promise.all([this.authStore.getAccountAuth(), this.authStore.getCookie()]);
    return {
      hasBduss: Boolean(auth.bduss),
      hasStoken: Boolean(auth.stoken),
      hasCookie: Boolean(cookie),
      lastResolvedSource: this.lastResolvedSource,
      lastResolvedAt: this.lastResolvedAt,
      lastFailure: this.lastFailure
    };
  }

  async getDiagnosticsReport(): Promise<TiebaDiagnosticsReport> {
    const [status, bridge, pythonPath, pythonRuntime] = await Promise.all([
      this.getStatusSnapshot(),
      this.getBridgeHealthCheck(),
      Promise.resolve(vscode.workspace.getConfiguration("tieba").get<string>("pythonPath")?.trim() || "python"),
      this.getPythonRuntimeCheck()
    ]);

    return {
      ...status,
      bridge: {
        ...bridge,
        pythonPath,
        pythonAvailable: pythonRuntime.available,
        pythonVersion: pythonRuntime.version,
        canInstallAiotieba: pythonRuntime.available && !bridge.available
      },
      settings: this.getSettings()
    };
  }

  async installAiotiebaPackage(): Promise<void> {
    await this.bridgeDataSource.installAiotiebaPackage();
    this.statusEmitter.fire();
  }

  async toggleImages(): Promise<TiebaSettings> {
    const current = this.getSettings();
    await this.settingsStore.updateShowImages(!current.showImages);
    this.changeEmitter.fire();
    return this.getSettings();
  }

  async addForum(forumName: string): Promise<ForumSubscription> {
    const forum = await this.forumsStore.add(forumName);
    this.changeEmitter.fire();
    return forum;
  }

  async syncFollowedForums(): Promise<FollowedForumsSyncResult> {
    const auth = await this.authStore.getAccountAuth();
    if (!auth.bduss || !auth.stoken) {
      throw new TiebaError(
        "auth",
        "同步我关注的贴吧需要完整登录态。请导入包含 STOKEN 的完整贴吧 Cookie。"
      );
    }

    try {
      const forums = await this.bridgeDataSource.getSelfFollowForumsAll();
      const result = await this.forumsStore.mergeFromAccount(
        forums.map((forum) => ({
          forumId: forum.forumId,
          forumName: forum.forumName,
          displayName: forum.forumName
        }))
      );

      this.recordResolvedSource("aiotieba");
      this.changeEmitter.fire();
      return result;
    } catch (error) {
      const normalized = normalizeTiebaError(error);
      this.recordFailure(normalized);
      throw normalized;
    }
  }

  async removeForum(forumName: string): Promise<void> {
    await this.forumsStore.remove(forumName);
    this.changeEmitter.fire();
  }

  isFavorite(threadId: string): boolean {
    return this.favoritesStore.isFavorite(threadId);
  }

  async toggleFavorite(thread: ThreadSummary): Promise<boolean> {
    const result = await this.favoritesStore.toggle(thread);
    this.changeEmitter.fire();
    return result;
  }

  async recordHistory(thread: ThreadSummary): Promise<void> {
    await this.historyStore.push(thread, this.getSettings().maxHistory);
    this.changeEmitter.fire();
  }

  async recordReadingSession(thread: ThreadSummary, page: number): Promise<void> {
    await this.readingSessionStore.set(thread, page);
    this.changeEmitter.fire();
  }

  async clearCaches(): Promise<void> {
    await Promise.all([this.forumCache.clear(), this.threadCache.clear()]);
  }

  async resetAllLocalState(): Promise<void> {
    await Promise.all([
      this.authStore.clearAccountAuth(),
      this.authStore.clearCookie(),
      this.forumsStore.clear(),
      this.favoritesStore.clear(),
      this.historyStore.clear(),
      this.latestThreadsStore.clear(),
      this.readingSessionStore.clear(),
      this.clearCaches()
    ]);

    this.lastResolvedSource = undefined;
    this.lastResolvedAt = undefined;
    this.lastFailure = undefined;
    this.changeEmitter.fire();
    this.statusEmitter.fire();
  }

  async setLatestThreads(pageData: ForumThreadPage): Promise<LatestThreadsSnapshot> {
    const snapshot: LatestThreadsSnapshot = {
      ...pageData,
      threads: [...pageData.threads],
      updatedAt: Date.now()
    };
    await this.latestThreadsStore.set(snapshot);
    this.changeEmitter.fire();
    return snapshot;
  }

  async refreshLatestThreads(forceRefresh = true): Promise<LatestThreadsSnapshot> {
    const latest = this.getLatestThreads();
    if (!latest) {
      throw new TiebaError("parse", "还没有最新视图数据。先点开一个关注吧，这里会承接该吧最近一次加载的帖子列表。");
    }

    const pageData = await this.getForumThreads(latest.forumName, latest.page, forceRefresh);
    return this.setLatestThreads(pageData);
  }

  async loadLatestThreadsPage(page: number, forceRefresh = false): Promise<LatestThreadsSnapshot> {
    const latest = this.getLatestThreads();
    if (!latest) {
      throw new TiebaError("parse", "还没有最新视图数据。先点开一个关注吧，这里会承接该吧最近一次加载的帖子列表。");
    }

    const nextPage = Math.max(1, page);
    const pageData = await this.getForumThreads(latest.forumName, nextPage, forceRefresh);
    return this.setLatestThreads(pageData);
  }

  async hasCookie(): Promise<boolean> {
    return this.authStore.hasCookie();
  }

  async hasAccountAuth(): Promise<boolean> {
    return this.authStore.hasBduss();
  }

  async hasLoginState(): Promise<boolean> {
    const [auth, cookie] = await Promise.all([this.authStore.getAccountAuth(), this.authStore.getCookie()]);
    return Boolean(auth.bduss || cookie);
  }

  async saveImportedLoginState(input: { bduss: string; stoken?: string; cookie?: string }): Promise<void> {
    await this.authStore.setAccountAuth({
      bduss: input.bduss,
      stoken: input.stoken
    });

    if (input.cookie?.trim()) {
      await this.authStore.setCookie(input.cookie.trim());
    } else {
      await this.authStore.clearCookie();
    }

    await this.clearCaches();
    this.changeEmitter.fire();
    this.statusEmitter.fire();
  }

  async saveAccountAuth(input: { bduss: string; stoken?: string }): Promise<void> {
    await this.authStore.setAccountAuth(input);
    await this.clearCaches();
    this.changeEmitter.fire();
    this.statusEmitter.fire();
  }

  async clearAccountAuth(): Promise<void> {
    await this.authStore.clearAccountAuth();
    await this.clearCaches();
    this.changeEmitter.fire();
    this.statusEmitter.fire();
  }

  async clearLoginState(): Promise<void> {
    await Promise.all([this.authStore.clearAccountAuth(), this.authStore.clearCookie()]);
    await this.clearCaches();
    this.changeEmitter.fire();
    this.statusEmitter.fire();
  }

  async saveCookie(cookie: string): Promise<void> {
    await this.authStore.setCookie(cookie);
    await this.clearCaches();
    this.changeEmitter.fire();
    this.statusEmitter.fire();
  }

  async clearCookie(): Promise<void> {
    await this.authStore.clearCookie();
    await this.clearCaches();
    this.changeEmitter.fire();
    this.statusEmitter.fire();
  }

  async getForumThreads(forumName: string, page: number, forceRefresh = false): Promise<ForumThreadPage> {
    const cacheKey = `${forumName}:${page}`;
    const ttlMs = this.getCacheTtlMs();
    if (!forceRefresh && ttlMs > 0) {
      const cached = this.forumCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const next = await this.loadFromPreferredSources((source) => source.getForumThreads({ forumName, page }));
    if (ttlMs > 0) {
      await this.forumCache.set(cacheKey, next, ttlMs);
    }
    return next;
  }

  async getThreadDetail(
    input: { threadId: string; forumName?: string; page: number; sourceUrl?: string },
    forceRefresh = false
  ): Promise<ThreadDetailPage> {
    const cacheKey = `${input.threadId}:${input.page}`;
    const ttlMs = this.getCacheTtlMs();
    if (!forceRefresh && ttlMs > 0) {
      const cached = this.threadCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const next = await this.loadFromPreferredSources((source) => source.getThreadDetail(input));
    if (ttlMs > 0) {
      await this.threadCache.set(cacheKey, next, ttlMs);
    }
    return next;
  }

  async getPostComments(input: { threadId: string; postId: string; page?: number }): Promise<PostCommentsPage> {
    return this.loadFromPreferredSources((source) => source.getPostComments(input));
  }

  async searchForumSuggestions(query: string): Promise<ForumNameSuggestion[]> {
    const normalized = query.trim();
    if (!normalized) {
      return this.listForumSuggestions();
    }

    const merged = new Map<string, ForumNameSuggestion>();
    for (const suggestion of this.collectLocalForumSuggestions(normalized)) {
      merged.set(suggestion.forumName, suggestion);
    }

    const onlineSuggestions = await fetchOnlineForumSuggestions(normalized);
    const validatedOnlineSuggestions = await this.validateForumSuggestions(normalized, onlineSuggestions);
    for (const forumName of validatedOnlineSuggestions) {
      const existing = merged.get(forumName);
      if (existing) {
        existing.hint = mergeSuggestionHints(existing.hint, "联想");
        continue;
      }

      merged.set(forumName, {
        forumName,
        hint: "联想"
      });
    }

    return Array.from(merged.values());
  }

  getForumUrl(forumName: string, page = 1): string {
    return buildForumUrl(forumName, page);
  }

  getThreadUrl(threadId: string, page = 1): string {
    return buildThreadUrl(threadId, page);
  }

  private getCacheTtlMs(): number {
    const minutes = this.getSettings().cacheMinutes;
    return minutes <= 0 ? 0 : minutes * 60_000;
  }

  private collectLocalForumSuggestions(query: string): ForumNameSuggestion[] {
    const matcher = query.trim().toLocaleLowerCase("zh-CN");
    const suggestions = new Map<string, ForumNameSuggestion>();

    const addSuggestion = (forumName: string | undefined, hint: string): void => {
      const normalized = forumName?.trim();
      if (!normalized) {
        return;
      }

      if (matcher && !normalized.toLocaleLowerCase("zh-CN").includes(matcher)) {
        return;
      }

      const existing = suggestions.get(normalized);
      if (existing) {
        existing.hint = mergeSuggestionHints(existing.hint, hint);
        return;
      }

      suggestions.set(normalized, {
        forumName: normalized,
        hint
      });
    };

    for (const forum of this.forumsStore.list()) {
      addSuggestion(forum.displayName || forum.forumName, "已关注");
    }

    for (const entry of this.historyStore.list()) {
      addSuggestion(entry.thread.forumName, "历史");
    }

    for (const entry of this.favoritesStore.list()) {
      addSuggestion(entry.thread.forumName, "收藏");
    }

    addSuggestion(this.latestThreadsStore.get()?.forumName, "最新");

    return Array.from(suggestions.values());
  }

  private async validateForumSuggestions(query: string, onlineSuggestions: string[]): Promise<string[]> {
    const candidates = uniqueForumNames([query, ...onlineSuggestions]).slice(0, 8);
    if (candidates.length === 0) {
      return [];
    }

    try {
      const resolved = await this.bridgeDataSource.resolveForumNames(candidates);
      if (resolved.length > 0) {
        return uniqueForumNames(resolved);
      }
      return [];
    } catch {
      return onlineSuggestions;
    }
  }

  private async loadFromPreferredSources<T>(load: (source: TiebaDataSource) => Promise<T>): Promise<T> {
    const errors: TiebaError[] = [];
    const sources: Array<{ source: TiebaDataSource; name: TiebaResolvedSource }> = [
      { source: this.bridgeDataSource, name: "aiotieba" },
      { source: this.liveDataSource, name: "web" }
    ];

    for (const candidate of sources) {
      try {
        const result = await load(candidate.source);
        this.recordResolvedSource(candidate.name);
        return result;
      } catch (error) {
        errors.push(normalizeTiebaError(error));
      }
    }

    const combined = combineDataSourceErrors(errors);
    this.recordFailure(combined);
    throw combined;
  }

  private async getBridgeHealthCheck(): Promise<Omit<TiebaDiagnosticsReport["bridge"], "pythonPath">> {
    try {
      const result = await this.bridgeDataSource.healthCheck();
      return {
        available: Boolean(result.available),
        version: result.version,
        modulePath: result.modulePath,
        loadMode: result.loadMode,
        pythonAvailable: true,
        canInstallAiotieba: false,
        message:
          result.loadMode === "local"
            ? "aiotieba bridge 可用，当前通过项目内 aiotieba-master 回退导入。"
            : "aiotieba bridge 可用，当前通过已安装的 Python 包运行。"
      };
    } catch (error) {
      const normalized = normalizeTiebaError(error);
      return {
        available: false,
        pythonAvailable: false,
        canInstallAiotieba: false,
        message: normalized.message
      };
    }
  }

  private async getPythonRuntimeCheck(): Promise<PythonRuntimeCheckResult> {
    try {
      return await this.bridgeDataSource.checkPythonRuntime();
    } catch {
      return {
        available: false
      };
    }
  }

  private recordResolvedSource(source: TiebaResolvedSource): void {
    const changed = this.lastResolvedSource !== source || Boolean(this.lastFailure) || !this.lastResolvedAt;
    this.lastResolvedSource = source;
    this.lastResolvedAt = Date.now();
    this.lastFailure = undefined;
    if (changed) {
      this.statusEmitter.fire();
    }
  }

  private recordFailure(error: TiebaError): void {
    this.lastFailure = {
      code: error.code,
      message: error.message,
      at: Date.now()
    };
    this.statusEmitter.fire();
  }
}

function normalizeTiebaError(error: unknown): TiebaError {
  if (error instanceof TiebaError) {
    return error;
  }

  return new TiebaError("unknown", "贴吧数据源请求失败。", error);
}

function combineDataSourceErrors(errors: TiebaError[]): TiebaError {
  if (errors.length === 0) {
    return new TiebaError("unknown", "贴吧数据源请求失败。");
  }

  if (errors.length === 1) {
    return errors[0];
  }

  const [bridgeError, liveError] = errors;
  const code = liveError.code !== "unknown" ? liveError.code : bridgeError.code;
  const message =
    bridgeError.code === "bridge"
      ? `${liveError.message}（aiotieba bridge 当前不可用：${bridgeError.message}）`
      : `${bridgeError.message}（网页回退也失败：${liveError.message}）`;

  return new TiebaError(code, message, { bridgeError, liveError });
}

async function fetchOnlineForumSuggestions(query: string): Promise<string[]> {
  const url = `${BAIDU_SUGGEST_URL}?ie=utf-8&wd=${encodeURIComponent(query)}&cb=cb`;

  try {
    const response = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        referer: "https://www.baidu.com/"
      }
    });

    if (!response.ok) {
      return [];
    }

    return parseBaiduSuggestionResponse(await response.text(), query);
  } catch {
    return [];
  }
}

function parseBaiduSuggestionResponse(raw: string, query: string): string[] {
  const matched = raw.match(/s:\s*(\[[\s\S]*?\])\s*\}\)\s*;?\s*$/);
  if (!matched) {
    return [];
  }

  try {
    const parsed = JSON.parse(matched[1]) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    const seen = new Set<string>();
    const suggestions: string[] = [];
    for (const value of parsed) {
      if (typeof value !== "string") {
        continue;
      }

      const normalized = normalizeForumSuggestionName(value, query);
      if (!normalized || seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      suggestions.push(normalized);
    }

    return suggestions;
  } catch {
    return [];
  }
}

function normalizeForumSuggestionName(value: string, query: string): string | undefined {
  let normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  normalized = normalized.replace(/^百度贴吧\s*/u, "").replace(/\s*百度贴吧$/u, "");
  normalized = normalized.replace(/^贴吧\s*/u, "").replace(/\s*贴吧$/u, "");
  if (normalized.endsWith("吧")) {
    normalized = normalized.slice(0, -1).trim();
  }

  normalized = normalized.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }

  if (!normalized.toLocaleLowerCase("zh-CN").includes(query.trim().toLocaleLowerCase("zh-CN"))) {
    return undefined;
  }

  if (FORUM_SUGGESTION_STOP_WORDS.some((keyword) => normalized.includes(keyword))) {
    return undefined;
  }

  return normalized;
}

function mergeSuggestionHints(current: string, next: string): string {
  if (!current) {
    return next;
  }

  const parts = current.split(" · ");
  if (parts.includes(next)) {
    return current;
  }

  return `${current} · ${next}`;
}

function uniqueForumNames(values: string[]): string[] {
  const seen = new Set<string>();
  const items: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    items.push(normalized);
  }

  return items;
}
