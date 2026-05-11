import * as vscode from "vscode";
import { TiebaService } from "../services/tiebaService";
import { ActionTreeItem, EmptyTreeItem, InfoTreeItem, ThreadTreeItem } from "./treeItems";

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
      const items: vscode.TreeItem[] = [new EmptyTreeItem("还没有收藏的帖子")];
      const readingSession = this.service.getReadingSession();
      const forums = this.service.listForums();

      if (readingSession) {
        items.push(
          new InfoTreeItem("看到想留的帖子时再点收藏", "收藏更适合沉淀资料贴、长帖和想回看的内容。"),
          new ActionTreeItem("继续阅读", "tieba.continueReading", undefined, "history", "回到上次停下的帖子")
        );
        return items;
      }

      if (forums.length > 0) {
        items.push(
          new InfoTreeItem("先打开一个帖子看看", "帖子页顶部会提供收藏入口。"),
          new ActionTreeItem(`打开 ${forums[0].displayName} 吧`, "tieba.openForum", [forums[0]], "arrow-right", "从这个吧开始找内容"),
          new ActionTreeItem("粘贴帖子链接", "tieba.openThreadByUrl", undefined, "link-external", "直接打开一个帖子")
        );
        return items;
      }

      items.push(
        new InfoTreeItem("先开始阅读，再把想留的帖子收进这里", "收藏会按时间倒序显示，适合做稍后读入口。"),
        new ActionTreeItem("开始看帖", "tieba.quickStart", undefined, "play", "输入吧名或粘贴帖子链接"),
        new ActionTreeItem("打开首页", "tieba.openOnboarding", undefined, "home", "看当前最适合的下一步")
      );
      return items;
    }

    return favorites.map((entry) => new ThreadTreeItem(entry.thread));
  }
}
