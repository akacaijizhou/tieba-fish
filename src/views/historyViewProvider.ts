import * as vscode from "vscode";
import { TiebaService } from "../services/tiebaService";
import { ActionTreeItem, ContinueReadingTreeItem, EmptyTreeItem, InfoTreeItem, LoadingTreeItem, ThreadTreeItem } from "./treeItems";

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

  async getChildren(): Promise<vscode.TreeItem[]> {
    if (this.isLoading) {
      return [new LoadingTreeItem("正在加载历史...")];
    }

    const readingSession = this.service.getReadingSession();
    const history = this.service.listHistory();
    const items: vscode.TreeItem[] = [];

    if (readingSession) {
      items.push(new ContinueReadingTreeItem(readingSession));
    }

    if (history.length === 0) {
      const forums = this.service.listForums();
      items.push(new EmptyTreeItem("这里还没有浏览记录"));

      if (forums.length > 0) {
        items.push(
          new InfoTreeItem("先去打开一个帖子", "打开一个关注吧，再点开任意帖子，这里就会开始记录。"),
          new ActionTreeItem(`打开 ${forums[0].displayName} 吧`, "tieba.openForum", [forums[0]], "arrow-right", "从这个吧开始看"),
          new ActionTreeItem("粘贴帖子链接", "tieba.openThreadByUrl", undefined, "link-external", "有帖子链接时可直接打开")
        );
        return items;
      }

      const status = await this.service.getStatusSnapshot();
      if (status.hasStoken) {
        items.push(
          new InfoTreeItem("先把内容加进来", "同步关注吧或手动添加贴吧后，打开帖子就会产生历史记录。"),
          new ActionTreeItem("导入我关注的贴吧", "tieba.syncFollowedForums", undefined, "refresh", "先导入贴吧账号里的关注吧"),
          new ActionTreeItem("添加贴吧", "tieba.addForum", undefined, "add", "先手动添加一个吧")
        );
        return items;
      }

      items.push(
        new InfoTreeItem("先开始第一次阅读", "可以先添加贴吧，或者去首页看下一步建议。"),
        new ActionTreeItem("开始看帖", "tieba.quickStart", undefined, "play", "输入吧名或粘贴帖子链接"),
        new ActionTreeItem("粘贴帖子链接", "tieba.openThreadByUrl", undefined, "link-external", "直接打开一个帖子"),
        new ActionTreeItem("打开首页", "tieba.openOnboarding", undefined, "home", "看当前还差哪一步")
      );
      return items;
    }

    items.push(...history.map((entry) => new ThreadTreeItem(entry.thread)));
    return items;
  }
}
