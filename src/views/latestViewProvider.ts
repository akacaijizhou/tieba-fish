import * as vscode from "vscode";
import { TiebaService } from "../services/tiebaService";
import { CompactThreadTreeItem, EmptyTreeItem, InfoTreeItem, LoadingTreeItem, PaginationTreeItem } from "./treeItems";

export class LatestViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  private isLoading = false;

  readonly onDidChangeTreeData = this.changeEmitter.event;

  constructor(private readonly service: TiebaService) {}

  refresh(): void {
    this.changeEmitter.fire();
  }

  setLoading(loading: boolean): void {
    if (this.isLoading === loading) {
      return;
    }

    this.isLoading = loading;
    this.refresh();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.ProviderResult<vscode.TreeItem[]> {
    if (this.isLoading) {
      return [new LoadingTreeItem("正在加载最新视图...")];
    }

    const snapshot = this.service.getLatestThreads();
    if (!snapshot) {
      return [new EmptyTreeItem("先点开一个关注吧，这里只显示该吧最近一次加载的帖子列表")];
    }

    const pageLabel = `第 ${snapshot.page}${snapshot.pageCount ? ` / ${snapshot.pageCount}` : ""} 页`;
    const items: vscode.TreeItem[] = [
      new InfoTreeItem(
        `当前来自 ${snapshot.forumName}吧`,
        `最近一次加载 · ${pageLabel}`,
        `这里只显示“${snapshot.forumName}吧”最近一次加载的帖子列表，不是全站聚合流。`
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
