import * as path from "path";
import * as vscode from "vscode";

interface BossFileNode {
  uri: vscode.Uri;
  isDirectory: boolean;
  isRoot?: boolean;
}

export class BossFilesProvider implements vscode.TreeDataProvider<BossFileNode> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();

  readonly onDidChangeTreeData = this.changeEmitter.event;

  constructor(private readonly rootUri: vscode.Uri) {}

  refresh(): void {
    this.changeEmitter.fire();
  }

  getTreeItem(element: BossFileNode): vscode.TreeItem {
    const item = new vscode.TreeItem(
      path.basename(element.uri.fsPath),
      element.isDirectory
        ? element.isRoot
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );

    item.resourceUri = element.uri;

    if (!element.isDirectory) {
      item.command = {
        command: "vscode.open",
        title: "打开文件",
        arguments: [element.uri]
      };
    }

    return item;
  }

  async getChildren(element?: BossFileNode): Promise<BossFileNode[]> {
    if (!element) {
      return [
        {
          uri: this.rootUri,
          isDirectory: true,
          isRoot: true
        }
      ];
    }

    if (!element.isDirectory) {
      return [];
    }

    const entries = await vscode.workspace.fs.readDirectory(element.uri);
    return entries
      .filter(([name]) => !name.startsWith("."))
      .sort((left, right) => {
        const leftIsDirectory = left[1] === vscode.FileType.Directory;
        const rightIsDirectory = right[1] === vscode.FileType.Directory;
        if (leftIsDirectory !== rightIsDirectory) {
          return leftIsDirectory ? -1 : 1;
        }

        return left[0].localeCompare(right[0], "zh-CN");
      })
      .map(([name, type]) => ({
        uri: vscode.Uri.joinPath(element.uri, name),
        isDirectory: type === vscode.FileType.Directory
      }));
  }
}
