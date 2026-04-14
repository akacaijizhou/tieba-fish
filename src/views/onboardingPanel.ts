import * as vscode from "vscode";
import { ReadingSession } from "../models/tieba";
import { TiebaDiagnosticsReport, TiebaService } from "../services/tiebaService";
import { getTiebaHumanStatus } from "../statusPresentation";

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
    this.panel.webview.html = this.getHtml(this.panel.webview, report, followedForumsCount, readingSession);
  }

  private getHtml(
    webview: vscode.Webview,
    report: TiebaDiagnosticsReport,
    followedForumsCount: number,
    readingSession?: ReadingSession
  ): string {
    const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline';`;
    const summary = this.buildSummary(report, followedForumsCount, readingSession);
    const primaryActions = this.buildPrimaryActions(report, followedForumsCount, readingSession);
    const secondaryActions = this.buildSecondaryActions(report, followedForumsCount, readingSession);
    const statusItems = this.buildStatusItems(report, readingSession);
    const quickStart = this.buildQuickStartLine(report, followedForumsCount, readingSession);

    return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tieba 首页</title>
    <style>
      :root {
        color-scheme: light dark;
      }
      body {
        margin: 0;
        padding: 24px;
        font: 13px/1.65 var(--vscode-font-family);
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
      }
      h1, h2 {
        margin: 0 0 12px;
        font-weight: 600;
      }
      h2 {
        margin-top: 24px;
        font-size: 15px;
      }
      p {
        margin: 0;
      }
      .subtle {
        color: var(--vscode-descriptionForeground);
      }
      .hero {
        margin-bottom: 20px;
        padding: 16px 18px;
        border: 1px solid var(--vscode-panel-border);
        border-radius: 12px;
        background: color-mix(in srgb, var(--vscode-editor-background) 94%, var(--vscode-focusBorder) 6%);
      }
      .hero p {
        margin-top: 8px;
      }
      .actions {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        margin-top: 16px;
      }
      .action-card {
        display: block;
        padding: 14px 15px;
        border-radius: 10px;
        border: 1px solid var(--vscode-panel-border);
        color: inherit;
        text-decoration: none;
        background: color-mix(in srgb, var(--vscode-editor-background) 96%, var(--vscode-foreground) 4%);
      }
      .action-card:hover {
        border-color: var(--vscode-focusBorder);
      }
      .action-title {
        display: block;
        margin-bottom: 6px;
        font-size: 14px;
        font-weight: 600;
      }
      .action-description {
        color: var(--vscode-descriptionForeground);
      }
      .secondary-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 14px;
        margin-top: 14px;
      }
      .secondary-actions a {
        color: var(--vscode-textLink-foreground);
        text-decoration: none;
      }
      .status-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      }
      .status-card {
        padding: 12px 14px;
        border-radius: 10px;
        border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
        background: color-mix(in srgb, var(--vscode-editor-background) 97%, var(--vscode-foreground) 3%);
      }
      .status-label {
        display: block;
        margin-bottom: 6px;
        color: var(--vscode-descriptionForeground);
      }
      .status-value {
        display: block;
        margin-bottom: 6px;
        font-size: 14px;
        font-weight: 600;
      }
      .quick-start {
        margin-top: 22px;
        padding-top: 14px;
        border-top: 1px solid var(--vscode-panel-border);
      }
      code {
        font-family: var(--vscode-editor-font-family);
        font-size: 12px;
      }
    </style>
  </head>
  <body>
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
  </body>
</html>`;
  }

  private buildSummary(
    report: TiebaDiagnosticsReport,
    followedForumsCount: number,
    readingSession?: ReadingSession
  ): OnboardingSummary {
    if (!report.bridge.pythonAvailable) {
      return {
        title: "先把 Python 装好，再回来继续。",
        description: "首页只保留最常用入口。先装 Python，再装 aiotieba，之后阅读会更稳。"
      };
    }

    if (!report.bridge.available) {
      return {
        title: "Python 已就绪，下一步直接安装 aiotieba。",
        description: "装好后会优先走结构化数据主路径，不用一直依赖网页回退。"
      };
    }

    if (!report.hasBduss) {
      return {
        title: "现在能匿名看，但最好先导入登录态。",
        description: "导入完整 Cookie 后，阅读更稳，也能解锁同步我关注的贴吧。"
      };
    }

    if (!report.hasStoken) {
      return {
        title: "现在能看帖，但还不能同步关注吧。",
        description: "补齐完整 Cookie 后，就能直接同步贴吧账号里的关注吧。"
      };
    }

    if (readingSession) {
      return {
        title: "可以直接继续上次阅读。",
        description: `最近停在“${readingSession.thread.title}”第 ${readingSession.page} 页。`
      };
    }

    if (followedForumsCount === 0) {
      return {
        title: "环境已经就绪，下一步把内容加进来。",
        description: "你可以先同步关注吧，也可以手动添加一个吧开始看。"
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

    if (!report.bridge.pythonAvailable) {
      actions.push({
        id: "downloadPython",
        label: "下载 Python",
        description: "先把运行环境装好，再回来安装 aiotieba。",
        command: "tieba.openPythonDownload"
      });
    } else if (!report.bridge.available) {
      actions.push({
        id: "installAiotieba",
        label: "安装 aiotieba",
        description: "装好后会优先走结构化数据主路径。",
        command: "tieba.installAiotieba"
      });
    }

    if (!report.hasBduss) {
      actions.push({
        id: "configureAccount",
        label: "导入登录态",
        description: "优先粘贴完整贴吧 Cookie，扩展会自动提取登录字段。",
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

    if (readingSession) {
      actions.push({
        id: "continueReading",
        label: "继续阅读",
        description: `继续打开“${readingSession.thread.title}”。`,
        command: "tieba.continueReading"
      });
    }

    if (followedForumsCount === 0) {
      if (report.hasStoken) {
        actions.push({
          id: "syncFollowedForums",
          label: "同步关注吧",
          description: "把贴吧账号里已关注的吧一次性导进来。",
          command: "tieba.syncFollowedForums"
        });
      }

      actions.push({
        id: "addForum",
        label: "添加贴吧",
        description: "先加一个吧，马上就能开始看。",
        command: "tieba.addForum"
      });
    } else {
      actions.push({
        id: "openThreadByUrl",
        label: "浏览指定链接",
        description: "直接输入帖子链接或帖子 ID 打开。",
        command: "tieba.openThreadByUrl"
      });
    }

    actions.push({
      id: "openDiagnostics",
      label: "打开环境诊断",
      description: "需要排查时再看细节，不用先翻设置。",
      command: "tieba.openDiagnostics"
    });

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
        value: readingSession ? `第 ${readingSession.page} 页` : "还没有记录",
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
    if (!report.bridge.pythonAvailable) {
      return "如果你现在只想尽快跑通：先装 Python，再点“安装 aiotieba”，然后导入登录态。";
    }

    if (!report.bridge.available) {
      return "如果你现在只想尽快跑通：先装 aiotieba，再导入登录态，然后添加贴吧或同步关注吧。";
    }

    if (!report.hasBduss) {
      return "最快的开始方式是：导入登录态 -> 添加贴吧或同步关注吧 -> 从左侧点开开始看。";
    }

    if (!report.hasStoken) {
      return "你现在已经能看帖；如果还想同步关注吧，就再导入一次包含 STOKEN 的完整 Cookie。";
    }

    if (readingSession) {
      return "如果只是继续摸鱼，直接点“继续阅读”就行；需要换内容时，再去左侧关注吧或浏览指定链接。";
    }

    if (followedForumsCount === 0) {
      return "下一步最直接：同步关注吧，或者先手动添加一个吧，然后从左侧点开开始看。";
    }

    return "首页只保留最常用动作。日常使用时，直接从左侧关注吧、最新和历史进入就够了。";
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
