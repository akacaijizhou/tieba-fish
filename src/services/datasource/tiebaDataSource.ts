import { ForumThreadPage, PostCommentsPage, ThreadDetailPage } from "../../models/tieba";

export interface TiebaDataSource {
  getForumThreads(input: { forumName: string; page: number }): Promise<ForumThreadPage>;
  getThreadDetail(input: {
    threadId: string;
    forumName?: string;
    page: number;
    sourceUrl?: string;
    onlyLz?: boolean;
  }): Promise<ThreadDetailPage>;
  getPostComments(input: {
    threadId: string;
    postId: string;
    page?: number;
  }): Promise<PostCommentsPage>;
}
