import * as vscode from "vscode";
import { TiebaService } from "../services/tiebaService";
import { EmptyTreeItem, ForumTreeItem } from "./treeItems";

export class FollowedForumsProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
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
    const forums = this.service.listForums();
    if (forums.length === 0) {
      return [new EmptyTreeItem("还没有关注吧，点这里添加", "tieba.addForum")];
    }

    return forums.map((forum) => new ForumTreeItem(forum, "tieba.forum"));
  }
}
