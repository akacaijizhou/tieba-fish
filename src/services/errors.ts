export type TiebaErrorCode = "auth" | "bridge" | "captcha" | "network" | "parse" | "unknown";

export class TiebaError extends Error {
  constructor(
    readonly code: TiebaErrorCode,
    message: string,
    readonly causeValue?: unknown
  ) {
    super(message);
    this.name = "TiebaError";
  }
}
