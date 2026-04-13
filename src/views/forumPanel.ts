import * as vscode from "vscode";
import { ForumSubscription, ForumThreadPage, ThreadSummary } from "../models/tieba";
import { TiebaError } from "../services/errors";
import { TiebaService } from "../services/tiebaService";

interface ForumPanelState {
  forumName: string;
  page: number;
}

export interface ForumPanelSession {
  forum: ForumSubscription;
  page: number;
}

export class ForumPanelManager {
  private readonly panels = new Map<string, vscode.WebviewPanel>();
  private readonly lastLoadedPages = new Map<string, ForumThreadPage>();
  private readonly sessions = new Map<string, ForumPanelSession>();

  constructor(private readonly context: vscode.ExtensionContext, private readonly service: TiebaService) {}

  open(forum: ForumSubscription, options?: { page?: number; preserveFocus?: boolean }): void {
    const page = Math.max(1, options?.page ?? this.sessions.get(forum.forumName)?.page ?? 1);
    const existing = this.panels.get(forum.forumName);
    this.sessions.set(forum.forumName, {
      forum,
      page
    });

    if (existing) {
      existing.reveal(vscode.ViewColumn.Active, options?.preserveFocus);
      const latestPage = this.lastLoadedPages.get(forum.forumName);
      if (latestPage && latestPage.page === page) {
        void this.service.setLatestThreads(latestPage);
      } else {
        void this.loadForum(existing, { forumName: forum.forumName, page }, false);
      }
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "tiebaForum",
      `${forum.displayName}吧`,
      {
        viewColumn: vscode.ViewColumn.Active,
        preserveFocus: options?.preserveFocus
      },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")]
      }
    );

    this.panels.set(forum.forumName, panel);
    panel.webview.html = this.getHtml(panel.webview, forum.forumName);
    panel.onDidDispose(() => {
      this.panels.delete(forum.forumName);
      this.lastLoadedPages.delete(forum.forumName);
      this.sessions.delete(forum.forumName);
    });

    panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case "ready":
          await this.loadForum(panel, { forumName: forum.forumName, page }, false);
          break;
        case "refreshForum":
          await this.loadForum(panel, message.payload as ForumPanelState, true);
          break;
        case "loadForumPage":
          await this.loadForum(panel, message.payload as ForumPanelState, false);
          break;
        case "openThread":
          await vscode.commands.executeCommand("tieba.openThread", message.payload as ThreadSummary);
          break;
        case "openExternal":
          await vscode.commands.executeCommand("tieba.openExternal", { forumName: forum.forumName });
          break;
        case "openInSimpleBrowser":
          await vscode.commands.executeCommand("tieba.openInSimpleBrowser", { forumName: forum.forumName });
          break;
        default:
          break;
      }
    });
  }

  disposeAll(): void {
    for (const panel of this.panels.values()) {
      panel.dispose();
    }
    this.panels.clear();
  }

  captureSessions(): ForumPanelSession[] {
    return Array.from(this.sessions.values()).map((session) => ({
      forum: session.forum,
      page: session.page
    }));
  }

  getActiveForumName(): string | undefined {
    for (const [forumName, panel] of this.panels.entries()) {
      if (panel.active) {
        return forumName;
      }
    }

    return undefined;
  }

  private async loadForum(
    panel: vscode.WebviewPanel,
    state: ForumPanelState,
    forceRefresh: boolean
  ): Promise<void> {
    panel.webview.postMessage({
      type: "setLoading",
      payload: {
        forumName: state.forumName,
        page: state.page
      }
    });

    try {
      const pageData = await this.service.getForumThreads(state.forumName, state.page, forceRefresh);
      this.lastLoadedPages.set(state.forumName, pageData);
      const session = this.sessions.get(state.forumName);
      if (session) {
        this.sessions.set(state.forumName, {
          forum: session.forum,
          page: pageData.page
        });
      }
      await this.service.setLatestThreads(pageData);
      panel.webview.postMessage({
        type: "forumLoaded",
        payload: {
          ...pageData,
          fallbackToBrowser: this.service.getSettings().fallbackToBrowser
        }
      });
    } catch (error) {
      const tiebaError = normalizeTiebaError(error);
      panel.webview.postMessage({
        type: "forumError",
        payload: {
          forumName: state.forumName,
          page: state.page,
          message: tiebaError.message,
          code: tiebaError.code,
          sourceUrl: this.service.getForumUrl(state.forumName, state.page),
          fallbackToBrowser: this.service.getSettings().fallbackToBrowser
        }
      });
    }
  }

  private getHtml(webview: vscode.Webview, forumName: string): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "forumView.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "common.css"));
    const nonce = createNonce();
    const csp = `default-src 'none'; img-src ${webview.cspSource} https: http: data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';`;

    return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${styleUri}" />
    <title>${forumName}吧</title>
  </head>
  <body data-page="forum">
    <div id="app"></div>
    <script nonce="${nonce}">
      window.__TIEBA_BOOTSTRAP__ = ${JSON.stringify({ forumName })};
    </script>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }
}

function normalizeTiebaError(error: unknown): TiebaError {
  if (error instanceof TiebaError) {
    return error;
  }
  return new TiebaError("unknown", "加载贴吧失败。", error);
}

function createNonce(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}
