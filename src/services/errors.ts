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

const INSTALLABLE_AIOTIEBA_PATTERNS = [/当前没有安装 aiotieba/u, /aiotieba 安装不完整/u];

export function shouldOfferAiotiebaInstall(error: TiebaError): boolean {
  const causeObject = asObject(error.causeValue);
  const candidates = [error, error.causeValue, causeObject?.bridgeError, causeObject?.causeValue];
  return candidates.some((candidate) => matchesInstallableAiotiebaMessage(candidate));
}

function matchesInstallableAiotiebaMessage(value: unknown): boolean {
  const objectValue = asObject(value);
  const message = typeof value === "string" ? value : typeof objectValue?.message === "string" ? objectValue.message : "";
  return INSTALLABLE_AIOTIEBA_PATTERNS.some((pattern) => pattern.test(message));
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  return value as Record<string, unknown>;
}
