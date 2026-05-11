import * as vscode from "vscode";
import {
  ForumSubscription,
  ThreadSummary,
  TiebaThemePreset
} from "./models/tieba";
import { TiebaError } from "./services/errors";
import { ForumNameSuggestion, TiebaService } from "./services/tiebaService";
import { getTiebaHumanStatus } from "./statusPresentation";
import { STORAGE_KEYS } from "./storage/storageKeys";
import {
  getThemePresetOption,
  THEME_PRESET_OPTIONS
} from "./theme/themeRegistry";
import { BossFilesProvider } from "./views/bossFilesProvider";
import { BossModeManager } from "./views/bossModeManager";
import { DiagnosticsPanel } from "./views/diagnosticsPanel";
import { FavoritesViewProvider } from "./views/favoritesViewProvider";
import { FollowedForumsProvider } from "./views/followedForumsProvider";
import { ForumPanelManager } from "./views/forumPanel";
import { HistoryViewProvider } from "./views/historyViewProvider";
import { LatestViewProvider } from "./views/latestViewProvider";
import { OnboardingPanel } from "./views/onboardingPanel";
import { ShortcutHelpPanel } from "./views/shortcutHelpPanel";
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
  const favoritesViewProvider = new FavoritesViewProvider(service);
  const historyViewProvider = new HistoryViewProvider(service);
  const forumPanels = new ForumPanelManager(context, service);
  const threadPanels = new ThreadPanelManager(context, service);
  const bossFilesProvider = new BossFilesProvider(vscode.Uri.joinPath(context.extensionUri, "client-dashboard"));
  const bossMode = new BossModeManager(context, forumPanels, threadPanels);
  const diagnosticsPanel = new DiagnosticsPanel(context, service);
  const onboardingPanel = new OnboardingPanel(context, service);
  const shortcutHelpPanel = new ShortcutHelpPanel(context, service);
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
  const themePresetStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 9);
  statusBarItem.command = "tieba.openDiagnostics";
  statusBarItem.name = "Tieba 状态";
  themePresetStatusBarItem.command = "tieba.selectThemePreset";
  themePresetStatusBarItem.name = "Tieba 主题";
  statusBarItem.show();
  themePresetStatusBarItem.show();
  context.subscriptions.push(statusBarItem, themePresetStatusBarItem);

  void vscode.commands.executeCommand("setContext", "tieba.bossModeEnabled", false);

  const refreshStatusBar = async (): Promise<void> => {
    const report = await service.getDiagnosticsReport();
    statusBarItem.text = buildTiebaStatusBarText(report);
    statusBarItem.tooltip = buildTiebaStatusBarTooltip(report);
    const settings = service.getSettings();
    themePresetStatusBarItem.text = `$(symbol-color) 主题: ${getThemePresetOption(settings.themePreset).label}`;
    themePresetStatusBarItem.tooltip = `当前主题：${getThemePresetOption(settings.themePreset).label}\n点击切换主题预设。`;
  };

  const openOnboarding = async (preserveFocus = false): Promise<void> => {
    await context.globalState.update(STORAGE_KEYS.onboardingSeen, true);
    await context.globalState.update(STORAGE_KEYS.onboardingForceNextOpen, false);
    await onboardingPanel.open({ preserveFocus });
  };

  let readingEnhancementAutoInstallInFlight = false;
  let pythonInstallPromptInFlight = false;
  let pythonInstallPromptDismissedThisSession = false;
  const maybeAutoInstallReadingEnhancement = async (): Promise<void> => {
    if (readingEnhancementAutoInstallInFlight) {
      return;
    }

    const shouldAutoInstall = vscode.workspace
      .getConfiguration("tieba")
      .get<boolean>("autoInstallEnhancement", true);
    if (!shouldAutoInstall) {
      return;
    }

    let attemptedInstallKey: string | undefined;
    readingEnhancementAutoInstallInFlight = true;
    try {
      const diagnostics = await service.getDiagnosticsReport();
      if (diagnostics.bridge.available) {
        await context.globalState.update(STORAGE_KEYS.aiotiebaAutoInstallAttempted, true);
        return;
      }

      if (!diagnostics.bridge.canInstallAiotieba) {
        return;
      }

      const attemptKey = buildReadingEnhancementAutoInstallAttemptKey(diagnostics);
      if (
        context.globalState.get<string>(STORAGE_KEYS.aiotiebaAutoInstallAttemptKey, "") === attemptKey
      ) {
        return;
      }

      attemptedInstallKey = attemptKey;
      await context.globalState.update(STORAGE_KEYS.aiotiebaAutoInstallAttempted, true);
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "正在安装 Tieba Fish 阅读增强组件",
          cancellable: false
        },
        () => service.installAiotiebaPackage()
      );

      await context.globalState.update(STORAGE_KEYS.aiotiebaAutoInstallAttemptKey, undefined);
      void vscode.window.showInformationMessage("阅读增强组件已自动安装完成。后续看帖会更稳定。");
      await refreshStatusBar();
    } catch (error) {
      if (attemptedInstallKey) {
        await context.globalState.update(STORAGE_KEYS.aiotiebaAutoInstallAttemptKey, attemptedInstallKey);
      }
      const message = error instanceof Error ? error.message : "阅读增强组件自动安装失败。";
      const action = await vscode.window.showWarningMessage(
        `${message} 不影响先用基础模式看帖。`,
        "检查问题",
        "稍后"
      );
      if (action === "检查问题") {
        await vscode.commands.executeCommand("tieba.openDiagnostics");
      }
    } finally {
      readingEnhancementAutoInstallInFlight = false;
    }
  };

  const maybePromptPythonInstall = async (): Promise<void> => {
    if (pythonInstallPromptInFlight) {
      return;
    }

    const shouldPrompt = vscode.workspace
      .getConfiguration("tieba")
      .get<boolean>("autoInstallPython", true);
    if (!shouldPrompt) {
      return;
    }

    if (pythonInstallPromptDismissedThisSession) {
      return;
    }

    pythonInstallPromptInFlight = true;
    try {
      const diagnostics = await service.getDiagnosticsReport();
      if (diagnostics.bridge.pythonAvailable) {
        return;
      }

      const action = await vscode.window.showInformationMessage(
        "Tieba Fish 没检测到 Python。可以先用基础模式；安装 Python 后会自动补齐阅读增强组件。",
        "安装 Python",
        "下载页",
        "稍后"
      );

      if (action === "安装 Python") {
        await vscode.commands.executeCommand("tieba.installPython");
        return;
      }

      if (action === "下载页") {
        pythonInstallPromptDismissedThisSession = true;
        await vscode.commands.executeCommand("tieba.openPythonDownload");
        return;
      }

      pythonInstallPromptDismissedThisSession = true;
    } finally {
      pythonInstallPromptInFlight = false;
    }
  };

  void refreshStatusBar();
  void maybeAutoInstallReadingEnhancement();
  void maybePromptPythonInstall();

  const followedForumsView = vscode.window.createTreeView("tieba.forums", {
    treeDataProvider: followedForumsProvider
  });
  const latestView = vscode.window.createTreeView("tieba.latest", {
    treeDataProvider: latestViewProvider
  });
  const favoritesView = vscode.window.createTreeView("tieba.favorites", {
    treeDataProvider: favoritesViewProvider
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
    favoritesView,
    historyView,
    bossFilesView,
  );

  let onboardingAutoOpenHandled = false;
  const maybeAutoOpenOnboarding = async (): Promise<void> => {
    if (onboardingAutoOpenHandled) {
      return;
    }

    if (!followedForumsView.visible && !latestView.visible && !favoritesView.visible && !historyView.visible) {
      return;
    }

    onboardingAutoOpenHandled = true;
    const alreadySeen = context.globalState.get<boolean>(STORAGE_KEYS.onboardingSeen, false);
    const forceNextOpen = context.globalState.get<boolean>(STORAGE_KEYS.onboardingForceNextOpen, false);
    if (forceNextOpen) {
      await openOnboarding(false);
      return;
    }

    if (alreadySeen) {
      return;
    }

    const diagnostics = await service.getDiagnosticsReport();
    if (!shouldAutoOpenOnboarding(service, diagnostics)) {
      await context.globalState.update(STORAGE_KEYS.onboardingSeen, true);
      return;
    }

    await openOnboarding(false);
  };

  const followedForumsLoading = createTreeViewLoadingController(
    followedForumsView,
    followedForumsProvider,
    "正在加载关注吧..."
  );
  const latestViewLoading = createTreeViewLoadingController(latestView, latestViewProvider, "正在加载最近列表...");
  const historyViewLoading = createTreeViewLoadingController(historyView, historyViewProvider, "正在加载历史...");

  context.subscriptions.push(followedForumsLoading, latestViewLoading, historyViewLoading);
  context.subscriptions.push(
    followedForumsView.onDidChangeVisibility(() => {
      void maybeAutoOpenOnboarding();
    }),
    latestView.onDidChangeVisibility(() => {
      void maybeAutoOpenOnboarding();
    }),
    favoritesView.onDidChangeVisibility(() => {
      void maybeAutoOpenOnboarding();
    }),
    historyView.onDidChangeVisibility(() => {
      void maybeAutoOpenOnboarding();
    })
  );

  void maybeAutoOpenOnboarding();

  context.subscriptions.push(
    service.onDidChange(() => {
      followedForumsProvider.refresh();
      latestViewProvider.refresh();
      favoritesViewProvider.refresh();
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
        forumPanels.broadcastSettings();
        threadPanels.broadcastSettings();
        void refreshStatusBar();
      }

      if (event.affectsConfiguration("tieba.pythonPath") || event.affectsConfiguration("tieba.autoInstallEnhancement")) {
        void maybeAutoInstallReadingEnhancement();
      }

      if (event.affectsConfiguration("tieba.pythonPath") || event.affectsConfiguration("tieba.autoInstallPython")) {
        void maybePromptPythonInstall();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("tieba.quickStart", async () => {
      await runQuickStart(service);
    }),

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
            title: "正在导入我关注的贴吧",
            cancellable: false
          },
          () => service.syncFollowedForums()
        );

        if (result.total === 0) {
          void vscode.window.showInformationMessage("贴吧账号里还没有可导入的关注吧。");
          return;
        }

        void vscode.window.showInformationMessage(
          `导入完成：新增 ${result.added} 个，已存在 ${result.existing} 个。`
        );
      } catch (error) {
        const normalized =
          error instanceof TiebaError ? error : new TiebaError("unknown", error instanceof Error ? error.message : "同步失败。");
        if (normalized.code === "auth") {
          const action = await vscode.window.showErrorMessage(normalized.message, "去导入登录");
          if (action === "去导入登录") {
            await vscode.commands.executeCommand("tieba.configureAccount");
          }
          return;
        }

        void vscode.window.showErrorMessage(normalized.message);
      }
    }),

    vscode.commands.registerCommand("tieba.configureAccount", async (): Promise<boolean> => {
      const hasLoginState = await service.hasLoginState();
      const primaryInput = await vscode.window.showInputBox({
        title: "导入贴吧登录",
        prompt: hasLoginState
          ? "粘贴新的完整贴吧 Cookie。只看帖可以跳过这步；想同步关注吧时再导入即可。"
          : "只看帖可以先跳过。想同步账号里的关注吧时，粘贴从浏览器复制的完整贴吧 Cookie。",
        placeHolder: "粘贴浏览器请求里的 Cookie 内容",
        password: true,
        ignoreFocusOut: true,
        validateInput: (input) => validateLoginStateInput(input)
      });

      if (!primaryInput?.trim()) {
        return false;
      }

      const imported = parseImportedLoginState(primaryInput);
      if (!imported) {
        void vscode.window.showErrorMessage("没有识别到有效登录信息。建议直接粘贴从浏览器复制的完整 Cookie。");
        return false;
      }

      await service.saveImportedLoginState(imported);
      void vscode.window.showInformationMessage(buildImportedLoginStateMessage(imported));
      return true;
    }),

    vscode.commands.registerCommand("tieba.clearAccount", async () => {
      const hasLoginState = await service.hasLoginState();
      if (!hasLoginState) {
        void vscode.window.showInformationMessage("当前还没有导入贴吧登录。");
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        "清除本地保存的贴吧登录？清除后将回到未登录状态。",
        { modal: true },
        "清除"
      );

      if (confirm !== "清除") {
        return;
      }

      await service.clearLoginState();
      void vscode.window.showInformationMessage("贴吧登录已清除。");
    }),

    vscode.commands.registerCommand("tieba.configureCookie", async () => {
      const hasCookie = await service.hasCookie();
      const value = await vscode.window.showInputBox({
        title: "配置贴吧 Cookie",
        prompt: hasCookie
          ? "粘贴新的贴吧 Cookie。保存后会覆盖旧值并清理缓存。"
          : "粘贴从浏览器复制的完整贴吧 Cookie。",
        placeHolder: "粘贴浏览器请求里的 Cookie 内容",
        password: true,
        ignoreFocusOut: true,
        validateInput: (input) => validateCookieInput(input)
      });

      if (!value?.trim()) {
        return;
      }

      await service.saveCookie(value.trim());
      void vscode.window.showInformationMessage(
        "贴吧 Cookie 已保存到 VS Code Secret Storage。后续请求会自动带上登录信息。"
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
        await latestViewLoading.run("正在刷新最近列表...", () => service.refreshLatestThreads(true));
      } catch (error) {
        const message = error instanceof Error ? error.message : "刷新最近列表失败。";
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

    vscode.commands.registerCommand("tieba.continueReading", async () => {
      const session = service.getReadingSession();
      if (!session) {
        void vscode.window.showInformationMessage("还没有可继续的阅读记录。先打开一个帖子看看。");
        return;
      }

      await threadPanels.open(session.thread, {
        page: session.page,
        onlyLz: session.onlyLz,
        lastFullPageBeforeOnlyLz: session.lastFullPageBeforeOnlyLz
      });
    }),

    vscode.commands.registerCommand("tieba.openDiagnostics", async () => {
      await diagnosticsPanel.open();
    }),

    vscode.commands.registerCommand("tieba.openOnboarding", async () => {
      await openOnboarding(false);
    }),

    vscode.commands.registerCommand("tieba.selectThemePreset", async () => {
      const current = service.getSettings().themePreset;
      const picked = await vscode.window.showQuickPick(
        THEME_PRESET_OPTIONS.map((option) => ({
          label: option.label,
          description: option.description,
          detail: option.value === current ? "当前主题" : undefined,
          themePreset: option.value
        })),
        {
          title: "切换主题预设",
          placeHolder: `当前：${getThemePresetOption(current).label}`,
          matchOnDescription: true,
          matchOnDetail: true
        }
      );

      if (!picked?.themePreset || picked.themePreset === current) {
        return;
      }

      await service.updateThemePreset(picked.themePreset);
      forumPanels.broadcastSettings();
      threadPanels.broadcastSettings();
      void refreshStatusBar();
      void vscode.window.showInformationMessage(`主题预设已切换为“${getThemePresetOption(picked.themePreset).label}”。`);
    }),

    vscode.commands.registerCommand("tieba.openShortcutHelp", async () => {
      await shortcutHelpPanel.open();
    }),

    vscode.commands.registerCommand("tieba.installAiotieba", async (): Promise<boolean> => {
      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "正在安装阅读增强组件",
            cancellable: false
          },
          async () => {
            await service.installAiotiebaPackage();
          }
        );

        await context.globalState.update(STORAGE_KEYS.aiotiebaAutoInstallAttempted, true);
        await context.globalState.update(STORAGE_KEYS.aiotiebaAutoInstallAttemptKey, undefined);
        void vscode.window.showInformationMessage("阅读增强组件安装完成。后续看帖会更稳定。");
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "安装阅读增强组件失败。";
        const action = await vscode.window.showErrorMessage(message, "检查问题");
        if (action === "检查问题") {
          await vscode.commands.executeCommand("tieba.openDiagnostics");
        }
        return false;
      }
    }),

    vscode.commands.registerCommand("tieba.installPython", async (): Promise<boolean> => {
      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "正在安装 Python",
            cancellable: false
          },
          async () => {
            await service.installPythonRuntime();
          }
        );

        await context.globalState.update(STORAGE_KEYS.aiotiebaAutoInstallAttempted, false);
        await context.globalState.update(STORAGE_KEYS.aiotiebaAutoInstallAttemptKey, undefined);
        await refreshStatusBar();
        void vscode.window.showInformationMessage("Python 已安装，正在继续检查阅读增强组件。");
        await maybeAutoInstallReadingEnhancement();
        await refreshStatusBar();

        const diagnostics = await service.getDiagnosticsReport();
        if (diagnostics.bridge.available) {
          return true;
        }

        const action = await vscode.window.showInformationMessage(
          "Python 已安装，但阅读增强组件还不可用。可以打开检查页查看原因。",
          "检查问题"
        );
        if (action === "检查问题") {
          await vscode.commands.executeCommand("tieba.openDiagnostics");
        }
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "安装 Python 失败。";
        const action = await vscode.window.showErrorMessage(
          `${message} 可以改用 Python 官网下载安装。`,
          "打开下载页",
          "检查问题"
        );
        if (action === "打开下载页") {
          await vscode.commands.executeCommand("tieba.openPythonDownload");
        }
        if (action === "检查问题") {
          await vscode.commands.executeCommand("tieba.openDiagnostics");
        }
        return false;
      }
    }),

    vscode.commands.registerCommand("tieba.openPythonDownload", async () => {
      await vscode.env.openExternal(vscode.Uri.parse("https://www.python.org/downloads/windows/"));
    }),

    vscode.commands.registerCommand("tieba.resetOnboardingAndReload", async () => {
      const confirm = await vscode.window.showWarningMessage(
        "完全重置 Tieba Fish？这会清空本地保存的贴吧登录、关注吧、收藏、历史、缓存和首页引导状态，然后重载当前窗口。",
        { modal: true },
        "完全重置"
      );

      if (confirm !== "完全重置") {
        return;
      }

      onboardingAutoOpenHandled = false;
      await service.resetAllLocalState();
      await context.globalState.update(STORAGE_KEYS.onboardingSeen, false);
      await context.globalState.update(STORAGE_KEYS.onboardingForceNextOpen, true);
      await context.globalState.update(STORAGE_KEYS.aiotiebaInstallPromptShown, false);
      await context.globalState.update(STORAGE_KEYS.aiotiebaAutoInstallAttempted, false);
      await context.globalState.update(STORAGE_KEYS.aiotiebaAutoInstallAttemptKey, undefined);
      await vscode.commands.executeCommand("workbench.action.reloadWindow");
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
    return "没有识别到有效登录信息。建议直接粘贴从浏览器复制的完整 Cookie。";
  }

  if (/\s/.test(imported.bduss)) {
    return "登录信息里不应包含空白字符。";
  }

  if (imported.bduss.length < 20) {
    return "识别到的登录信息偏短，建议确认是否复制完整。";
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
      ? "贴吧登录已导入。普通阅读可以继续使用；如果同步关注吧失败，再重新导入一次完整 Cookie。"
      : "贴吧登录已导入。普通阅读可以继续使用；同步关注吧可能还需要完整 Cookie。";
  }

  if (imported.cookie) {
    return "贴吧登录已导入。现在可以同步账号里的关注吧。";
  }

  return "贴吧登录已导入。现在可以同步账号里的关注吧。";
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

function buildTiebaStatusBarText(report: Awaited<ReturnType<TiebaService["getDiagnosticsReport"]>>): string {
  const human = getTiebaHumanStatus(report);
  const icon = report.lastFailure ? "$(warning)" : report.hasBduss ? "$(check)" : "$(book)";
  return `${icon} Tieba ${human.readingLabel}`;
}

function buildTiebaStatusBarTooltip(report: Awaited<ReturnType<TiebaService["getDiagnosticsReport"]>>): vscode.MarkdownString {
  const human = getTiebaHumanStatus(report);
  const markdown = new vscode.MarkdownString(undefined, true);
  markdown.isTrusted = true;
  markdown.appendMarkdown("**Tieba 当前状态**\n\n");
  markdown.appendMarkdown(`- 看帖：${human.readingLabel}\n`);
  markdown.appendMarkdown(`- 关注吧同步：${human.syncLabel}\n`);
  markdown.appendMarkdown(`- 阅读模式：${human.sourceLabel}\n`);
  markdown.appendMarkdown(`- 贴吧登录：${human.loginLabel}\n`);
  if (report.lastFailure) {
    markdown.appendMarkdown(`- 最近失败：${report.lastFailure.message}\n`);
  }
  markdown.appendMarkdown("\n点击检查问题。");
  return markdown;
}


function shouldAutoOpenOnboarding(service: TiebaService, diagnostics: Awaited<ReturnType<TiebaService["getDiagnosticsReport"]>>): boolean {
  void diagnostics;
  return service.listForums().length === 0
    && service.listFavorites().length === 0
    && service.listHistory().length === 0
    && !service.getReadingSession();
}

function buildReadingEnhancementAutoInstallAttemptKey(
  diagnostics: Awaited<ReturnType<TiebaService["getDiagnosticsReport"]>>
): string {
  const pythonPath = diagnostics.bridge.pythonPath || "python";
  const pythonVersion = diagnostics.bridge.pythonVersion || "unknown";
  return `${pythonPath}:${pythonVersion}`;
}

interface QuickStartPickItem extends vscode.QuickPickItem {
  command: string;
  args?: unknown[];
  syncAfterLogin?: boolean;
}

async function runQuickStart(service: TiebaService): Promise<void> {
  const readingSession = service.getReadingSession();
  const forums = service.listForums();
  const status = await service.getStatusSnapshot();
  const items: QuickStartPickItem[] = [];

  if (readingSession) {
    items.push({
      label: "继续上次阅读",
      description: `${readingSession.thread.forumName}吧 · 第 ${readingSession.page} 页`,
      detail: readingSession.thread.title,
      command: "tieba.continueReading"
    });
  }

  if (forums.length > 0) {
    items.push({
      label: `打开 ${forums[0].displayName} 吧`,
      description: "从已添加的贴吧继续看",
      command: "tieba.openForum",
      args: [forums[0]]
    });
    items.push({
      label: "再添加一个贴吧",
      description: "输入吧名后加入左侧",
      command: "tieba.addForum"
    });
  } else {
    items.push({
      label: "输入吧名开始看",
      description: "不需要登录，先加一个吧",
      command: "tieba.addForum"
    });
  }

  items.push({
    label: "粘贴帖子链接打开",
    description: "有帖子链接或帖子 ID 时直接打开",
    command: "tieba.openThreadByUrl"
  });

  if (status.hasStoken) {
    items.push({
      label: "导入我关注的贴吧",
      description: "把账号里关注的吧放到左侧",
      command: "tieba.syncFollowedForums"
    });
  } else {
    items.push({
      label: "登录后导入关注吧",
      description: "可选：想同步账号关注列表时再用",
      command: "tieba.configureAccount",
      syncAfterLogin: true
    });
  }

  const picked = await vscode.window.showQuickPick(items, {
    title: "想怎么开始？",
    placeHolder: "推荐：输入吧名开始看，后面再登录也可以",
    matchOnDescription: true,
    matchOnDetail: true,
    ignoreFocusOut: true
  });

  if (!picked) {
    return;
  }

  const result = await vscode.commands.executeCommand<boolean | void>(picked.command, ...(picked.args ?? []));
  if (!picked.syncAfterLogin || !result) {
    return;
  }

  const refreshedStatus = await service.getStatusSnapshot();
  if (!refreshedStatus.hasStoken) {
    return;
  }

  const action = await vscode.window.showInformationMessage("登录已导入。现在把账号里关注的贴吧同步到左侧？", "现在同步", "稍后");
  if (action === "现在同步") {
    await vscode.commands.executeCommand("tieba.syncFollowedForums");
  }
}

async function openThreadFromInput(threadPanels: ThreadPanelManager): Promise<void> {
  const value = await vscode.window.showInputBox({
    title: "粘贴帖子链接",
    prompt: "输入帖子链接或帖子 ID，然后在阅读页打开。",
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
