import * as vscode from "vscode";
import { TiebaService } from "../services/tiebaService";
import { EmptyTreeItem, LoadingTreeItem, ThreadTreeItem } from "./treeItems";

export class HistoryViewProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
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
      return [new LoadingTreeItem("正在加载历史...")];
    }

    const history = this.service.listHistory();
    if (history.length === 0) {
      return [new EmptyTreeItem("最近还没有浏览记录")];
    }

    return history.map((entry) => new ThreadTreeItem(entry.thread));
  }
}
