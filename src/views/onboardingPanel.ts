import * as vscode from "vscode";
import { TiebaDiagnosticsReport, TiebaService } from "../services/tiebaService";

interface OnboardingPanelOpenOptions {
  preserveFocus?: boolean;
}

interface OnboardingSummary {
  title: string;
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
      "Tieba 首次引导",
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
    this.panel.webview.html = this.getHtml(this.panel.webview, report, followedForumsCount);
  }

  private getHtml(webview: vscode.Webview, report: TiebaDiagnosticsReport, followedForumsCount: number): string {
    const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline';`;
    const summary = this.buildSummary(report, followedForumsCount);
    const nextSteps = this.buildNextSteps(report, followedForumsCount);
    const primaryAction = !report.bridge.pythonAvailable
      ? this.renderAction("下载 Python", "tieba.openPythonDownload", true)
      : !report.bridge.available
        ? this.renderAction("安装 aiotieba", "tieba.installAiotieba", true)
        : !report.hasBduss
          ? this.renderAction("导入登录态", "tieba.configureAccount", true)
          : !report.hasStoken
            ? this.renderAction("补齐完整 Cookie", "tieba.configureAccount", true)
            : followedForumsCount === 0
              ? this.renderAction("同步关注吧", "tieba.syncFollowedForums", true)
              : this.renderAction("添加贴吧", "tieba.addForum", true);
    const secondaryAction = !report.bridge.pythonAvailable
      ? this.renderAction("我已装好，重新检测", "tieba.openOnboarding", false)
      : this.renderAction("从剪贴板导入", "tieba.importLoginStateFromClipboard", false);

    return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tieba 首次引导</title>
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
        margin: 0 0 10px;
      }
      .subtle {
        color: var(--vscode-descriptionForeground);
      }
      .banner {
        margin-bottom: 18px;
        padding: 14px 16px;
        border-radius: 10px;
        border: 1px solid var(--vscode-panel-border);
        background: color-mix(in srgb, var(--vscode-editor-background) 93%, var(--vscode-focusBorder) 7%);
      }
      .grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }
      .card {
        border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
        border-radius: 8px;
        padding: 12px 14px;
        background: color-mix(in srgb, var(--vscode-editor-background) 96%, var(--vscode-foreground) 4%);
      }
      .label {
        display: block;
        margin-bottom: 6px;
        color: var(--vscode-descriptionForeground);
      }
      .value {
        display: block;
        margin-bottom: 6px;
        font-size: 14px;
        font-weight: 600;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 12px;
      }
      .action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 120px;
        padding: 7px 12px;
        border-radius: 999px;
        border: 1px solid var(--vscode-button-border, transparent);
        color: var(--vscode-button-foreground);
        background: var(--vscode-button-background);
        text-decoration: none;
      }
      .action.secondary {
        color: var(--vscode-textLink-foreground);
        background: transparent;
        border-color: var(--vscode-panel-border);
      }
      ol {
        margin: 0;
        padding-left: 18px;
      }
      li + li {
        margin-top: 8px;
      }
      code {
        font-family: var(--vscode-editor-font-family);
        font-size: 12px;
      }
      .footer {
        margin-top: 20px;
      }
      .footer a {
        color: var(--vscode-textLink-foreground);
      }
    </style>
  </head>
  <body>
    <h1>Tieba 首次引导</h1>
    <p class="subtle">这页只回答三件事：现在能不能顺利用、还差哪一步、下一步该点什么。</p>

    <section class="banner">
      <strong>${this.escapeHtml(summary.title)}</strong>
      <p>${this.escapeHtml(summary.description)}</p>
      <div class="actions">
        ${primaryAction}
        ${secondaryAction}
        ${this.renderAction("打开环境诊断", "tieba.openDiagnostics", false)}
      </div>
    </section>

    <h2>当前状态</h2>
    <div class="grid">
      ${this.renderCard(
        "环境",
        report.bridge.available ? "主路径可用" : report.bridge.pythonAvailable ? "缺少 aiotieba" : "缺少 Python",
        report.bridge.available
          ? `当前 Python: ${report.bridge.pythonPath}`
          : report.bridge.pythonAvailable
            ? "Python 已可用，下一步直接安装 aiotieba 即可。"
            : "当前还没有可用 Python。网页回退仍可作为兜底，但建议先把 Python 装好。"
      )}
      ${this.renderCard(
        "登录态",
        report.hasBduss ? (report.hasStoken ? "完整登录态" : "普通阅读可用") : "匿名状态",
        this.buildAuthDescription(report)
      )}
      ${this.renderCard(
        "关注吧",
        followedForumsCount > 0 ? `已关注 ${followedForumsCount} 个` : "还没有关注吧",
        followedForumsCount > 0 ? "可以直接点开任意吧开始看。" : "可以手动添加，或在完整登录态下同步我关注的贴吧。"
      )}
    </div>

    <h2>推荐下一步</h2>
    <ol>
      ${nextSteps.map((step) => `<li>${this.escapeHtml(step)}</li>`).join("")}
    </ol>

    <p class="footer subtle">
      普通阅读只需要能拿到内容；如果你还想同步“我关注的贴吧”，就要导入包含
      <code>STOKEN</code> 的完整 Cookie。需要更细的排查信息，可以随时点
      <a href="${this.commandUri("tieba.openDiagnostics")}">环境诊断</a>。
    </p>
  </body>
</html>`;
  }

  private buildSummary(report: TiebaDiagnosticsReport, followedForumsCount: number): OnboardingSummary {
    if (!report.bridge.available) {
      if (report.bridge.pythonAvailable) {
        return {
          title: "Python 已就绪，但还缺 aiotieba",
          description: "现在不用手动配命令了，直接点“一键安装 aiotieba”就能把结构化数据主路径补齐。"
        };
      }

      return {
        title: "先把 Python 装好",
        description: "当前没有检测到可用 Python。先安装 Python，再回来点“安装 aiotieba”，结构化数据主路径就能补齐。"
      };
    }

    if (!report.hasBduss) {
      return {
        title: "现在能匿名看，但建议先导入登录态",
        description: "导入完整 Cookie 后，普通阅读更稳，也能解锁同步我关注的贴吧。"
      };
    }

    if (!report.hasStoken) {
      return {
        title: "普通阅读已经可用",
        description: "你已经有 BDUSS，但还缺 STOKEN。同步我关注的贴吧前，建议重新导入完整 Cookie。"
      };
    }

    if (followedForumsCount === 0) {
      return {
        title: "环境和登录态都已经就绪",
        description: "下一步直接添加贴吧，或者同步你在贴吧账号里已经关注的吧。"
      };
    }

    return {
      title: "可以直接开始用了",
      description: "主路径和登录态都已准备好。接下来直接点开关注吧，或者浏览指定链接即可。"
    };
  }

  private buildAuthDescription(report: TiebaDiagnosticsReport): string {
    if (!report.hasBduss) {
      return "还没有导入 BDUSS。当前仍可匿名阅读，但部分数据更容易受限。";
    }

    if (!report.hasStoken) {
      return "已导入 BDUSS，但还缺 STOKEN。普通阅读可用；同步关注吧仍建议导入完整 Cookie。";
    }

    if (!report.hasCookie) {
      return "BDUSS 和 STOKEN 已就绪。网页回退时如果也想复用登录态，建议导入完整 Cookie。";
    }

    return "BDUSS、STOKEN 和 Cookie 都已就绪，结构化阅读和网页回退都会更稳。";
  }

  private buildNextSteps(report: TiebaDiagnosticsReport, followedForumsCount: number): string[] {
    const steps: string[] = [];

    if (!report.bridge.available) {
      if (report.bridge.pythonAvailable) {
        steps.push("先点“安装 aiotieba”，安装完成后会自动恢复结构化数据主路径。");
      } else {
        steps.push("先点“下载 Python”，安装时勾选 Add python.exe to PATH。");
        steps.push("装好后回到扩展里，点“我已装好，重新检测”。");
        steps.push("检测到 Python 后，再点“安装 aiotieba”。");
      }
    }

    if (!report.hasBduss) {
      steps.push("执行“导入贴吧登录态”，优先直接粘贴浏览器里复制的完整贴吧 Cookie。");
    } else if (!report.hasStoken) {
      steps.push("如果你要同步“我关注的贴吧”，需要重新导入包含 STOKEN 的完整 Cookie。");
    }

    if (followedForumsCount === 0) {
      steps.push(report.hasStoken ? "执行“同步我关注的贴吧”，或者先手动添加一个吧。" : "先执行“添加贴吧”，再点开一个吧开始看。");
    } else {
      steps.push("关注吧已经有数据了，直接点开一个吧试试看。");
    }

    steps.push("如果遇到不确定的问题，先打开环境诊断，看当前是走 aiotieba 还是网页回退。");
    return steps;
  }

  private renderCard(label: string, value: string, description: string): string {
    return `<section class="card">
      <span class="label">${this.escapeHtml(label)}</span>
      <span class="value">${this.escapeHtml(value)}</span>
      <span>${this.escapeHtml(description)}</span>
    </section>`;
  }

  private renderAction(label: string, command: string, primary: boolean): string {
    const className = primary ? "action" : "action secondary";
    return `<a class="${className}" href="${this.commandUri(command)}">${this.escapeHtml(label)}</a>`;
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
