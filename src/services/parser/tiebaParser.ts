import * as cheerio from "cheerio";
import { ForumThreadPage, PostItem, ThreadDetailPage, ThreadSummary } from "../../models/tieba";
import { TiebaError } from "../errors";

const THREAD_ID_REGEX = /\/p\/(\d+)/;
const DATE_LIKE_REGEX = /\d{1,4}[-/.:月]\d{1,2}|\d{1,2}:\d{2}/;

function normalizeHtml(html: string): string {
  return html.replace(/\r\n/g, "\n");
}

function normalizeText(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  return normalized || undefined;
}

function decodeDataField(raw: string | undefined): Record<string, unknown> {
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function readString(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      const normalized = normalizeText(value);
      if (normalized) {
        return normalized;
      }
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return undefined;
}

function readNumber(record: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function readBoolean(record: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "number") {
      return value > 0;
    }
    if (typeof value === "string") {
      if (value === "1" || value.toLowerCase() === "true") {
        return true;
      }
      if (value === "0" || value.toLowerCase() === "false") {
        return false;
      }
    }
  }
  return undefined;
}

function nestedRecord(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function absoluteUrl(value: string | undefined): string | undefined {
  const normalized = normalizeText(value);
  if (!normalized) {
    return undefined;
  }

  if (normalized.startsWith("//")) {
    return `https:${normalized}`;
  }

  if (normalized.startsWith("/")) {
    return `https://tieba.baidu.com${normalized}`;
  }

  return normalized;
}

function pickFirstText(
  $: cheerio.CheerioAPI,
  root: cheerio.Cheerio<any>,
  selectors: string[]
): string | undefined {
  for (const selector of selectors) {
    const text = normalizeText(root.find(selector).first().text());
    if (text) {
      return text;
    }
  }
  return undefined;
}

function findPageCount($: cheerio.CheerioAPI): number | undefined {
  const links = $("a").toArray();
  let maxPage: number | undefined;
  for (const link of links) {
    const href = $(link).attr("href") ?? "";
    const match = href.match(/(?:pn|see_lz|page)=([0-9]+)/);
    if (!match) {
      continue;
    }

    const page = Number(match[1]);
    if (Number.isFinite(page)) {
      maxPage = Math.max(maxPage ?? page, page);
    }
  }
  return maxPage;
}

function parseLooseDateLabel(values: string[]): string | undefined {
  return values.map(normalizeText).find((value): value is string => Boolean(value && DATE_LIKE_REGEX.test(value)));
}

function sanitizeContent(contentNode: cheerio.Cheerio<any>): {
  contentHtml: string;
  contentText: string | undefined;
  imageUrls: string[];
  quoteBlocks: string[];
} {
  const $content = cheerio.load(`<div id="tieba-reader-root">${contentNode.html() ?? ""}</div>`);
  const root = $content("#tieba-reader-root");

  root.find("script,style,iframe,video,embed,object,form,input,button,textarea,select").remove();
  root
    .find(".voice_player,.core_reply_tail,.lzl_panel_wrapper,.save_face_bg,.d_post_content_diggbury,.user-hide-post-action")
    .remove();

  root.find("a").each((_, element) => {
    const node = $content(element);
    const href = absoluteUrl(node.attr("href"));
    node.removeAttr("class").removeAttr("style").removeAttr("onclick").removeAttr("data-field");
    if (href) {
      node.attr("href", href);
    } else {
      node.removeAttr("href");
    }
  });

  const imageUrls: string[] = [];
  root.find("img").each((_, element) => {
    const node = $content(element);
    const src = absoluteUrl(node.attr("data-original") ?? node.attr("bpic") ?? node.attr("src"));
    node.removeAttr("class").removeAttr("style").removeAttr("onclick").removeAttr("data-original").removeAttr("bpic");
    if (src) {
      node.attr("src", src);
      imageUrls.push(src);
    } else {
      node.remove();
    }
  });

  root.find("*").each((_, element) => {
    const node = $content(element);
    const tag = (element as { tagName?: string }).tagName?.toLowerCase();
    const allowedAttrs =
      tag === "a" ? new Set(["href"]) : tag === "img" ? new Set(["src", "alt", "title"]) : new Set<string>();

    Object.keys((element as { attribs?: Record<string, string> }).attribs ?? {}).forEach((attr) => {
      if (!allowedAttrs.has(attr)) {
        node.removeAttr(attr);
      }
    });
  });

  const quoteBlocks = root
    .find("blockquote,.quote,.d_post_content_quote")
    .toArray()
    .map((element) => normalizeText($content(element).text()))
    .filter((value): value is string => Boolean(value));

  const contentHtml = root.html()?.trim();
  const contentText = normalizeText(root.text());

  return {
    contentHtml: contentHtml || "",
    contentText,
    imageUrls,
    quoteBlocks
  };
}

function parseCommentsPreview($: cheerio.CheerioAPI, node: cheerio.Cheerio<any>): PostItem["commentsPreview"] {
  const items: NonNullable<PostItem["commentsPreview"]>["items"] = [];

  for (const element of node.find(".lzl_single_post,.lzl-post,.j_lzl_single_post").toArray()) {
    const item = $(element);
    const authorName = normalizeText(item.find(".j_user_card,.lzl_content_reply,.lzl_author_name").first().text());
    const replyToName = parseCommentReplyToName($, item, authorName);
    const contentNode = item.find(".lzl_content_main,.lzl_content_reply").last();
    const sanitized = sanitizeContent(contentNode);
    if (!authorName || (!sanitized.contentHtml && !sanitized.contentText)) {
      continue;
    }

    items.push({
      authorName,
      contentHtml: sanitized.contentHtml || escapeHtml(sanitized.contentText || ""),
      contentText: sanitized.contentText,
      ...(replyToName ? { replyToName } : {})
    });

    if (items.length >= 3) {
      break;
    }
  }

  if (items.length === 0) {
    return undefined;
  }

  const totalText = normalizeText(node.find(".j_lzl_r p,.lzl_cnt").first().text());
  const totalMatch = totalText?.match(/\d+/);

  return {
    total: totalMatch ? Number(totalMatch[0]) : items.length,
    items
  };
}

function parseCommentReplyToName(
  $: cheerio.CheerioAPI,
  item: cheerio.Cheerio<any>,
  authorName?: string
): string | undefined {
  const replyNode = item.find(".lzl_content_reply").first();
  const explicitTarget =
    normalizeText(replyNode.find(".j_user_card,a").first().attr("username") ?? "") ??
    normalizeText(replyNode.find(".j_user_card,a").first().text());
  if (explicitTarget && explicitTarget !== authorName) {
    return stripAtPrefix(explicitTarget);
  }

  const replyText = normalizeText(replyNode.text());
  const matched = replyText?.match(/^回复\s+(.+?)(?:\s*[:：]|$)/u);
  if (!matched?.[1]) {
    return undefined;
  }

  const target = stripAtPrefix(normalizeText(matched[1]) ?? "");
  return target && target !== authorName ? target : undefined;
}

function stripAtPrefix(value: string): string {
  return value.replace(/^@+/, "").trim();
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseThreadCard(
  $: cheerio.CheerioAPI,
  node: cheerio.Cheerio<any>,
  forumName: string
): ThreadSummary | undefined {
  const field = decodeDataField(node.attr("data-field"));
  const anchor = node.find(".j_th_tit, .threadlist_title a, a[href*='/p/']").first();
  const href = anchor.attr("href") ?? "";
  const threadIdMatch = href.match(THREAD_ID_REGEX);
  const threadId = String(readString(field, "id", "tid", "thread_id") ?? threadIdMatch?.[1] ?? "").trim();
  const title = normalizeText(anchor.text());

  if (!threadId || !title) {
    return undefined;
  }

  const replyCount =
    readNumber(field, "reply_num", "reply_num_v2", "reply_num_now") ??
    Number(normalizeText(node.find(".threadlist_rep_num").first().text()) ?? 0);

  const authorName =
    readString(field, "author_name", "author") ??
    pickFirstText($, node, [".frs-author-name", ".tb_icon_author", ".threadlist_author a"]) ??
    "Tieba";

  const excerpt = normalizeText(
    node.find(".threadlist_abs, .threadlist_text, .threadlist_desc").first().text()
  );

  const lastReplyLabel = parseLooseDateLabel([
    node.find(".threadlist_reply_date,.pull_right,.threadlist_lz .pull_right").first().text(),
    readString(field, "last_time", "last_reply_time", "reply_time") ?? ""
  ]);

  const lastReplyAuthor = normalizeText(
    pickFirstText($, node, [".tb_icon_author_rely", ".threadlist_author_pull_right", ".threadlist_author"])
  );

  const pageCount = readNumber(field, "page_num", "page_count", "pages");
  const isTop = readBoolean(field, "is_top", "top") ?? node.find(".icon_top,.thread_top").length > 0;
  const isGood = readBoolean(field, "is_good", "is_digest", "good") ?? node.find(".icon_good,.digest_icon").length > 0;
  const url = absoluteUrl(href) ?? `https://tieba.baidu.com/p/${threadId}`;

  return {
    threadId,
    forumName,
    title,
    authorName,
    replyCount: Number.isFinite(replyCount) ? replyCount : 0,
    pageCount,
    lastReplyAuthor,
    lastReplyAt: undefined,
    lastReplyLabel,
    excerpt,
    isTop,
    isGood,
    url
  };
}

export function isCaptchaPage(html: string): boolean {
  return /百度安全验证|BIOC_OPTIONS|bfe_captcha/i.test(html);
}

export function parseForumThreads(html: string, forumName: string, page: number, sourceUrl: string): ForumThreadPage {
  const normalized = normalizeHtml(html);
  if (isCaptchaPage(normalized)) {
    throw new TiebaError("captcha", "贴吧返回了安全验证页面，当前无法直接抓取。");
  }

  const $ = cheerio.load(normalized);
  const threadItems = $(".j_thread_list, .threadlist_li, li[data-field]")
    .toArray()
    .map((element) => parseThreadCard($, $(element), forumName))
    .filter((value): value is ThreadSummary => Boolean(value));

  if (threadItems.length === 0) {
    throw new TiebaError("parse", "成功拿到页面，但没有解析出帖子列表。");
  }

  return {
    forumName,
    page,
    pageCount: findPageCount($),
    threads: threadItems,
    sourceUrl
  };
}

function parseFloor(
  $: cheerio.CheerioAPI,
  node: cheerio.Cheerio<any>,
  contentField: Record<string, unknown>,
  index: number
): number {
  const fieldFloor = readNumber(contentField, "post_no", "floor_num", "floor");
  if (fieldFloor) {
    return fieldFloor;
  }

  const floorText = node
    .find(".tail-info")
    .toArray()
    .map((item) => normalizeText($(item).text()))
    .find((text): text is string => Boolean(text && /楼$/.test(text)));

  const floorNumber = floorText ? Number(floorText.replace(/[^\d]/g, "")) : Number.NaN;
  return Number.isFinite(floorNumber) ? floorNumber : index + 1;
}

function parsePostItems($: cheerio.CheerioAPI): PostItem[] {
  const posts: PostItem[] = [];

  $(".l_post, .j_l_post").each((index, element) => {
    const node = $(element);
    const field = decodeDataField(node.attr("data-field"));
    const authorField = nestedRecord(field, "author");
    const contentField = nestedRecord(field, "content");
    const contentNode = node.find(".d_post_content, .j_d_post_content").first();
    if (contentNode.length === 0) {
      return;
    }

    const sanitized = sanitizeContent(contentNode);
    if (!sanitized.contentHtml) {
      return;
    }

    const tailInfoTexts = node
      .find(".post-tail-wrap .tail-info, .tail-info")
      .toArray()
      .map((item) => normalizeText($(item).text()))
      .filter((value): value is string => Boolean(value));

    const createdAtLabel =
      readString(contentField, "date", "created_at", "create_time") ?? parseLooseDateLabel(tailInfoTexts);

    posts.push({
      postId: readString(contentField, "post_id", "id", "spid") ?? readString(field, "spid", "post_id") ?? `post-${index + 1}`,
      floor: parseFloor($, node, contentField, index),
      authorName:
        readString(authorField, "user_name", "name", "show_nickname") ??
        pickFirstText($, node, [".d_name", ".p_author_name", ".j_user_card"]) ??
        "Tieba",
      authorId: readString(authorField, "user_id", "portrait"),
      createdAt: undefined,
      createdAtLabel,
      contentHtml: sanitized.contentHtml,
      contentText: sanitized.contentText,
      imageUrls: sanitized.imageUrls,
      quoteBlocks: sanitized.quoteBlocks,
      commentsPreview: parseCommentsPreview($, node)
    });
  });

  const threadAuthorName = posts[0]?.authorName;
  const threadAuthorId = posts[0]?.authorId;

  return posts.map((post) => ({
    ...post,
    isLz:
      (threadAuthorId && post.authorId ? post.authorId === threadAuthorId : undefined) ??
      (threadAuthorName ? post.authorName === threadAuthorName : undefined)
  }));
}

export function parseThreadDetail(
  html: string,
  threadId: string,
  forumName: string | undefined,
  page: number,
  sourceUrl: string
): ThreadDetailPage {
  const normalized = normalizeHtml(html);
  if (isCaptchaPage(normalized)) {
    throw new TiebaError("captcha", "贴吧返回了安全验证页面，当前无法直接抓取帖子详情。");
  }

  const $ = cheerio.load(normalized);
  const posts = parsePostItems($);

  if (posts.length === 0) {
    throw new TiebaError("parse", "成功拿到帖子页面，但没有解析出楼层内容。");
  }

  const title =
    pickFirstText($, $("body"), [".core_title_txt", "h1"]) ??
    normalizeText($("title").first().text()) ??
    `帖子 ${threadId}`;

  const actualForumName =
    forumName ||
    pickFirstText($, $("body"), [".card_title a", ".forum_name a", ".card_title_fname"]) ||
    "贴吧";

  return {
    threadId,
    title,
    forumName: actualForumName,
    threadAuthorName: posts[0]?.authorName,
    threadAuthorId: posts[0]?.authorId,
    page,
    pageCount: findPageCount($),
    posts,
    sourceUrl
  };
}
