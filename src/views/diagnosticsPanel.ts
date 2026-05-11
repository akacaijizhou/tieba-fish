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
      "Tieba 检查问题",
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
      title: "Tieba 检查问题",
      settings: report.settings,
      pageId: "diagnostics",
      body: `
    <h1>Tieba 检查问题</h1>

    <h2>结果状态</h2>
    <div class="grid">
      ${this.renderCard("看帖", human.readingLabel, human.readingDescription)}
      ${this.renderCard("关注吧同步", human.syncLabel, human.syncDescription)}
      ${this.renderCard("阅读模式", human.sourceLabel, human.sourceDescription)}
      ${this.renderCard("贴吧登录", human.loginLabel, human.loginDescription)}
    </div>

    <h2>技术细节</h2>
    <div class="grid">
      ${this.renderCard("BDUSS", report.hasBduss ? "已配置" : "未配置")}
      ${this.renderCard("STOKEN", report.hasStoken ? "已配置" : "未配置")}
      ${this.renderCard("Cookie", report.hasCookie ? "已配置" : "未配置")}
      ${this.renderCard("Python 命令", report.bridge.pythonPath)}
      ${this.renderCard("Python 运行时", report.bridge.pythonAvailable ? `可用${report.bridge.pythonVersion ? ` · ${report.bridge.pythonVersion}` : ""}` : "不可用")}
      ${this.renderCard("阅读增强组件", report.bridge.available ? "已安装" : "未安装")}
      ${this.renderCard("导入方式", report.bridge.loadMode === "installed" ? "已安装 Python 包" : "未知")}
      ${this.renderCard("增强组件版本", report.bridge.version || "未知")}
    </div>
    <p>${this.escapeHtml(report.bridge.message)}</p>
    ${report.bridge.modulePath ? `<p class="subtle"><code>${this.escapeHtml(report.bridge.modulePath)}</code></p>` : ""}
    ${
      !report.bridge.pythonAvailable
        ? `<p><a href="${this.commandUri("tieba.installPython")}">安装 Python</a></p>`
        : report.bridge.canInstallAiotieba
          ? `<p><a href="${this.commandUri("tieba.installAiotieba")}">安装阅读增强组件</a></p>`
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
      <li>缺少 Python 时提示安装：${vscode.workspace.getConfiguration("tieba").get<boolean>("autoInstallPython", true) ? "开启" : "关闭"}</li>
      <li>自动安装阅读增强组件：${vscode.workspace.getConfiguration("tieba").get<boolean>("autoInstallEnhancement", true) ? "开启" : "关闭"}</li>
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

    <h2>维护操作</h2>
    <p><a href="${this.commandUri("tieba.resetOnboardingAndReload")}">完全重置并重载</a></p>
    <p class="subtle">会清空本地保存的贴吧登录、关注吧、收藏、历史、缓存和首页引导状态。</p>
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
        items.push("当前已经有可用 Python，可以直接点“安装阅读增强组件”。");
      } else {
        items.push("先点“安装 Python”。如果自动安装失败，再打开下载页手动安装。");
        items.push("装好后重新打开检查页，确认 Python 运行时变成“可用”。");
        items.push("确认有 Python 后，再执行“安装阅读增强组件”。");
      }
    }
    if (!report.hasBduss) {
      items.push("如果你要同步账号关注吧，先执行“导入贴吧登录”，优先直接粘贴完整贴吧 Cookie。");
    } else if (!report.hasStoken) {
      items.push("如果你要同步关注吧，需要重新导入一次完整 Cookie。");
    }
    if (!report.hasCookie) {
      items.push("如果你担心网页回退不稳，可以额外导入完整 Cookie。");
    }
    if (items.length === 0) {
      items.push("当前已经可以直接阅读；如果左侧没有内容，就导入关注吧或手动添加贴吧。");
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
