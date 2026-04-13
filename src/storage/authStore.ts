import * as vscode from "vscode";

const TIEBA_COOKIE_SECRET_KEY = "tieba.cookie";
const TIEBA_BDUSS_SECRET_KEY = "tieba.bduss";
const TIEBA_STOKEN_SECRET_KEY = "tieba.stoken";

export interface TiebaAccountAuth {
  bduss?: string;
  stoken?: string;
}

export class AuthStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async getAccountAuth(): Promise<TiebaAccountAuth> {
    const [bduss, stoken] = await Promise.all([
      this.context.secrets.get(TIEBA_BDUSS_SECRET_KEY),
      this.context.secrets.get(TIEBA_STOKEN_SECRET_KEY)
    ]);

    return {
      bduss: bduss?.trim() || undefined,
      stoken: stoken?.trim() || undefined
    };
  }

  async hasBduss(): Promise<boolean> {
    const auth = await this.getAccountAuth();
    return Boolean(auth.bduss);
  }

  async setAccountAuth(input: { bduss: string; stoken?: string }): Promise<void> {
    await this.context.secrets.store(TIEBA_BDUSS_SECRET_KEY, input.bduss.trim());
    if (input.stoken?.trim()) {
      await this.context.secrets.store(TIEBA_STOKEN_SECRET_KEY, input.stoken.trim());
      return;
    }

    await this.context.secrets.delete(TIEBA_STOKEN_SECRET_KEY);
  }

  async clearAccountAuth(): Promise<void> {
    await Promise.all([
      this.context.secrets.delete(TIEBA_BDUSS_SECRET_KEY),
      this.context.secrets.delete(TIEBA_STOKEN_SECRET_KEY)
    ]);
  }

  async getCookie(): Promise<string | undefined> {
    const cookie = await this.context.secrets.get(TIEBA_COOKIE_SECRET_KEY);
    return cookie?.trim() || undefined;
  }

  async hasCookie(): Promise<boolean> {
    return Boolean(await this.getCookie());
  }

  async setCookie(cookie: string): Promise<void> {
    await this.context.secrets.store(TIEBA_COOKIE_SECRET_KEY, cookie.trim());
  }

  async clearCookie(): Promise<void> {
    await this.context.secrets.delete(TIEBA_COOKIE_SECRET_KEY);
  }
}
