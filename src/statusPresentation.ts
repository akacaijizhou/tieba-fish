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
      ? "当前还没有 Python，结构化阅读主路径还没准备好。"
      : !report.bridge.available
        ? "Python 已经可用，但结构化阅读链路还缺 aiotieba。"
        : sourceKnown === "aiotieba"
          ? "当前优先走结构化阅读。"
          : sourceKnown === "web"
            ? "当前能正常用，但最近一次走的是网页回退。"
            : "打开一个吧或帖子后，这里会显示实际使用的链路。";

  return {
    readingLabel: !report.bridge.pythonAvailable
      ? "先装 Python"
      : !report.bridge.available
        ? "先装 aiotieba"
        : report.hasBduss
          ? "可直接阅读"
          : "匿名可读",
    readingDescription: !report.bridge.pythonAvailable
      ? "先把 Python 装好，再回来安装 aiotieba。"
      : !report.bridge.available
        ? "当前还能用网页回退，但结构化阅读还没装好。"
        : report.hasBduss
          ? "阅读已经可用，不需要再先理解 BDUSS 或 STOKEN。"
          : "不导入登录态也能试用，但稳定性会差一些。",
    syncLabel: report.hasBduss && report.hasStoken
      ? "可以同步"
      : report.hasBduss
        ? "补齐完整 Cookie 后可同步"
        : "导入登录态后可同步",
    syncDescription: report.hasBduss && report.hasStoken
      ? "现在可以把贴吧账号里的关注吧直接导进来。"
      : report.hasBduss
        ? "当前还缺 STOKEN，所以同步关注吧还不能用。"
        : "先导入完整 Cookie，再同步关注吧。",
    sourceLabel: !report.bridge.pythonAvailable
      ? "还没准备好"
      : !report.bridge.available
        ? "等待安装 aiotieba"
        : sourceKnown === "aiotieba"
          ? "结构化阅读"
          : sourceKnown === "web"
            ? "网页回退"
            : "等待首次读取",
    sourceDescription,
    loginLabel: !report.hasBduss
      ? "还没导入"
      : !report.hasStoken
        ? "基础登录态"
        : report.hasCookie
          ? "完整登录态 + Cookie"
          : "完整登录态",
    loginDescription: !report.hasBduss
      ? "当前处于匿名状态。"
      : !report.hasStoken
        ? "现在能看帖，但还不能同步关注吧。"
        : report.hasCookie
          ? "结构化阅读和网页回退都会更稳。"
          : "结构化阅读和同步已经都可用。"
  };
}
