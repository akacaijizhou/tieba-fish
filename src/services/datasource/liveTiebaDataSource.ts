import { ForumThreadPage, PostCommentsPage, ThreadDetailPage } from "../../models/tieba";
import { TiebaError } from "../errors";
import { parseForumThreads, parseThreadDetail } from "../parser/tiebaParser";
import { TiebaDataSource } from "./tiebaDataSource";

const BROWSER_HEADERS: Record<string, string> = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.8"
};

export class LiveTiebaDataSource implements TiebaDataSource {
  constructor(private readonly getCookie: () => Promise<string | undefined>) {}

  async getForumThreads(input: { forumName: string; page: number }): Promise<ForumThreadPage> {
    const sourceUrl = buildForumUrl(input.forumName, input.page);
    const html = await fetchText(sourceUrl, this.getCookie);
    return parseForumThreads(html, input.forumName, input.page, sourceUrl);
  }

  async getThreadDetail(input: {
    threadId: string;
    forumName?: string;
    page: number;
    sourceUrl?: string;
    onlyLz?: boolean;
  }): Promise<ThreadDetailPage> {
    const sourceUrl = input.sourceUrl ?? buildThreadUrl(input.threadId, input.page, input.onlyLz);
    const html = await fetchText(sourceUrl, this.getCookie);
    const detail = parseThreadDetail(html, input.threadId, input.forumName, input.page, sourceUrl);
    return {
      ...detail,
      onlyLz: !!input.onlyLz
    };
  }

  async getPostComments(_input: { threadId: string; postId: string; page?: number }): Promise<PostCommentsPage> {
    throw new TiebaError("parse", "当前网页回退路径暂不支持单独加载楼中楼。");
  }
}

export function buildForumUrl(forumName: string, page = 1): string {
  const pn = Math.max(0, page - 1) * 50;
  return `https://tieba.baidu.com/f?kw=${encodeURIComponent(forumName)}&pn=${pn}`;
}

export function buildThreadUrl(threadId: string, page = 1, onlyLz = false): string {
  return `https://tieba.baidu.com/p/${encodeURIComponent(threadId)}?pn=${page}${onlyLz ? "&see_lz=1" : ""}`;
}

async function fetchText(url: string, getCookie: () => Promise<string | undefined>): Promise<string> {
  try {
    const cookie = await getCookie();
    const headers = {
      ...BROWSER_HEADERS,
      ...(cookie ? { cookie } : {})
    };
    const response = await fetch(url, {
      headers
    });

    if (!response.ok) {
      throw new TiebaError("network", `请求失败，HTTP ${response.status}`);
    }

    return await response.text();
  } catch (error) {
    if (error instanceof TiebaError) {
      throw error;
    }
    throw new TiebaError("network", "请求贴吧页面失败。", error);
  }
}
