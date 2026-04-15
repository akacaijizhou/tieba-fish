import * as vscode from "vscode";
import { ReadingSession, TiebaSettings } from "../models/tieba";
import { TiebaDiagnosticsReport, TiebaService } from "../services/tiebaService";
import { getTiebaHumanStatus } from "../statusPresentation";
import { renderStaticThemedWebviewPage } from "./themedWebview";

interface OnboardingPanelOpenOptions {
  preserveFocus?: boolean;
}

interface OnboardingSummary {
  title: string;
  description: string;
}

interface OnboardingAction {
  id: string;
  label: string;
  description: string;
  command: string;
}

interface OnboardingStatusItem {
  label: string;
  value: string;
  description: string;
}

export class OnboardingPanel {
  private panel?: vscode.WebviewPanel;

  constructor(private readonly context: vscode.ExtensionContext, private readonly service: TiebaService) {
    this.context.subscriptions.push(
      this.service.onDidChange(() => {
        void this.render();
      }),
      this.service.onDidChangeStatus(() => {
        void this.render();
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("tieba")) {
          void this.render();
        }
      })
    );
  }

  async open(options: OnboardingPanelOpenOptions = {}): Promise<void> {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Active, options.preserveFocus);
      await this.render();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "tiebaOnboarding",
      "Tieba 首页",
      {
        viewColumn: vscode.ViewColumn.Active,
        preserveFocus: options.preserveFocus
      },
      {
        enableScripts: false,
        enableCommandUris: true
      }
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    await this.render();
  }

  private async render(): Promise<void> {
    if (!this.panel) {
      return;
    }

    const report = await this.service.getDiagnosticsReport();
    const followedForumsCount = this.service.listForums().length;
    const readingSession = this.service.getReadingSession();
    this.panel.webview.html = this.getHtml(
      this.panel.webview,
      this.service.getSettings(),
      report,
      followedForumsCount,
      readingSession
    );
  }

  private getHtml(
    webview: vscode.Webview,
    settings: TiebaSettings,
    report: TiebaDiagnosticsReport,
    followedForumsCount: number,
    readingSession?: ReadingSession
  ): string {
    const summary = this.buildSummary(report, followedForumsCount, readingSession);
    const primaryActions = this.buildPrimaryActions(report, followedForumsCount, readingSession);
    const secondaryActions = this.buildSecondaryActions(report, followedForumsCount, readingSession);
    const statusItems = this.buildStatusItems(report, readingSession);
    const quickStart = this.buildQuickStartLine(report, followedForumsCount, readingSession);

    return renderStaticThemedWebviewPage({
      context: this.context,
      webview,
      title: "Tieba 首页",
      settings,
      pageId: "onboarding",
      body: `
    <section class="hero">
      <h1>Tieba 首页</h1>
      <strong>${this.escapeHtml(summary.title)}</strong>
      <p class="subtle">${this.escapeHtml(summary.description)}</p>
    </section>

    <h2>常用入口</h2>
    <div class="actions">
      ${primaryActions.map((action) => this.renderActionCard(action)).join("")}
    </div>
    <div class="secondary-actions">
      ${secondaryActions.map((action) => this.renderSecondaryAction(action)).join("")}
    </div>

    <h2>当前状态</h2>
    <div class="status-grid">
      ${statusItems.map((item) => this.renderStatusCard(item)).join("")}
    </div>

    <p class="quick-start subtle">
      ${this.escapeHtml(quickStart)}
    </p>
      `
    });
  }

  private buildSummary(
    report: TiebaDiagnosticsReport,
    followedForumsCount: number,
    readingSession?: ReadingSession
  ): OnboardingSummary {
    if (readingSession) {
      return {
        title: "可以直接继续上次阅读。",
        description: `最近停在“${readingSession.thread.title}”第 ${readingSession.page} 页${readingSession.onlyLz ? " · 只看楼主" : ""}。`
      };
    }

    if (followedForumsCount === 0) {
      if (!report.hasBduss) {
        return {
          title: "先试读，再决定要不要补环境。",
          description: "你可以先添加一个吧，或者直接打开帖子链接；登录态和 aiotieba 都可以后补。"
        };
      }

      if (!report.hasStoken) {
        return {
          title: "已经能看帖了，后面再补完整 Cookie。",
          description: "现在先把常看的内容加进来；如果想同步关注吧，再补上 STOKEN。"
        };
      }

      return {
        title: "下一步把内容加进来。",
        description: "你可以先同步关注吧，也可以手动添加一个吧开始看。"
      };
    }

    if (!report.bridge.pythonAvailable) {
      return {
        title: "可以直接开始看了。",
        description: "当前还能先走网页回退；等你想要更稳的结构化阅读时，再补 Python 和 aiotieba。"
      };
    }

    if (!report.bridge.available) {
      return {
        title: "内容入口已经有了，按需再补 aiotieba。",
        description: "现在就能继续阅读；装好后结构化链路会更稳，楼中楼能力也更完整。"
      };
    }

    if (!report.hasBduss) {
      return {
        title: "可以直接开始用了。",
        description: "匿名也能先看；如果你想同步关注吧或提高稳定性，再导入登录态。"
      };
    }

    if (!report.hasStoken) {
      return {
        title: "现在能看帖，补齐完整 Cookie 后会更完整。",
        description: "补上 STOKEN 后，就能同步贴吧账号里的关注吧。"
      };
    }

    return {
      title: "可以直接开始用了。",
      description: "常用入口已经收在下面，需要时再去命令面板找其他动作。"
    };
  }

  private buildPrimaryActions(
    report: TiebaDiagnosticsReport,
    followedForumsCount: number,
    readingSession?: ReadingSession
  ): OnboardingAction[] {
    const actions: OnboardingAction[] = [];

    if (readingSession) {
      actions.push({
        id: "continueReading",
        label: "继续阅读",
        description: `继续打开“${readingSession.thread.title}”${readingSession.onlyLz ? "，并恢复只看楼主" : ""}。`,
        command: "tieba.continueReading"
      });
    }

    if (followedForumsCount === 0) {
      actions.push({
        id: "addForum",
        label: "添加贴吧",
        description: "先加一个吧，马上就能开始看。",
        command: "tieba.addForum"
      });

      actions.push({
        id: "openThreadByUrl",
        label: "浏览指定链接",
        description: "有帖子链接或帖子 ID 时可直接打开。",
        command: "tieba.openThreadByUrl"
      });

      if (report.hasStoken) {
        actions.push({
          id: "syncFollowedForums",
          label: "同步关注吧",
          description: "把贴吧账号里已关注的吧一次性导进来。",
          command: "tieba.syncFollowedForums"
        });
      }
    } else {
      actions.push({
        id: "openThreadByUrl",
        label: "浏览指定链接",
        description: "直接输入帖子链接或帖子 ID 打开。",
        command: "tieba.openThreadByUrl"
      });
    }

    if (!report.hasBduss) {
      actions.push({
        id: "configureAccount",
        label: "导入登录态",
        description: "想提高稳定性或同步关注吧时，再粘贴完整贴吧 Cookie。",
        command: "tieba.configureAccount"
      });
    } else if (!report.hasStoken) {
      actions.push({
        id: "completeCookie",
        label: "补齐完整 Cookie",
        description: "补上 STOKEN 后，就能同步我关注的贴吧。",
        command: "tieba.configureAccount"
      });
    }

    if (!report.bridge.available) {
      actions.push({
        id: report.bridge.pythonAvailable ? "installAiotieba" : "downloadPython",
        label: report.bridge.pythonAvailable ? "安装 aiotieba" : "下载 Python",
        description: report.bridge.pythonAvailable
          ? "按需补上结构化阅读主路径。"
          : "想补 aiotieba 时，先把 Python 运行环境装好。",
        command: report.bridge.pythonAvailable ? "tieba.installAiotieba" : "tieba.openPythonDownload"
      });
    }

    if (followedForumsCount > 0 || readingSession || report.hasBduss || report.bridge.available) {
      actions.push({
        id: "openDiagnostics",
        label: "打开环境诊断",
        description: "需要排查时再看细节，不用先翻设置。",
        command: "tieba.openDiagnostics"
      });
    }

    return this.dedupeActions(actions).slice(0, 4);
  }

  private buildSecondaryActions(
    report: TiebaDiagnosticsReport,
    followedForumsCount: number,
    readingSession?: ReadingSession
  ): OnboardingAction[] {
    const actions: OnboardingAction[] = [];

    if (!report.bridge.pythonAvailable) {
      actions.push({
        id: "recheckPython",
        label: "我已装好，重新检测",
        description: "",
        command: "tieba.openOnboarding"
      });
    }

    if (followedForumsCount > 0 && !readingSession) {
      actions.push({
        id: "addForumSecondary",
        label: "再添加一个贴吧",
        description: "",
        command: "tieba.addForum"
      });
    }

    if (!this.buildPrimaryActions(report, followedForumsCount, readingSession).some((action) => action.id === "openDiagnostics")) {
      actions.push({
        id: "openDiagnosticsSecondary",
        label: "环境诊断",
        description: "",
        command: "tieba.openDiagnostics"
      });
    }

    return this.dedupeActions(actions);
  }

  private buildStatusItems(report: TiebaDiagnosticsReport, readingSession?: ReadingSession): OnboardingStatusItem[] {
    const human = getTiebaHumanStatus(report);

    return [
      {
        label: "阅读",
        value: human.readingLabel,
        description: human.readingDescription
      },
      {
        label: "同步关注吧",
        value: human.syncLabel,
        description: human.syncDescription
      },
      {
        label: "当前链路",
        value: human.sourceLabel,
        description: human.sourceDescription
      },
      {
        label: "最近阅读",
        value: readingSession ? `第 ${readingSession.page} 页${readingSession.onlyLz ? " · 只看楼主" : ""}` : "还没有记录",
        description: readingSession
          ? `最近停在“${readingSession.thread.title}”。`
          : "打开一个帖子后，这里会出现继续阅读入口。"
      }
    ];
  }

  private buildQuickStartLine(
    report: TiebaDiagnosticsReport,
    followedForumsCount: number,
    readingSession?: ReadingSession
  ): string {
    if (readingSession) {
      return "如果只是继续摸鱼，直接点“继续阅读”就行；需要换内容时，再去左侧关注吧或浏览指定链接。";
    }

    if (followedForumsCount === 0) {
      if (!report.hasBduss) {
        return "最快的开始方式是：添加贴吧或浏览指定链接 -> 直接开始看；后面想更稳或想同步关注吧时，再补登录态和 aiotieba。";
      }

      if (!report.hasStoken) {
        return "你现在已经能看帖；下一步先把内容加进来，后面想同步关注吧时再补一次完整 Cookie。";
      }

      return "下一步最直接：同步关注吧，或者先手动添加一个吧，然后从左侧点开开始看。";
    }

    if (!report.bridge.available) {
      return "现在已经可以用了；等你想要更稳的结构化阅读或更完整的楼中楼能力时，再补 Python 和 aiotieba。";
    }

    if (!report.hasBduss) {
      return "匿名也能先读。需要同步关注吧或提高稳定性时，再导入完整贴吧 Cookie。";
    }

    if (!report.hasStoken) {
      return "你现在已经能看帖；如果还想同步关注吧，就再导入一次包含 STOKEN 的完整 Cookie。";
    }

    return "首页只保留最常用动作。日常使用时，直接从左侧关注吧、最近、收藏和历史进入就够了。";
  }

  private dedupeActions(actions: OnboardingAction[]): OnboardingAction[] {
    const result: OnboardingAction[] = [];
    const seen = new Set<string>();

    for (const action of actions) {
      if (seen.has(action.id)) {
        continue;
      }

      seen.add(action.id);
      result.push(action);
    }

    return result;
  }

  private renderActionCard(action: OnboardingAction): string {
    return `<a class="action-card" href="${this.commandUri(action.command)}">
      <span class="action-title">${this.escapeHtml(action.label)}</span>
      <span class="action-description">${this.escapeHtml(action.description)}</span>
    </a>`;
  }

  private renderSecondaryAction(action: OnboardingAction): string {
    return `<a href="${this.commandUri(action.command)}">${this.escapeHtml(action.label)}</a>`;
  }

  private renderStatusCard(item: OnboardingStatusItem): string {
    return `<section class="status-card">
      <span class="status-label">${this.escapeHtml(item.label)}</span>
      <span class="status-value">${this.escapeHtml(item.value)}</span>
      <span>${this.escapeHtml(item.description)}</span>
    </section>`;
  }

  private commandUri(command: string): string {
    return vscode.Uri.parse(`command:${command}`).toString();
  }

  private escapeHtml(input: string): string {
    return input
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}
