import { TiebaDiagnosticsReport } from "./services/tiebaService";

export interface TiebaHumanStatus {
  readingLabel: string;
  readingDescription: string;
  syncLabel: string;
  syncDescription: string;
  sourceLabel: string;
  sourceDescription: string;
  loginLabel: string;
  loginDescription: string;
}

export function getTiebaHumanStatus(report: TiebaDiagnosticsReport): TiebaHumanStatus {
  const sourceKnown = report.lastResolvedSource;
  const sourceDescription =
    !report.bridge.pythonAvailable
      ? "可以先用基础模式阅读；想要更稳定时再安装阅读增强组件。"
      : !report.bridge.available
        ? "可以先用基础模式阅读；阅读增强组件可稍后安装。"
        : sourceKnown === "aiotieba"
          ? "当前正在使用更稳定的增强模式。"
          : sourceKnown === "web"
            ? "当前正在使用基础模式，能正常看帖。"
            : "打开一个吧或帖子后，这里会显示实际阅读模式。";

  return {
    readingLabel: !report.bridge.pythonAvailable
      ? "可先试用"
      : !report.bridge.available
        ? "可先试用"
        : report.hasBduss
          ? "可直接看帖"
          : "可先试读",
    readingDescription: !report.bridge.pythonAvailable
      ? "不用先配置环境，直接添加贴吧或粘贴帖子链接也能开始。"
      : !report.bridge.available
        ? "不用先安装增强组件，直接添加贴吧或粘贴帖子链接也能开始。"
        : report.hasBduss
          ? "阅读已经可用，日常直接从左侧入口打开即可。"
          : "不登录也能试用；想同步关注吧时再导入贴吧登录。",
    syncLabel: report.hasBduss && report.hasStoken
      ? "可以同步"
      : report.hasBduss
        ? "需要完整登录"
        : "登录后可同步",
    syncDescription: report.hasBduss && report.hasStoken
      ? "现在可以把贴吧账号里的关注吧直接导进来。"
      : report.hasBduss
        ? "如果同步失败，重新导入一次完整 Cookie。"
        : "只看帖可以跳过；想导入账号关注列表时再登录。",
    sourceLabel: !report.bridge.pythonAvailable
      ? "基础模式"
      : !report.bridge.available
        ? "基础模式"
        : sourceKnown === "aiotieba"
          ? "增强模式"
          : sourceKnown === "web"
            ? "基础模式"
            : "等待首次读取",
    sourceDescription,
    loginLabel: !report.hasBduss
      ? "未登录"
      : !report.hasStoken
        ? "已登录，待补完整 Cookie"
        : "已登录",
    loginDescription: !report.hasBduss
      ? "当前不影响试读。"
      : !report.hasStoken
        ? "现在能看帖；如果同步关注吧失败，再重新导入完整 Cookie。"
        : report.hasCookie
          ? "阅读和同步都会复用这份登录。"
          : "阅读和同步已经可用。"
  };
}
