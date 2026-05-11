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
    const summary = this.buildSummary(followedForumsCount, readingSession);
    const primaryActions = this.buildPrimaryActions(followedForumsCount, readingSession);
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
      <h1>开始看贴吧</h1>
      <strong>${this.escapeHtml(summary.title)}</strong>
      <p class="subtle">${this.escapeHtml(summary.description)}</p>
    </section>

    <h2>下一步</h2>
    <div class="actions">
      ${primaryActions.map((action, index) => this.renderActionCard(action, index === 0)).join("")}
    </div>
    ${
      secondaryActions.length > 0
        ? `<h2>可选</h2>
    <div class="secondary-actions">
      ${secondaryActions.map((action) => this.renderSecondaryAction(action)).join("")}
    </div>`
        : ""
    }

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
    followedForumsCount: number,
    readingSession?: ReadingSession
  ): OnboardingSummary {
    if (readingSession) {
      return {
        title: "可以继续上次看到的位置。",
        description: `最近停在“${readingSession.thread.title}”第 ${readingSession.page} 页${readingSession.onlyLz ? "，只看楼主" : ""}。`
      };
    }

    if (followedForumsCount === 0) {
      return {
        title: "先看起来，不需要先登录。",
        description: "输入一个吧名，或者粘贴帖子链接，就能开始第一次阅读。账号同步和增强组件都可以后面再补。"
      };
    }

    return {
      title: "内容入口已经准备好。",
      description: "日常直接从左侧点一个吧、最近、收藏或历史进入；遇到问题再打开检查页。"
    };
  }

  private buildPrimaryActions(
    followedForumsCount: number,
    readingSession?: ReadingSession
  ): OnboardingAction[] {
    const actions: OnboardingAction[] = [];

    if (readingSession) {
      actions.push({
        id: "continueReading",
        label: "继续阅读",
        description: `回到“${readingSession.thread.title}”第 ${readingSession.page} 页。`,
        command: "tieba.continueReading"
      });
    }

    actions.push({
      id: "quickStart",
      label: readingSession ? "换个内容看" : followedForumsCount > 0 ? "打开内容入口" : "开始看帖",
      description: followedForumsCount > 0
        ? "从已有贴吧继续看，也可以再添加一个吧。"
        : "输入吧名或粘贴帖子链接，不需要先登录。",
      command: "tieba.quickStart"
    });

    actions.push({
      id: "openThreadByUrl",
      label: "粘贴帖子链接",
      description: "有帖子链接或帖子 ID 时，直接打开。",
      command: "tieba.openThreadByUrl"
    });

    return this.dedupeActions(actions).slice(0, 3);
  }

  private buildSecondaryActions(
    report: TiebaDiagnosticsReport,
    followedForumsCount: number,
    readingSession?: ReadingSession
  ): OnboardingAction[] {
    const actions: OnboardingAction[] = [];

    if (report.hasStoken) {
      actions.push({
        id: "syncFollowedForums",
        label: "导入我关注的贴吧",
        description: "把账号里的关注吧放到左侧",
        command: "tieba.syncFollowedForums"
      });
    } else {
      actions.push({
        id: "configureAccount",
        label: "登录后导入关注吧",
        description: "只看帖可以跳过",
        command: "tieba.configureAccount"
      });
    }

    if (!report.bridge.available) {
      actions.push({
        id: "installEnhancement",
        label: "提升阅读稳定性",
        description: "可选增强，不影响先试用",
        command: report.bridge.pythonAvailable ? "tieba.installAiotieba" : "tieba.openDiagnostics"
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

    actions.push({
      id: "openDiagnostics",
      label: "检查问题",
      description: "",
      command: "tieba.openDiagnostics"
    });

    return this.dedupeActions(actions);
  }

  private buildStatusItems(report: TiebaDiagnosticsReport, readingSession?: ReadingSession): OnboardingStatusItem[] {
    const human = getTiebaHumanStatus(report);

    return [
      {
        label: "看帖",
        value: human.readingLabel,
        description: human.readingDescription
      },
      {
        label: "关注吧同步",
        value: human.syncLabel,
        description: human.syncDescription
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
      return "日常用法：继续阅读回到上次位置；要换内容时，点“换个内容看”或直接从左侧进入。";
    }

    if (followedForumsCount === 0) {
      return report.hasStoken
        ? "最快的开始方式：导入关注吧或输入一个吧名，然后从左侧点开帖子。"
        : "最快的开始方式：输入吧名或粘贴帖子链接。登录和增强组件都不是第一次看帖的前置条件。";
    }

    if (!report.bridge.available) {
      return "现在已经可以看帖；觉得不稳定时，再点“提升阅读稳定性”或“检查问题”。";
    }

    if (!report.hasBduss) {
      return "不登录也能先读。需要导入账号关注列表时，再使用“登录后导入关注吧”。";
    }

    if (!report.hasStoken) {
      return "你现在已经能看帖；如果同步关注吧失败，就再导入一次完整 Cookie。";
    }

    return "首页只保留最常用动作。日常使用时，直接从左侧关注吧、最近、收藏和历史进入。";
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

  private renderActionCard(action: OnboardingAction, featured = false): string {
    return `<a class="action-card${featured ? " is-primary" : ""}" href="${this.commandUri(action.command)}">
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
