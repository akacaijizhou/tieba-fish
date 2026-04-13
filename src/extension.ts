import * as vscode from "vscode";
import { ForumSubscription, OpenTarget, ThreadSummary } from "./models/tieba";
import { TiebaError } from "./services/errors";
import { ForumNameSuggestion, TiebaService, TiebaStatusSnapshot } from "./services/tiebaService";
import { BossFilesProvider } from "./views/bossFilesProvider";
import { BossModeManager } from "./views/bossModeManager";
import { DiagnosticsPanel } from "./views/diagnosticsPanel";
import { FollowedForumsProvider } from "./views/followedForumsProvider";
import { ForumPanelManager } from "./views/forumPanel";
import { HistoryViewProvider } from "./views/historyViewProvider";
import { LatestViewProvider } from "./views/latestViewProvider";
import { ThreadPanelManager } from "./views/threadPanel";

interface LoadableTreeProvider {
  setLoading(loading: boolean): void;
}

interface TreeViewLoadingController {
  dispose(): void;
  run<T>(message: string, task: () => Promise<T>): Promise<T>;
}

export function activate(context: vscode.ExtensionContext): void {
  const service = new TiebaService(context);
  const followedForumsProvider = new FollowedForumsProvider(service);
  const latestViewProvider = new LatestViewProvider(service);
  const historyViewProvider = new HistoryViewProvider(service);
  const forumPanels = new ForumPanelManager(context, service);
  const threadPanels = new ThreadPanelManager(context, service);
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri ?? context.extensionUri;
  const bossFilesProvider = new BossFilesProvider(vscode.Uri.joinPath(workspaceRoot, "client-dashboard"));
  const bossMode = new BossModeManager(context, forumPanels, threadPanels);
  const diagnosticsPanel = new DiagnosticsPanel(context, service);
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
  statusBarItem.command = "tieba.openDiagnostics";
  statusBarItem.name = "Tieba 状态";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  void vscode.commands.executeCommand("setContext", "tieba.bossModeEnabled", false);

  const refreshStatusBar = async (): Promise<void> => {
    const snapshot = await service.getStatusSnapshot();
    statusBarItem.text = buildTiebaStatusBarText(snapshot);
    statusBarItem.tooltip = buildTiebaStatusBarTooltip(snapshot);
  };

  void refreshStatusBar();

  const followedForumsView = vscode.window.createTreeView("tieba.forums", {
    treeDataProvider: followedForumsProvider
  });
  const latestView = vscode.window.createTreeView("tieba.latest", {
    treeDataProvider: latestViewProvider
  });
  const historyView = vscode.window.createTreeView("tieba.history", {
    treeDataProvider: historyViewProvider
  });
  const bossFilesView = vscode.window.createTreeView("tieba.bossFiles", {
    treeDataProvider: bossFilesProvider
  });

  context.subscriptions.push(
    followedForumsView,
    latestView,
    historyView,
    bossFilesView,
  );

  const followedForumsLoading = createTreeViewLoadingController(
    followedForumsView,
    followedForumsProvider,
    "正在加载关注吧..."
  );
  const latestViewLoading = createTreeViewLoadingController(latestView, latestViewProvider, "正在加载最新视图...");
  const historyViewLoading = createTreeViewLoadingController(historyView, historyViewProvider, "正在加载历史...");

  context.subscriptions.push(followedForumsLoading, latestViewLoading, historyViewLoading);

  context.subscriptions.push(
    service.onDidChange(() => {
      followedForumsProvider.refresh();
      latestViewProvider.refresh();
      historyViewProvider.refresh();
      void refreshStatusBar();
    }),
    service.onDidChangeStatus(() => {
      void refreshStatusBar();
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("tieba")) {
        followedForumsProvider.refresh();
        latestViewProvider.refresh();
        historyViewProvider.refresh();
        threadPanels.broadcastSettings();
        void refreshStatusBar();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("tieba.addForum", async () => {
      const value = await pickForumName(service);

      if (!value?.trim()) {
        return;
      }

      const forum = await service.addForum(value.trim());
      await vscode.commands.executeCommand("tieba.openForum", forum);
    }),

    vscode.commands.registerCommand("tieba.syncFollowedForums", async () => {
      try {
        const result = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "正在同步我关注的贴吧",
            cancellable: false
          },
          () => service.syncFollowedForums()
        );

        if (result.total === 0) {
          void vscode.window.showInformationMessage("贴吧账号里还没有可导入的关注吧。");
          return;
        }

        void vscode.window.showInformationMessage(
          `同步完成：新增 ${result.added} 个，已存在 ${result.existing} 个。`
        );
      } catch (error) {
        const normalized =
          error instanceof TiebaError ? error : new TiebaError("unknown", error instanceof Error ? error.message : "同步失败。");
        if (normalized.code === "auth") {
          const action = await vscode.window.showErrorMessage(normalized.message, "去导入登录态");
          if (action === "去导入登录态") {
            await vscode.commands.executeCommand("tieba.configureAccount");
          }
          return;
        }

        void vscode.window.showErrorMessage(normalized.message);
      }
    }),

    vscode.commands.registerCommand("tieba.configureAccount", async () => {
      const hasLoginState = await service.hasLoginState();
      const primaryInput = await vscode.window.showInputBox({
        title: "导入贴吧登录态",
        prompt: hasLoginState
          ? "优先粘贴新的完整贴吧 Cookie。扩展会自动提取 BDUSS / STOKEN，并同步更新网页回退登录态。"
          : "粘贴从浏览器复制的完整贴吧 Cookie。扩展会自动提取 BDUSS / STOKEN；也兼容直接粘贴 BDUSS。",
        placeHolder: "例如：BDUSS=...; STOKEN=...; BAIDUID=...",
        password: true,
        ignoreFocusOut: true,
        validateInput: (input) => validateLoginStateInput(input)
      });

      if (!primaryInput?.trim()) {
        return;
      }

      const imported = parseImportedLoginState(primaryInput);
      if (!imported) {
        void vscode.window.showErrorMessage("没有识别到 BDUSS。建议直接粘贴从浏览器复制的完整贴吧 Cookie。");
        return;
      }

      await service.saveImportedLoginState(imported);
      void vscode.window.showInformationMessage(buildImportedLoginStateMessage(imported));
    }),

    vscode.commands.registerCommand("tieba.importLoginStateFromClipboard", async () => {
      const clipboardText = (await vscode.env.clipboard.readText()).trim();
      if (!clipboardText) {
        void vscode.window.showErrorMessage("剪贴板是空的。先在浏览器里复制贴吧 Cookie。");
        return;
      }

      const imported = parseImportedLoginState(clipboardText);
      if (!imported) {
        void vscode.window.showErrorMessage("剪贴板里没有识别到贴吧登录态。建议先复制完整贴吧 Cookie。");
        return;
      }

      await service.saveImportedLoginState(imported);
      void vscode.window.showInformationMessage(buildImportedLoginStateMessage(imported));
    }),

    vscode.commands.registerCommand("tieba.clearAccount", async () => {
      const hasLoginState = await service.hasLoginState();
      if (!hasLoginState) {
        void vscode.window.showInformationMessage("当前还没有导入贴吧登录态。");
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        "清除本地保存的贴吧登录态？这会同时清除提取出来的 BDUSS / STOKEN 和已导入的 Cookie，之后将回到匿名访问。",
        { modal: true },
        "清除"
      );

      if (confirm !== "清除") {
        return;
      }

      await service.clearLoginState();
      void vscode.window.showInformationMessage("贴吧登录态已清除。");
    }),

    vscode.commands.registerCommand("tieba.configureCookie", async () => {
      const hasCookie = await service.hasCookie();
      const value = await vscode.window.showInputBox({
        title: "配置贴吧 Cookie",
        prompt: hasCookie
          ? "粘贴新的贴吧 Cookie。保存后会覆盖旧值并清理缓存。"
          : "粘贴从浏览器复制的完整贴吧 Cookie。",
        placeHolder: "例如：BDUSS=...; STOKEN=...; BAIDUID=...",
        password: true,
        ignoreFocusOut: true,
        validateInput: (input) => validateCookieInput(input)
      });

      if (!value?.trim()) {
        return;
      }

      await service.saveCookie(value.trim());
      void vscode.window.showInformationMessage(
        "贴吧 Cookie 已保存到 VS Code Secret Storage。后续请求会自动带上登录态。"
      );
    }),

    vscode.commands.registerCommand("tieba.clearCookie", async () => {
      const hasCookie = await service.hasCookie();
      if (!hasCookie) {
        void vscode.window.showInformationMessage("当前还没有配置贴吧 Cookie。");
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        "清除本地保存的贴吧 Cookie？清除后将回到匿名访问。",
        { modal: true },
        "清除"
      );

      if (confirm !== "清除") {
        return;
      }

      await service.clearCookie();
      void vscode.window.showInformationMessage("贴吧 Cookie 已清除。");
    }),

    vscode.commands.registerCommand("tieba.refreshAll", async () => {
      await service.clearCaches();
      followedForumsProvider.refresh();
      latestViewProvider.refresh();
      historyViewProvider.refresh();
      void vscode.window.showInformationMessage("Tieba 视图已刷新。");
    }),

    vscode.commands.registerCommand("tieba.refreshLatest", async () => {
      try {
        await latestViewLoading.run("正在刷新最新视图...", () => service.refreshLatestThreads(true));
      } catch (error) {
        const message = error instanceof Error ? error.message : "刷新最新数据失败。";
        void vscode.window.showErrorMessage(message);
      }
    }),

    vscode.commands.registerCommand("tieba.latestPreviousPage", async () => {
      const latest = service.getLatestThreads();
      if (!latest || latest.page <= 1) {
        return;
      }

      try {
        await latestViewLoading.run("正在加载上一页...", () => service.loadLatestThreadsPage(latest.page - 1, false));
      } catch (error) {
        const message = error instanceof Error ? error.message : "加载上一页失败。";
        void vscode.window.showErrorMessage(message);
      }
    }),

    vscode.commands.registerCommand("tieba.latestNextPage", async () => {
      const latest = service.getLatestThreads();
      if (!latest) {
        return;
      }

      if (latest.pageCount && latest.page >= latest.pageCount) {
        return;
      }

      try {
        await latestViewLoading.run("正在加载下一页...", () => service.loadLatestThreadsPage(latest.page + 1, false));
      } catch (error) {
        const message = error instanceof Error ? error.message : "加载下一页失败。";
        void vscode.window.showErrorMessage(message);
      }
    }),

    vscode.commands.registerCommand("tieba.openForum", async (target?: ForumSubscription | { forum?: ForumSubscription }) => {
      const resolvedTarget = resolveForumSubscription(target);
      if (resolvedTarget?.forumName) {
        forumPanels.open(resolvedTarget);
        return;
      }

      const value = await vscode.window.showInputBox({
        prompt: "输入吧名并打开",
        placeHolder: "例如：steam"
      });
      if (!value?.trim()) {
        return;
      }
      forumPanels.open({
        forumName: value.trim(),
        displayName: value.trim(),
        addedAt: Date.now()
      });
    }),

    vscode.commands.registerCommand("tieba.removeForum", async (target?: ForumSubscription | { forum?: ForumSubscription }) => {
      const resolvedTarget = resolveForumSubscription(target);
      if (!resolvedTarget?.forumName) {
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        `移除关注吧“${resolvedTarget.displayName}”？`,
        { modal: true },
        "移除"
      );

      if (confirm === "移除") {
        await service.removeForum(resolvedTarget.forumName);
      }
    }),

    vscode.commands.registerCommand("tieba.openThread", async (thread?: ThreadSummary) => {
      if (!thread?.threadId) {
        await openThreadFromInput(threadPanels);
        return;
      }

      await threadPanels.open(thread);
    }),

    vscode.commands.registerCommand("tieba.openThreadByUrl", async () => {
      await openThreadFromInput(threadPanels);
    }),

    vscode.commands.registerCommand("tieba.openDiagnostics", async () => {
      await diagnosticsPanel.open();
    }),

    vscode.commands.registerCommand("tieba.openExternal", async (target?: OpenTarget) => {
      const url = resolveUrl(service, target);
      if (!url) {
        return;
      }
      await vscode.env.openExternal(vscode.Uri.parse(url));
    }),

    vscode.commands.registerCommand("tieba.openInSimpleBrowser", async (target?: OpenTarget) => {
      const url = resolveUrl(service, target);
      if (!url) {
        return;
      }

      try {
        await vscode.commands.executeCommand("simpleBrowser.show", url);
      } catch {
        await vscode.env.openExternal(vscode.Uri.parse(url));
      }
    }),

    vscode.commands.registerCommand("tieba.toggleImages", async () => {
      const settings = await service.toggleImages();
      void vscode.window.showInformationMessage(
        settings.showImages ? "Tieba 图片已开启。" : "Tieba 图片已关闭。"
      );
    }),

    vscode.commands.registerCommand("tieba.bossKey", async () => {
      await bossMode.toggle();
    })
  );
}

export function deactivate(): void {
  // noop
}

function resolveUrl(service: TiebaService, target?: OpenTarget): string | undefined {
  if (!target) {
    return undefined;
  }

  if ("threadId" in target) {
    return target.url || service.getThreadUrl(target.threadId);
  }

  if ("forumName" in target) {
    const url = "url" in target ? target.url : undefined;
    return url || service.getForumUrl(target.forumName);
  }

  return undefined;
}

interface ImportedLoginState {
  bduss: string;
  stoken?: string;
  cookie?: string;
}

function validateLoginStateInput(input: string): string | undefined {
  const value = input.trim();
  if (!value) {
    return undefined;
  }

  const imported = parseImportedLoginState(value);
  if (!imported) {
    return "没有识别到 BDUSS。建议直接粘贴从浏览器复制的完整贴吧 Cookie。";
  }

  if (/\s/.test(imported.bduss)) {
    return "BDUSS 不应包含空白字符。";
  }

  if (imported.bduss.length < 20) {
    return "识别到的 BDUSS 长度偏短，建议确认是否复制完整。";
  }

  return undefined;
}

function extractCredentialValue(input: string, key: "BDUSS" | "STOKEN"): string | undefined {
  const trimmed = input.trim();
  if (!trimmed) {
    return undefined;
  }

  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matcher = new RegExp(`(?:^|[;\\s])${escapedKey}=([^;\\s]+)`, "i");
  const matched = trimmed.match(matcher);
  if (matched?.[1]) {
    return matched[1].trim();
  }

  if (!trimmed.includes("=")) {
    return trimmed;
  }

  return undefined;
}

function parseImportedLoginState(input: string): ImportedLoginState | undefined {
  const trimmed = input.trim();
  if (!trimmed) {
    return undefined;
  }

  const bduss = extractCredentialValue(trimmed, "BDUSS");
  if (!bduss) {
    return undefined;
  }

  const stoken = extractCredentialValue(trimmed, "STOKEN");
  return {
    bduss,
    stoken,
    cookie: looksLikeCookieString(trimmed) ? trimmed : undefined
  };
}

function looksLikeCookieString(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed.includes("=") || !trimmed.includes(";")) {
    return false;
  }

  return /(?:^|;\s*)[A-Za-z0-9_\-]+=/.test(trimmed);
}

function buildImportedLoginStateMessage(imported: ImportedLoginState): string {
  if (!imported.stoken) {
    return imported.cookie
      ? "贴吧登录态已导入，但没有检测到 STOKEN。普通阅读可以继续使用；同步我关注的贴吧仍建议重新导入完整 Cookie。"
      : "BDUSS 已导入。普通阅读可以继续使用；同步我关注的贴吧仍需要包含 STOKEN 的完整 Cookie。";
  }

  if (imported.cookie) {
    return "贴吧登录态已导入。后续请求会优先走 aiotieba，网页回退也会复用这份 Cookie。";
  }

  return "贴吧登录态已导入。后续请求会优先走 aiotieba 数据源。";
}

function validateCookieInput(input: string): string | undefined {
  const value = input.trim();
  if (!value) {
    return undefined;
  }

  if (!value.includes("=")) {
    return "Cookie 格式不对，至少应该包含 key=value。";
  }

  if (!value.includes(";")) {
    return "建议粘贴完整 Cookie 字符串，而不是单个字段。";
  }

  return undefined;
}

function resolveForumSubscription(
  target?: ForumSubscription | { forum?: ForumSubscription }
): ForumSubscription | undefined {
  if (!target) {
    return undefined;
  }

  if ("forumName" in target && typeof target.forumName === "string") {
    return target;
  }

  if ("forum" in target && target.forum?.forumName) {
    return target.forum;
  }

  return undefined;
}

function createTreeViewLoadingController(
  view: vscode.TreeView<vscode.TreeItem>,
  provider: LoadableTreeProvider,
  message: string
): TreeViewLoadingController {
  let timer: NodeJS.Timeout | undefined;
  let activeRuns = 0;

  const setLoading = (loading: boolean, currentMessage?: string): void => {
    provider.setLoading(loading);
    view.message = loading ? currentMessage : undefined;
  };

  const stopLoading = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }

    if (activeRuns > 0) {
      return;
    }

    setLoading(false);
  };

  const startLoading = (): void => {
    if (!view.visible || activeRuns > 0) {
      return;
    }

    if (timer) {
      clearTimeout(timer);
    }

    setLoading(true, message);
    timer = setTimeout(() => {
      if (activeRuns === 0) {
        setLoading(false);
      }
      timer = undefined;
    }, 80);
  };

  startLoading();

  const visibilityDisposable = view.onDidChangeVisibility(() => {
    if (view.visible) {
      startLoading();
      return;
    }

    stopLoading();
  });

  return {
    async run<T>(currentMessage: string, task: () => Promise<T>): Promise<T> {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }

      activeRuns += 1;
      setLoading(true, currentMessage);

      try {
        return await task();
      } finally {
        activeRuns = Math.max(0, activeRuns - 1);
        if (activeRuns === 0) {
          setLoading(false);
        }
      }
    },
    dispose(): void {
      visibilityDisposable.dispose();
      stopLoading();
    }
  };
}

function buildTiebaStatusBarText(snapshot: TiebaStatusSnapshot): string {
  const authLabel = snapshot.hasBduss ? "已登录" : "匿名";
  const sourceLabel =
    snapshot.lastResolvedSource === "aiotieba"
      ? "aiotieba"
      : snapshot.lastResolvedSource === "web"
        ? "网页回退"
        : "未诊断";
  const icon =
    snapshot.lastResolvedSource === "aiotieba"
      ? "$(check)"
      : snapshot.lastResolvedSource === "web"
        ? "$(warning)"
        : "$(circle-outline)";

  return `${icon} Tieba ${authLabel} · ${sourceLabel}`;
}

function buildTiebaStatusBarTooltip(snapshot: TiebaStatusSnapshot): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString(undefined, true);
  markdown.isTrusted = true;
  markdown.appendMarkdown("**Tieba 当前状态**\n\n");
  markdown.appendMarkdown(`- 账号：${snapshot.hasBduss ? "已配置 BDUSS" : "未配置 BDUSS"}\n`);
  markdown.appendMarkdown(`- STOKEN：${snapshot.hasStoken ? "已配置" : "未配置"}\n`);
  markdown.appendMarkdown(`- Cookie：${snapshot.hasCookie ? "已配置" : "未配置"}\n`);
  markdown.appendMarkdown(
    `- 当前数据源：${snapshot.lastResolvedSource === "aiotieba" ? "aiotieba" : snapshot.lastResolvedSource === "web" ? "网页回退" : "尚未产生读取记录"}\n`
  );
  if (snapshot.lastFailure) {
    markdown.appendMarkdown(`- 最近失败：${snapshot.lastFailure.message}\n`);
  }
  markdown.appendMarkdown("\n点击打开环境诊断。");
  return markdown;
}

async function openThreadFromInput(threadPanels: ThreadPanelManager): Promise<void> {
  const value = await vscode.window.showInputBox({
    title: "浏览指定链接",
    prompt: "输入帖子链接或帖子 ID，然后在 Tieba Webview 中打开。",
    placeHolder: "例如：https://tieba.baidu.com/p/123456789?pn=2 或 123456789",
    ignoreFocusOut: true,
    validateInput: (input) => {
      if (!input.trim()) {
        return undefined;
      }

      return parseThreadLocation(input) ? undefined : "请输入有效的帖子链接或纯数字帖子 ID。";
    }
  });

  if (!value?.trim()) {
    return;
  }

  const parsed = parseThreadLocation(value);
  if (!parsed) {
    void vscode.window.showErrorMessage("帖子链接格式不正确。");
    return;
  }

  await threadPanels.open(
    {
      threadId: parsed.threadId,
      forumName: "贴吧",
      title: `帖子 ${parsed.threadId}`,
      authorName: "Tieba",
      replyCount: 0,
      url: parsed.url
    },
    {
      page: parsed.page
    }
  );
}

function parseThreadLocation(input: string): { threadId: string; page: number; url: string } | undefined {
  const trimmed = input.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^\d+$/.test(trimmed)) {
    return {
      threadId: trimmed,
      page: 1,
      url: `https://tieba.baidu.com/p/${trimmed}`
    };
  }

  const threadMatch = trimmed.match(/\/p\/(\d+)/i);
  if (!threadMatch) {
    return undefined;
  }

  const threadId = threadMatch[1];
  let page = 1;

  try {
    const url = new URL(trimmed);
    const pn = url.searchParams.get("pn");
    const parsedPage = pn ? Number.parseInt(pn, 10) : Number.NaN;
    if (Number.isFinite(parsedPage) && parsedPage > 0) {
      page = parsedPage;
    }

    return {
      threadId,
      page,
      url: url.toString()
    };
  } catch {
    const pnMatch = trimmed.match(/[?&]pn=(\d+)/i);
    const parsedPage = pnMatch?.[1] ? Number.parseInt(pnMatch[1], 10) : Number.NaN;
    if (Number.isFinite(parsedPage) && parsedPage > 0) {
      page = parsedPage;
    }

    return {
      threadId,
      page,
      url: trimmed
    };
  }
}

interface ForumSuggestionQuickPickItem extends vscode.QuickPickItem {
  forumName?: string;
}

async function pickForumName(service: TiebaService): Promise<string | undefined> {
  return new Promise((resolve) => {
    const quickPick = vscode.window.createQuickPick<ForumSuggestionQuickPickItem>();
    let settled = false;
    let requestId = 0;
    let debounceTimer: NodeJS.Timeout | undefined;

    const finish = (value?: string): void => {
      if (settled) {
        return;
      }

      settled = true;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      quickPick.dispose();
      resolve(value);
    };

    const updateItems = async (): Promise<void> => {
      const query = quickPick.value.trim();
      const currentRequestId = ++requestId;
      quickPick.busy = true;

      const suggestions = query ? await service.searchForumSuggestions(query) : service.listForumSuggestions();
      if (settled || currentRequestId !== requestId) {
        return;
      }

      quickPick.items = buildForumSuggestionItems(query, suggestions);
      quickPick.busy = false;
    };

    const scheduleUpdate = (): void => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        void updateItems();
      }, 180);
    };

    quickPick.title = "添加贴吧";
    quickPick.placeholder = "输入吧名，例如：原神";
    quickPick.matchOnDescription = true;
    quickPick.ignoreFocusOut = true;

    quickPick.onDidChangeValue(() => {
      scheduleUpdate();
    });

    quickPick.onDidAccept(() => {
      const selected = quickPick.selectedItems[0];
      const value = selected?.forumName ?? quickPick.value.trim();
      finish(value || undefined);
    });

    quickPick.onDidHide(() => {
      finish(undefined);
    });

    void updateItems();
    quickPick.show();
  });
}

function buildForumSuggestionItems(
  query: string,
  suggestions: ForumNameSuggestion[]
): ForumSuggestionQuickPickItem[] {
  const items: ForumSuggestionQuickPickItem[] = [];
  const normalizedQuery = query.trim();
  const seen = new Set<string>();

  if (normalizedQuery) {
    items.push({
      label: `添加 "${normalizedQuery}"`,
      description: "直接添加",
      forumName: normalizedQuery
    });
    seen.add(normalizedQuery);
  }

  for (const suggestion of suggestions) {
    if (seen.has(suggestion.forumName)) {
      continue;
    }

    seen.add(suggestion.forumName);
    items.push({
      label: suggestion.forumName,
      description: suggestion.hint,
      forumName: suggestion.forumName
    });
  }

  if (items.length > 0) {
    return items;
  }

  return [
    {
      label: "没有联想到可用吧名",
      description: normalizedQuery ? "直接回车也可以按当前输入添加" : "输入吧名开始联想"
    }
  ];
}
