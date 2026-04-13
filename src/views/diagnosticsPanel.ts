import * as vscode from "vscode";
import { TiebaDiagnosticsReport, TiebaService } from "../services/tiebaService";

export class DiagnosticsPanel {
  private panel?: vscode.WebviewPanel;

  constructor(private readonly context: vscode.ExtensionContext, private readonly service: TiebaService) {
    this.context.subscriptions.push(
      this.service.onDidChangeStatus(() => {
        void this.render();
      }),
      this.service.onDidChange(() => {
        void this.render();
      })
    );
  }

  async open(): Promise<void> {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Active);
      await this.render();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "tiebaDiagnostics",
      "Tieba 环境诊断",
      vscode.ViewColumn.Active,
      {
        enableScripts: false
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
    this.panel.webview.html = this.getHtml(this.panel.webview, report);
  }

  private getHtml(webview: vscode.Webview, report: TiebaDiagnosticsReport): string {
    const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline';`;
    return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tieba 环境诊断</title>
    <style>
      :root {
        color-scheme: light dark;
      }
      body {
        margin: 0;
        padding: 20px;
        font: 13px/1.6 var(--vscode-font-family);
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
      }
      h1, h2 {
        margin: 0 0 12px;
        font-weight: 600;
      }
      h2 {
        margin-top: 24px;
      }
      .subtle {
        color: var(--vscode-descriptionForeground);
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
        background: color-mix(in srgb, var(--vscode-editor-background) 92%, var(--vscode-foreground) 8%);
      }
      .label {
        display: block;
        margin-bottom: 4px;
        color: var(--vscode-descriptionForeground);
      }
      .value {
        font-size: 14px;
        font-weight: 600;
      }
      ul {
        margin: 0;
        padding-left: 18px;
      }
      code {
        font-family: var(--vscode-editor-font-family);
        font-size: 12px;
      }
    </style>
  </head>
  <body>
    <h1>Tieba 环境诊断</h1>
    <p class="subtle">这页只回答两件事：现在能不能稳定看，以及当前到底走的是哪条数据链路。</p>

    <h2>账号状态</h2>
    <div class="grid">
      ${this.renderCard("BDUSS", report.hasBduss ? "已配置" : "未配置")}
      ${this.renderCard("STOKEN", report.hasStoken ? "已配置" : "未配置")}
      ${this.renderCard("Cookie", report.hasCookie ? "已配置" : "未配置")}
      ${this.renderCard("最近成功数据源", report.lastResolvedSource === "aiotieba" ? "aiotieba" : report.lastResolvedSource === "web" ? "网页回退" : "还没有记录")}
    </div>

    <h2>Bridge 状态</h2>
    <div class="grid">
      ${this.renderCard("aiotieba bridge", report.bridge.available ? "可用" : "不可用")}
      ${this.renderCard("Python 命令", this.escapeHtml(report.bridge.pythonPath))}
      ${this.renderCard("导入方式", report.bridge.loadMode === "local" ? "项目内 aiotieba-master" : report.bridge.loadMode === "installed" ? "已安装 Python 包" : "未知")}
      ${this.renderCard("aiotieba 版本", this.escapeHtml(report.bridge.version || "未知"))}
    </div>
    <p>${this.escapeHtml(report.bridge.message)}</p>
    ${report.bridge.modulePath ? `<p class="subtle"><code>${this.escapeHtml(report.bridge.modulePath)}</code></p>` : ""}

    <h2>当前设置</h2>
    <ul>
      <li>图片显示：${report.settings.showImages ? "开启" : "关闭"}</li>
      <li>紧凑模式：${report.settings.compactMode ? "开启" : "关闭"}</li>
      <li>低存在感模式：${report.settings.lowContrastMode ? "开启" : "关闭"}</li>
      <li>缓存分钟数：${report.settings.cacheMinutes}</li>
      <li>打开帖子方式：${report.settings.openThreadMode}</li>
      <li>浏览器兜底：${report.settings.fallbackToBrowser ? "开启" : "关闭"}</li>
    </ul>

    ${
      report.lastFailure
        ? `<h2>最近失败</h2>
    <ul>
      <li>时间：${this.escapeHtml(new Date(report.lastFailure.at).toLocaleString("zh-CN"))}</li>
      <li>错误码：${this.escapeHtml(report.lastFailure.code)}</li>
      <li>信息：${this.escapeHtml(report.lastFailure.message)}</li>
    </ul>`
        : ""
    }

    <h2>建议</h2>
    <ul>
      ${this.renderSuggestionList(report)}
    </ul>
  </body>
</html>`;
  }

  private renderCard(label: string, value: string): string {
    return `<section class="card"><span class="label">${this.escapeHtml(label)}</span><span class="value">${value}</span></section>`;
  }

  private renderSuggestionList(report: TiebaDiagnosticsReport): string {
    const items: string[] = [];

    if (!report.bridge.available) {
      items.push("先安装可用 Python，并执行 `python -m pip install aiotieba`。");
    }
    if (!report.hasBduss) {
      items.push("在命令面板执行 `导入贴吧登录态`。");
    }
    if (!report.hasCookie) {
      items.push("如需网页回退更稳，可额外配置 `配置贴吧 Cookie`。");
    }
    if (items.length === 0) {
      items.push("当前主路径条件已经满足，可以直接以结构化阅读模式继续用。");
    }

    return items.map((item) => `<li>${this.escapeHtml(item)}</li>`).join("");
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
