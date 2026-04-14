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
          new InfoTreeItem("先导入登录态，或者直接手动添加", "导入完整 Cookie 后也能同步贴吧账号里的关注吧。"),
          new ActionTreeItem("导入登录态", "tieba.configureAccount", undefined, "key", "先把登录态导进来"),
          new ActionTreeItem("添加贴吧", "tieba.addForum", undefined, "add", "不等登录也能先开始看")
        );
        return items;
      }

      if (!status.hasStoken) {
        items.push(
          new InfoTreeItem("现在能看帖，但还不能同步关注吧", "补齐完整 Cookie 后，就能同步贴吧账号里的关注吧。"),
          new ActionTreeItem("补齐完整 Cookie", "tieba.configureAccount", undefined, "key", "补上 STOKEN"),
          new ActionTreeItem("添加贴吧", "tieba.addForum", undefined, "add", "先手动加一个吧")
        );
        return items;
      }

      items.push(
        new InfoTreeItem("下一步先把内容加进来", "可以直接同步关注吧，也可以先手动添加一个吧。"),
        new ActionTreeItem("同步关注吧", "tieba.syncFollowedForums", undefined, "refresh", "把贴吧账号里的关注吧导进来"),
        new ActionTreeItem("添加贴吧", "tieba.addForum", undefined, "add", "先手动加一个吧")
      );
      return items;
    }

    return forums.map((forum) => new ForumTreeItem(forum, "tieba.forum"));
  }
}
