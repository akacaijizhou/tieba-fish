import * as vscode from "vscode";
import { TiebaService } from "../services/tiebaService";
import { CompactThreadTreeItem, EmptyTreeItem, InfoTreeItem, PaginationTreeItem } from "./treeItems";

export class LatestViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();

  readonly onDidChangeTreeData = this.changeEmitter.event;

  constructor(private readonly service: TiebaService) {}

  refresh(): void {
    this.changeEmitter.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.ProviderResult<vscode.TreeItem[]> {
    const snapshot = this.service.getLatestThreads();
    if (!snapshot) {
      return [new EmptyTreeItem("点开一个关注吧，这里显示它的最新帖子")];
    }

    const items: vscode.TreeItem[] = [
      new InfoTreeItem(
        `${snapshot.forumName}吧`,
        `第 ${snapshot.page}${snapshot.pageCount ? ` / ${snapshot.pageCount}` : ""} 页`
      )
    ];

    if (snapshot.threads.length === 0) {
      items.push(new EmptyTreeItem("这一页没有帖子"));
    } else {
      items.push(...snapshot.threads.map((thread) => new CompactThreadTreeItem(thread)));
    }

    const navigation: vscode.TreeItem[] = [];
    if (snapshot.page > 1) {
      navigation.push(new PaginationTreeItem("上一页", "tieba.latestPreviousPage", "arrow-left"));
    }
    if (!snapshot.pageCount || snapshot.page < snapshot.pageCount) {
      navigation.push(new PaginationTreeItem("下一页", "tieba.latestNextPage", "arrow-right"));
    }

    if (navigation.length > 0) {
      items.push(...navigation);
    }

    return items;
  }
}
