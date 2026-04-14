import * as vscode from "vscode";
import { ForumPanelManager, ForumPanelSession } from "./forumPanel";
import { ThreadPanelManager, ThreadPanelSession } from "./threadPanel";

interface BossModeSnapshot {
  forums: ForumPanelSession[];
  threads: ThreadPanelSession[];
  activeTarget?: {
    kind: "forum" | "thread";
    id: string;
  };
}

export class BossModeManager {
  private enabled = false;
  private snapshot?: BossModeSnapshot;
  private readonly fakeRootUri: vscode.Uri;
  private readonly fakeFileUris: vscode.Uri[];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly forumPanels: ForumPanelManager,
    private readonly threadPanels: ThreadPanelManager
  ) {
    this.fakeRootUri = vscode.Uri.joinPath(context.extensionUri, "client-dashboard");
    this.fakeFileUris = [
      vscode.Uri.joinPath(this.fakeRootUri, "package.json"),
      vscode.Uri.joinPath(this.fakeRootUri, "src", "app.ts"),
      vscode.Uri.joinPath(this.fakeRootUri, "src", "api", "client.ts")
    ];
  }

  async toggle(): Promise<void> {
    if (this.enabled) {
      await this.disable();
      return;
    }

    await this.enable();
  }

  private async enable(): Promise<void> {
    this.snapshot = {
      forums: this.forumPanels.captureSessions(),
      threads: this.threadPanels.captureSessions(),
      activeTarget: this.resolveActiveTarget()
    };

    this.enabled = true;
    await vscode.commands.executeCommand("setContext", "tieba.bossModeEnabled", true);

    this.forumPanels.disposeAll();
    this.threadPanels.disposeAll();

    await vscode.commands.executeCommand("workbench.view.extension.tieba");
    await this.openFakeEditors();
  }

  private async disable(): Promise<void> {
    await this.closeFakeEditors();
    await vscode.commands.executeCommand("setContext", "tieba.bossModeEnabled", false);
    this.enabled = false;

    await vscode.commands.executeCommand("workbench.view.extension.tieba");
    await this.restoreSnapshot();
    this.snapshot = undefined;
  }

  private resolveActiveTarget(): BossModeSnapshot["activeTarget"] {
    const activeThreadId = this.threadPanels.getActiveThreadId();
    if (activeThreadId) {
      return {
        kind: "thread",
        id: activeThreadId
      };
    }

    const activeForumName = this.forumPanels.getActiveForumName();
    if (activeForumName) {
      return {
        kind: "forum",
        id: activeForumName
      };
    }

    return undefined;
  }

  private async restoreSnapshot(): Promise<void> {
    if (!this.snapshot) {
      return;
    }

    const activeTarget = this.snapshot.activeTarget;
    const activeForum =
      activeTarget?.kind === "forum"
        ? this.snapshot.forums.find((session) => session.forum.forumName === activeTarget.id)
        : undefined;
    const activeThread =
      activeTarget?.kind === "thread"
        ? this.snapshot.threads.find((session) => session.thread.threadId === activeTarget.id)
        : undefined;

    for (const session of this.snapshot.forums) {
      if (activeForum && session.forum.forumName === activeForum.forum.forumName) {
        continue;
      }

      this.forumPanels.open(session.forum, {
        page: session.page,
        preserveFocus: true
      });
    }

    for (const session of this.snapshot.threads) {
      if (activeThread && session.thread.threadId === activeThread.thread.threadId) {
        continue;
      }

      await this.threadPanels.open(session.thread, {
        page: session.page,
        onlyLz: session.onlyLz,
        lastFullPageBeforeOnlyLz: session.lastFullPageBeforeOnlyLz,
        preserveFocus: true,
        recordHistory: false
      });
    }

    if (activeForum) {
      this.forumPanels.open(activeForum.forum, {
        page: activeForum.page
      });
      return;
    }

    if (activeThread) {
      await this.threadPanels.open(activeThread.thread, {
        page: activeThread.page,
        onlyLz: activeThread.onlyLz,
        lastFullPageBeforeOnlyLz: activeThread.lastFullPageBeforeOnlyLz,
        recordHistory: false
      });
    }
  }

  private async openFakeEditors(): Promise<void> {
    const mainFile = this.fakeFileUris[1];
    const sideFile = this.fakeFileUris[2];

    const mainDocument = await vscode.workspace.openTextDocument(mainFile);
    await vscode.window.showTextDocument(mainDocument, {
      viewColumn: vscode.ViewColumn.Active,
      preview: false
    });

    const sideDocument = await vscode.workspace.openTextDocument(sideFile);
    await vscode.window.showTextDocument(sideDocument, {
      viewColumn: vscode.ViewColumn.Beside,
      preview: false,
      preserveFocus: true
    });
  }

  private async closeFakeEditors(): Promise<void> {
    const tabs = vscode.window.tabGroups.all.flatMap((group) =>
      group.tabs.filter((tab) => {
        return tab.input instanceof vscode.TabInputText && this.isFakeBossFile(tab.input.uri);
      })
    );

    if (tabs.length === 0) {
      return;
    }

    await vscode.window.tabGroups.close(tabs, true);
  }

  private isFakeBossFile(uri: vscode.Uri): boolean {
    const target = normalizeFsPath(uri.fsPath);
    const root = normalizeFsPath(this.fakeRootUri.fsPath);
    return target === root || target.startsWith(`${root}\\`) || target.startsWith(`${root}/`);
  }
}

function normalizeFsPath(value: string): string {
  return value.replace(/\//g, "\\").toLocaleLowerCase("en-US");
}
