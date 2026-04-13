import * as vscode from "vscode";
import { ThreadSummary } from "../models/tieba";
import { TiebaError } from "../services/errors";
import { TiebaService } from "../services/tiebaService";

interface ThreadPanelState {
  thread: ThreadSummary;
  page: number;
}

export interface ThreadPanelSession {
  thread: ThreadSummary;
  page: number;
}

export class ThreadPanelManager {
  private readonly panels = new Map<string, vscode.WebviewPanel>();
  private readonly sessions = new Map<string, ThreadPanelSession>();

  constructor(private readonly context: vscode.ExtensionContext, private readonly service: TiebaService) {}

  async open(
    thread: ThreadSummary,
    options?: { page?: number; preserveFocus?: boolean; recordHistory?: boolean }
  ): Promise<void> {
    if (options?.recordHistory !== false) {
      await this.service.recordHistory(thread);
    }

    const previousPage = this.sessions.get(thread.threadId)?.page;
    const page = Math.max(1, options?.page ?? previousPage ?? 1);
    this.sessions.set(thread.threadId, {
      thread,
      page
    });

    const existing = this.panels.get(thread.threadId);
    if (existing) {
      existing.reveal(this.resolveViewColumn(), options?.preserveFocus);
      existing.webview.postMessage({
        type: "favoriteChanged",
        payload: {
          favorite: this.service.isFavorite(thread.threadId)
        }
      });
      if (previousPage !== page) {
        await this.loadThread(existing, { thread, page }, false);
      }
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "tiebaThread",
      thread.title,
      {
        viewColumn: this.resolveViewColumn(),
        preserveFocus: options?.preserveFocus
      },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")]
      }
    );

    this.panels.set(thread.threadId, panel);
    panel.webview.html = this.getHtml(panel.webview, thread.title);
    panel.onDidDispose(() => {
      this.panels.delete(thread.threadId);
      this.sessions.delete(thread.threadId);
    });

    panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case "ready":
          await this.loadThread(panel, { thread, page }, false);
          break;
        case "refreshThread":
          await this.loadThread(panel, { thread, page: message.payload.page ?? 1 }, true);
          break;
        case "loadThreadPage":
          await this.loadThread(panel, { thread, page: message.payload.page ?? 1 }, false);
          break;
        case "toggleImages":
          {
            const settings = await this.service.toggleImages();
            for (const existingPanel of this.panels.values()) {
              existingPanel.webview.postMessage({
                type: "settingsChanged",
                payload: settings
              });
            }
          }
          break;
        case "favoriteThread":
          {
            const favorite = await this.service.toggleFavorite(thread);
            panel.webview.postMessage({
              type: "favoriteChanged",
              payload: {
                favorite
              }
            });
          }
          break;
        case "loadPostComments":
          {
            const postId = String(message.payload?.postId ?? "");
            if (!postId) {
              break;
            }

            panel.webview.postMessage({
              type: "postCommentsLoading",
              payload: {
                postId
              }
            });

            try {
              const comments = await this.service.getPostComments({
                threadId: thread.threadId,
                postId
              });
              panel.webview.postMessage({
                type: "postCommentsLoaded",
                payload: comments
              });
            } catch (error) {
              const tiebaError = normalizeTiebaError(error);
              panel.webview.postMessage({
                type: "postCommentsError",
                payload: {
                  postId,
                  message: tiebaError.message,
                  code: tiebaError.code
                }
              });
            }
          }
          break;
        case "openExternal":
          await vscode.commands.executeCommand("tieba.openExternal", thread);
          break;
        case "openInSimpleBrowser":
          await vscode.commands.executeCommand("tieba.openInSimpleBrowser", thread);
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

  captureSessions(): ThreadPanelSession[] {
    return Array.from(this.sessions.values()).map((session) => ({
      thread: session.thread,
      page: session.page
    }));
  }

  getActiveThreadId(): string | undefined {
    for (const [threadId, panel] of this.panels.entries()) {
      if (panel.active) {
        return threadId;
      }
    }

    return undefined;
  }

  broadcastSettings(): void {
    const settings = this.service.getSettings();
    for (const panel of this.panels.values()) {
      panel.webview.postMessage({
        type: "settingsChanged",
        payload: settings
      });
    }
  }

  private async loadThread(
    panel: vscode.WebviewPanel,
    state: ThreadPanelState,
    forceRefresh: boolean
  ): Promise<void> {
    panel.webview.postMessage({
      type: "setLoading",
      payload: {
        page: state.page
      }
    });

    try {
      const detail = await this.service.getThreadDetail(
        {
          threadId: state.thread.threadId,
          forumName: state.thread.forumName,
          page: state.page,
          sourceUrl: state.page === 1 ? state.thread.url : undefined
        },
        forceRefresh
      );
      this.sessions.set(state.thread.threadId, {
        thread: state.thread,
        page: detail.page
      });
      panel.webview.postMessage({
        type: "threadLoaded",
        payload: {
          ...detail,
          thread: state.thread,
          favorite: this.service.isFavorite(state.thread.threadId),
          settings: this.service.getSettings()
        }
      });
    } catch (error) {
      const tiebaError = normalizeTiebaError(error);
      panel.webview.postMessage({
        type: "threadError",
        payload: {
          thread: state.thread,
          message: tiebaError.message,
          code: tiebaError.code,
          settings: this.service.getSettings()
        }
      });
    }
  }

  private resolveViewColumn(): vscode.ViewColumn {
    return this.service.getSettings().openThreadMode === "beside"
      ? vscode.ViewColumn.Beside
      : vscode.ViewColumn.Active;
  }

  private getHtml(webview: vscode.Webview, title: string): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "media", "threadView.js"));
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
    <title>${escapeHtml(title)}</title>
  </head>
  <body data-page="thread">
    <div id="app"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }
}

function normalizeTiebaError(error: unknown): TiebaError {
  if (error instanceof TiebaError) {
    return error;
  }
  return new TiebaError("unknown", "加载帖子失败。", error);
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createNonce(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}
