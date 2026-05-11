import * as vscode from "vscode";
import { TiebaService } from "../services/tiebaService";
import { ActionTreeItem, EmptyTreeItem, ForumTreeItem, InfoTreeItem, LoadingTreeItem } from "./treeItems";

export class FollowedForumsProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
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
      return [new LoadingTreeItem("正在加载关注吧...")];
    }

    const forums = this.service.listForums();
    if (forums.length === 0) {
      const status = await this.service.getStatusSnapshot();
      const items: vscode.TreeItem[] = [new EmptyTreeItem("这里还没有关注吧")];

      if (!status.hasBduss) {
        items.push(
          new InfoTreeItem("先看起来，不需要先登录", "输入吧名或粘贴帖子链接就能开始；想同步账号关注吧时再登录。"),
          new ActionTreeItem("开始看帖", "tieba.quickStart", undefined, "play", "输入吧名或粘贴帖子链接"),
          new ActionTreeItem("导入贴吧登录", "tieba.configureAccount", undefined, "key", "同步账号关注吧时再用")
        );
        return items;
      }

      if (!status.hasStoken) {
        items.push(
          new InfoTreeItem("可以先手动添加贴吧", "如果同步关注吧失败，再重新导入一次完整 Cookie。"),
          new ActionTreeItem("开始看帖", "tieba.quickStart", undefined, "play", "输入吧名或粘贴帖子链接"),
          new ActionTreeItem("重新导入贴吧登录", "tieba.configureAccount", undefined, "key", "用于同步账号关注吧")
        );
        return items;
      }

      items.push(
        new InfoTreeItem("下一步先把内容加进来", "可以直接同步关注吧，也可以先手动添加一个吧。"),
        new ActionTreeItem("导入我关注的贴吧", "tieba.syncFollowedForums", undefined, "refresh", "把贴吧账号里的关注吧导进来"),
        new ActionTreeItem("添加贴吧", "tieba.addForum", undefined, "add", "先手动加一个吧")
      );
      return items;
    }

    return forums.map((forum) => new ForumTreeItem(forum, "tieba.forum"));
  }
}
