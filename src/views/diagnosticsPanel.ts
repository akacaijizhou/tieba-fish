import * as vscode from "vscode";
import { formatReadingThemeSummary, getReadingContrastOption, getReadingDensityOption, getThemePresetOption } from "../theme/themeRegistry";
import { TiebaDiagnosticsReport, TiebaService } from "../services/tiebaService";
import { getTiebaHumanStatus } from "../statusPresentation";
import { renderStaticThemedWebviewPage } from "./themedWebview";

export class DiagnosticsPanel {
  private panel?: vscode.WebviewPanel;

  constructor(private readonly context: vscode.ExtensionContext, private readonly service: TiebaService) {
    this.context.subscriptions.push(
      this.service.onDidChangeStatus(() => {
        void this.render();
      }),
      this.service.onDidChange(() => {
        void this.render();
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("tieba")) {
          void this.render();
        }
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
    this.panel.webview.html = this.getHtml(this.panel.webview, report);
  }

  private getHtml(webview: vscode.Webview, report: TiebaDiagnosticsReport): string {
    const human = getTiebaHumanStatus(report);
    return renderStaticThemedWebviewPage({
      context: this.context,
      webview,
      title: "Tieba 环境诊断",
      settings: report.settings,
      pageId: "diagnostics",
      body: `
    <h1>Tieba 环境诊断</h1>
    <p class="subtle">这页只回答两件事：现在能不能稳定看，以及当前到底走的是哪条数据链路。</p>

    <h2>结果状态</h2>
    <div class="grid">
      ${this.renderCard("阅读", human.readingLabel, human.readingDescription)}
      ${this.renderCard("同步关注吧", human.syncLabel, human.syncDescription)}
      ${this.renderCard("当前链路", human.sourceLabel, human.sourceDescription)}
      ${this.renderCard("登录态", human.loginLabel, human.loginDescription)}
    </div>

    <h2>技术细节</h2>
    <div class="grid">
      ${this.renderCard("BDUSS", report.hasBduss ? "已配置" : "未配置")}
      ${this.renderCard("STOKEN", report.hasStoken ? "已配置" : "未配置")}
      ${this.renderCard("Cookie", report.hasCookie ? "已配置" : "未配置")}
      ${this.renderCard("Python 命令", report.bridge.pythonPath)}
      ${this.renderCard("Python 运行时", report.bridge.pythonAvailable ? `可用${report.bridge.pythonVersion ? ` · ${report.bridge.pythonVersion}` : ""}` : "不可用")}
      ${this.renderCard("aiotieba", report.bridge.available ? "已安装" : "未安装")}
      ${this.renderCard("导入方式", report.bridge.loadMode === "installed" ? "已安装 Python 包" : "未知")}
      ${this.renderCard("aiotieba 版本", report.bridge.version || "未知")}
    </div>
    <p>${this.escapeHtml(report.bridge.message)}</p>
    ${report.bridge.modulePath ? `<p class="subtle"><code>${this.escapeHtml(report.bridge.modulePath)}</code></p>` : ""}
    ${
      !report.bridge.pythonAvailable
        ? `<p><a href="${this.commandUri("tieba.openPythonDownload")}">下载 Python</a></p>`
        : report.bridge.canInstallAiotieba
          ? `<p><a href="${this.commandUri("tieba.installAiotieba")}">一键安装 aiotieba</a></p>`
        : ""
    }

    <h2>当前设置</h2>
    <ul>
      <li>阅读样式：${this.escapeHtml(formatReadingThemeSummary(report.settings))}</li>
      <li>主题预设：${this.escapeHtml(getThemePresetOption(report.settings.themePreset).label)}</li>
      <li>阅读密度：${this.escapeHtml(getReadingDensityOption(report.settings.density).label)}</li>
      <li>视觉对比：${this.escapeHtml(getReadingContrastOption(report.settings.contrast).label)}</li>
      <li>图片显示：${report.settings.showImages ? "开启" : "关闭"}</li>
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
      `
    });
  }

  private renderCard(label: string, value: string, description?: string): string {
    return `<section class="card"><span class="label">${this.escapeHtml(label)}</span><span class="value">${value}</span>${description ? `<div>${this.escapeHtml(description)}</div>` : ""}</section>`;
  }

  private renderSuggestionList(report: TiebaDiagnosticsReport): string {
    const items: string[] = [];

    if (!report.bridge.available) {
      if (report.bridge.pythonAvailable) {
        items.push("当前已经有可用 Python，可以直接点“一键安装 aiotieba”。");
      } else {
        items.push("先点“下载 Python”，安装时勾选 Add python.exe to PATH。");
        items.push("装好后重新打开环境诊断，确认 Python 运行时变成“可用”。");
        items.push("确认有 Python 后，再执行“安装 aiotieba”。");
      }
    }
    if (!report.hasBduss) {
      items.push("先执行“导入贴吧登录态”，优先直接粘贴完整贴吧 Cookie。");
    } else if (!report.hasStoken) {
      items.push("如果你要同步关注吧，需要重新导入一次包含 STOKEN 的完整 Cookie。");
    }
    if (!report.hasCookie) {
      items.push("如果你担心网页回退不稳，可以额外导入完整 Cookie。");
    }
    if (items.length === 0) {
      items.push("当前已经可以直接阅读；如果左侧没有内容，就去同步关注吧或手动添加贴吧。");
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

  private commandUri(command: string): string {
    return vscode.Uri.parse(`command:${command}`).toString();
  }
}
