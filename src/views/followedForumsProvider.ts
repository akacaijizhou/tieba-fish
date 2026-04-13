import * as vscode from "vscode";
import { TiebaService } from "../services/tiebaService";
import { EmptyTreeItem, ForumTreeItem, LoadingTreeItem } from "./treeItems";

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

  getChildren(): vscode.ProviderResult<vscode.TreeItem[]> {
    if (this.isLoading) {
      return [new LoadingTreeItem("正在加载关注吧...")];
    }

    const forums = this.service.listForums();
    if (forums.length === 0) {
      return [new EmptyTreeItem("还没有关注吧，点这里添加", "tieba.addForum")];
    }

    return forums.map((forum) => new ForumTreeItem(forum, "tieba.forum"));
  }
}
