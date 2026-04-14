import * as vscode from "vscode";
import { ForumSubscription, ReadingSession, ThreadSummary } from "../models/tieba";

export class ForumTreeItem extends vscode.TreeItem {
  constructor(
    readonly forum: ForumSubscription,
    readonly contextValueName: "tieba.forum"
  ) {
    super(forum.displayName, vscode.TreeItemCollapsibleState.None);
    this.description = "吧";
    this.contextValue = contextValueName;
    this.iconPath = new vscode.ThemeIcon("comment-discussion");
    this.command = {
      command: "tieba.openForum",
      title: "打开贴吧",
      arguments: [forum]
    };
  }
}

export class ThreadTreeItem extends vscode.TreeItem {
  constructor(readonly thread: ThreadSummary) {
    super(thread.title, vscode.TreeItemCollapsibleState.None);
    this.description = `${thread.forumName}吧`;
    this.tooltip = new vscode.MarkdownString(
      `**${thread.title}**\n\n作者：${thread.authorName}\n\n回复：${thread.replyCount}`
    );
    this.contextValue = "tieba.thread";
    this.iconPath = new vscode.ThemeIcon("note");
    this.command = {
      command: "tieba.openThread",
      title: "打开帖子",
      arguments: [thread]
    };
  }
}

export class CompactThreadTreeItem extends vscode.TreeItem {
  constructor(readonly thread: ThreadSummary) {
    super(thread.title, vscode.TreeItemCollapsibleState.None);
    this.description = `回复 ${thread.replyCount}`;
    this.tooltip = new vscode.MarkdownString(
      `**${thread.title}**\n\n${thread.forumName}吧\n\n作者：${thread.authorName}\n\n回复：${thread.replyCount}`
    );
    this.contextValue = "tieba.thread";
    this.iconPath = new vscode.ThemeIcon("chevron-right");
    this.command = {
      command: "tieba.openThread",
      title: "打开帖子",
      arguments: [thread]
    };
  }
}

export class PaginationTreeItem extends vscode.TreeItem {
  constructor(label: string, commandId: string, icon: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = "翻页";
    this.contextValue = "tieba.pagination";
    this.iconPath = new vscode.ThemeIcon(icon);
    this.command = {
      command: commandId,
      title: label
    };
  }
}

export class InfoTreeItem extends vscode.TreeItem {
  constructor(label: string, description?: string, tooltip?: string | vscode.MarkdownString) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.tooltip = tooltip;
    this.contextValue = "tieba.info";
    this.iconPath = new vscode.ThemeIcon("symbol-misc");
  }
}

export class ActionTreeItem extends vscode.TreeItem {
  constructor(label: string, commandId: string, args?: unknown[], icon = "arrow-right", description?: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.tooltip = description ? new vscode.MarkdownString(`**${label}**\n\n${description}`) : undefined;
    this.contextValue = "tieba.action";
    this.iconPath = new vscode.ThemeIcon(icon);
    this.command = {
      command: commandId,
      title: label,
      arguments: args
    };
  }
}

export class ContinueReadingTreeItem extends vscode.TreeItem {
  constructor(readonly session: ReadingSession) {
    super("继续阅读", vscode.TreeItemCollapsibleState.None);
    const modeLabel = session.onlyLz ? " · 只看楼主" : "";
    this.description = `${session.thread.forumName}吧 · 第 ${session.page} 页${modeLabel}`;
    this.tooltip = new vscode.MarkdownString(
      `**继续阅读**\n\n${session.thread.title}\n\n${session.thread.forumName}吧 · 第 ${session.page} 页${modeLabel}`
    );
    this.contextValue = "tieba.continueReading";
    this.iconPath = new vscode.ThemeIcon("history");
    this.command = {
      command: "tieba.continueReading",
      title: "继续阅读"
    };
  }
}

export class EmptyTreeItem extends vscode.TreeItem {
  constructor(label: string, commandId?: string, description?: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.tooltip = description ? new vscode.MarkdownString(`**${label}**\n\n${description}`) : undefined;
    this.contextValue = "tieba.empty";
    this.iconPath = new vscode.ThemeIcon("circle-large-outline");
    if (commandId) {
      this.command = {
        command: commandId,
        title: label
      };
    }
  }
}

export class LoadingTreeItem extends vscode.TreeItem {
  constructor(label = "正在加载...") {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "tieba.loading";
    this.iconPath = new vscode.ThemeIcon("loading~spin");
  }
}
