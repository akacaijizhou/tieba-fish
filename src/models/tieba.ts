export interface ForumSubscription {
  forumId?: string;
  forumName: string;
  displayName: string;
  addedAt: number;
}

export interface ThreadSummary {
  threadId: string;
  forumName: string;
  title: string;
  authorName: string;
  replyCount: number;
  pageCount?: number;
  lastReplyAuthor?: string;
  lastReplyAt?: number;
  lastReplyLabel?: string;
  excerpt?: string;
  isTop?: boolean;
  isGood?: boolean;
  url: string;
}

export interface ForumThreadPage {
  forumName: string;
  page: number;
  pageCount?: number;
  threads: ThreadSummary[];
  sourceUrl: string;
}

export interface LatestThreadsSnapshot extends ForumThreadPage {
  updatedAt: number;
}

export interface PostItem {
  postId: string;
  floor: number;
  authorName: string;
  authorId?: string;
  createdAt?: number;
  createdAtLabel?: string;
  contentHtml: string;
  contentText?: string;
  imageUrls: string[];
  quoteBlocks?: string[];
  commentsPreview?: {
    total: number;
    items: Array<{
      authorName: string;
      contentHtml: string;
      contentText?: string;
      isLz?: boolean;
    }>;
  };
  isLz?: boolean;
}

export interface PostCommentItem {
  authorName: string;
  authorId?: string;
  contentHtml: string;
  contentText?: string;
  createdAt?: number;
  createdAtLabel?: string;
  isLz?: boolean;
}

export interface PostCommentsPage {
  postId: string;
  page: number;
  pageCount?: number;
  hasPrev?: boolean;
  hasMore?: boolean;
  total: number;
  items: PostCommentItem[];
}

export type TiebaContentSource = "aiotieba" | "web";

export interface ThreadDetailPage {
  threadId: string;
  title: string;
  forumName: string;
  threadAuthorName?: string;
  threadAuthorId?: string;
  resolvedSource?: TiebaContentSource;
  page: number;
  pageCount?: number;
  onlyLz?: boolean;
  postCommentsSupported?: boolean;
  postCommentsHint?: string;
  posts: PostItem[];
  sourceUrl: string;
}

export interface FavoriteEntry {
  thread: ThreadSummary;
  favoritedAt: number;
}

export interface HistoryEntry {
  thread: ThreadSummary;
  lastOpenedAt: number;
}

export interface ReadingSession {
  thread: ThreadSummary;
  page: number;
  onlyLz?: boolean;
  lastFullPageBeforeOnlyLz?: number | null;
  updatedAt: number;
}

export type TiebaThemePreset = "default" | "minimal" | "document";
export type TiebaReadingDensity = "comfortable" | "compact";
export type TiebaReadingContrast = "soft" | "normal";

export interface TiebaSettings {
  showImages: boolean;
  density: TiebaReadingDensity;
  contrast: TiebaReadingContrast;
  compactMode: boolean;
  lowContrastMode: boolean;
  themePreset: TiebaThemePreset;
  cacheMinutes: number;
  maxHistory: number;
  openThreadMode: "active" | "beside";
  fallbackToBrowser: boolean;
}

export interface CacheEntry<T> {
  value: T;
  updatedAt: number;
  expiresAt: number;
  version: number;
}

export type OpenTarget =
  | ForumSubscription
  | ThreadSummary
  | {
      forumName: string;
      url?: string;
    };
