import * as vscode from "vscode";

export class ShortcutHelpPanel {
  private panel?: vscode.WebviewPanel;

  constructor(private readonly context: vscode.ExtensionContext) {}

  async open(): Promise<void> {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Active);
      this.panel.webview.html = this.getHtml(this.panel.webview);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "tiebaShortcutHelp",
      "Tieba 快捷键帮助",
      vscode.ViewColumn.Active,
      {
        enableScripts: false
      }
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.panel.webview.html = this.getHtml(this.panel.webview);
  }

  private getHtml(webview: vscode.Webview): string {
    const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline';`;

    return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tieba 快捷键帮助</title>
    <style>
      :root {
        color-scheme: light dark;
      }
      body {
        margin: 0;
        padding: 22px;
        font: 13px/1.65 var(--vscode-font-family);
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
      }
      h1, h2 {
        margin: 0 0 12px;
        font-weight: 600;
      }
      h2 {
        margin-top: 22px;
        font-size: 15px;
      }
      p {
        margin: 0 0 8px;
        color: var(--vscode-descriptionForeground);
      }
      .grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      }
      .card {
        border: 1px solid var(--vscode-panel-border);
        border-radius: 10px;
        padding: 12px 14px;
        background: color-mix(in srgb, var(--vscode-editor-background) 96%, var(--vscode-foreground) 4%);
      }
      .item + .item {
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid var(--vscode-panel-border);
      }
      .key {
        display: inline-flex;
        align-items: center;
        min-height: 22px;
        padding: 0 8px;
        border-radius: 999px;
        border: 1px solid var(--vscode-panel-border);
        background: color-mix(in srgb, var(--vscode-editor-background) 90%, var(--vscode-textLink-foreground) 10%);
        font-weight: 600;
      }
      .title {
        display: block;
        margin-top: 6px;
        font-weight: 600;
      }
      .desc {
        color: var(--vscode-descriptionForeground);
      }
    </style>
  </head>
  <body>
    <h1>Tieba 快捷键帮助</h1>
    <p>这些快捷键里，<code>Ctrl+Alt+X</code> 是全局可用的；其余主要在帖子阅读页里使用。</p>

    <div class="grid">
      <section class="card">
        <h2>全局</h2>
        ${this.renderItem("Ctrl+Alt+X", "老板键", "快速切到伪装视图，再按一次恢复。")}
        ${this.renderItem("命令面板", "快捷键帮助", "直接搜索“阅读: 快捷键帮助”也能打开这页。")}
      </section>
      <section class="card">
        <h2>帖子阅读页</h2>
        ${this.renderItem("?", "打开或关闭帮助", "在帖子页里直接查看当前快捷键。")}
        ${this.renderItem("R", "刷新当前帖子", "重新请求当前页内容。")}
        ${this.renderItem("L", "切换只看楼主", "在普通模式和只看楼主之间切换。")}
        ${this.renderItem("I", "显示或隐藏图片", "切换正文图片显示状态。")}
      </section>
      <section class="card">
        <h2>翻页和定位</h2>
        ${this.renderItem("J", "下一页", "打开下一页帖子内容。")}
        ${this.renderItem("K", "上一页", "回到上一页帖子内容。")}
        ${this.renderItem("G", "聚焦跳页输入框", "直接准备输入页码。")}
        ${this.renderItem("Enter", "执行跳页", "在跳页输入框里直接回车。")}
      </section>
      <section class="card">
        <h2>关闭类操作</h2>
        ${this.renderItem("Esc", "关闭大图或帮助", "优先关闭图片预览或快捷键帮助。")}
      </section>
    </div>
  </body>
</html>`;
  }

  private renderItem(key: string, title: string, description: string): string {
    return `<div class="item">
      <span class="key">${this.escapeHtml(key)}</span>
      <span class="title">${this.escapeHtml(title)}</span>
      <div class="desc">${this.escapeHtml(description)}</div>
    </div>`;
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
