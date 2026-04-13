import * as vscode from "vscode";
import { TiebaService } from "../services/tiebaService";
import { EmptyTreeItem, ThreadTreeItem } from "./treeItems";

export class HistoryViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
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
    const history = this.service.listHistory();
    if (history.length === 0) {
      return [new EmptyTreeItem("最近还没有浏览记录")];
    }

    return history.map((entry) => new ThreadTreeItem(entry.thread));
  }
}
