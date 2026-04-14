import * as vscode from "vscode";
import { TiebaService } from "../services/tiebaService";
import { ActionTreeItem, CompactThreadTreeItem, EmptyTreeItem, InfoTreeItem, LoadingTreeItem, PaginationTreeItem } from "./treeItems";

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

  async getChildren(): Promise<vscode.TreeItem[]> {
    if (this.isLoading) {
      return [new LoadingTreeItem("正在加载最近列表...")];
    }

    const snapshot = this.service.getLatestThreads();
    if (!snapshot) {
      const forums = this.service.listForums();
      const items: vscode.TreeItem[] = [new EmptyTreeItem("这里还没有最近内容")];

      if (forums.length > 0) {
        items.push(
          new InfoTreeItem("先点开一个关注吧", "这里显示的是最近一次打开的吧的帖子列表，不是全站聚合流。"),
          new ActionTreeItem(`打开 ${forums[0].displayName} 吧`, "tieba.openForum", [forums[0]], "arrow-right", "直接加载一份最近列表")
        );
        return items;
      }

      const status = await this.service.getStatusSnapshot();
      if (status.hasStoken) {
        items.push(
          new InfoTreeItem("先把关注吧准备好", "同步关注吧后，这里才会出现最近一次加载的帖子列表。"),
          new ActionTreeItem("同步关注吧", "tieba.syncFollowedForums", undefined, "refresh", "先导入贴吧账号里的关注吧"),
          new ActionTreeItem("添加贴吧", "tieba.addForum", undefined, "add", "先手动添加一个吧")
        );
        return items;
      }

      items.push(
        new InfoTreeItem("先添加一个贴吧，再点开它", "只要打开过一个关注吧，这里就会出现对应的最近列表。"),
        new ActionTreeItem("添加贴吧", "tieba.addForum", undefined, "add", "先加一个吧"),
        new ActionTreeItem("打开首页", "tieba.openOnboarding", undefined, "home", "看当前还差哪一步")
      );
      return items;
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
      items.push(
        new EmptyTreeItem("这一页没有帖子"),
        new InfoTreeItem(
          snapshot.page > 1 ? "可以继续翻页，或者回到上一页" : "可以刷新一次，或者回关注吧换一个吧",
          snapshot.page > 1 ? "底部保留了翻页入口。" : "如果这个吧暂时没内容，换个吧会更直接。"
        )
      );
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
