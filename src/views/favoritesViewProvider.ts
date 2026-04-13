import * as vscode from "vscode";
import { TiebaService } from "../services/tiebaService";
import { EmptyTreeItem, ThreadTreeItem } from "./treeItems";

export class FavoritesViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
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
    const favorites = this.service.listFavorites();
    if (favorites.length === 0) {
      return [new EmptyTreeItem("还没有收藏的帖子")];
    }

    return favorites.map((entry) => new ThreadTreeItem(entry.thread));
  }
}
