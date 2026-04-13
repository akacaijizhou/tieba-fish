import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { ForumThreadPage, PostCommentsPage, ThreadDetailPage } from "../../models/tieba";
import { TiebaAccountAuth } from "../../storage/authStore";
import { TiebaError, TiebaErrorCode } from "../errors";
import { TiebaDataSource } from "./tiebaDataSource";

interface BridgeRequest {
  action: "healthCheck" | "getForumThreads" | "getThreadDetail" | "getPostComments" | "resolveForumNames";
  auth: {
    bduss?: string;
    stoken?: string;
  };
  payload:
    | Record<string, never>
    | {
        forumName: string;
        page: number;
      }
    | {
        threadId: string;
        forumName?: string;
        page: number;
        sourceUrl?: string;
      }
    | {
        threadId: string;
        postId: string;
        page?: number;
      }
    | {
        names: string[];
      };
}

interface BridgeSuccess<T> {
  ok: true;
  result: T;
}

interface BridgeFailure {
  ok: false;
  error: {
    code?: string;
    message: string;
    details?: string;
  };
}

type BridgeResponse<T> = BridgeSuccess<T> | BridgeFailure;

export interface BridgeHealthCheckResult {
  available: boolean;
  version?: string;
  modulePath?: string;
  loadMode?: "installed" | "local";
}

export class PythonAiotiebaDataSource implements TiebaDataSource {
  private readonly scriptPath: string;

  constructor(
    context: vscode.ExtensionContext,
    private readonly getAuth: () => Promise<TiebaAccountAuth>,
    private readonly getPythonPath: () => string
  ) {
    this.scriptPath = path.join(context.extensionPath, "scripts", "aiotieba_bridge.py");
  }

  async getForumThreads(input: { forumName: string; page: number }): Promise<ForumThreadPage> {
    return this.callBridge<ForumThreadPage>({
      action: "getForumThreads",
      auth: await this.getBridgeAuth(),
      payload: input
    });
  }

  async getThreadDetail(input: {
    threadId: string;
    forumName?: string;
    page: number;
    sourceUrl?: string;
  }): Promise<ThreadDetailPage> {
    return this.callBridge<ThreadDetailPage>({
      action: "getThreadDetail",
      auth: await this.getBridgeAuth(),
      payload: input
    });
  }

  async getPostComments(input: { threadId: string; postId: string; page?: number }): Promise<PostCommentsPage> {
    return this.callBridge<PostCommentsPage>({
      action: "getPostComments",
      auth: await this.getBridgeAuth(),
      payload: input
    });
  }

  async resolveForumNames(names: string[]): Promise<string[]> {
    const result = await this.callBridge<{ names: string[] }>({
      action: "resolveForumNames",
      auth: await this.getBridgeAuth(),
      payload: {
        names
      }
    });

    return Array.isArray(result.names) ? result.names : [];
  }

  async healthCheck(): Promise<BridgeHealthCheckResult> {
    return this.callBridge<BridgeHealthCheckResult>({
      action: "healthCheck",
      auth: await this.getBridgeAuth(),
      payload: {}
    });
  }

  private async getBridgeAuth(): Promise<{ bduss?: string; stoken?: string }> {
    const auth = await this.getAuth();
    return {
      bduss: auth.bduss,
      stoken: auth.stoken
    };
  }

  private async callBridge<T>(request: BridgeRequest): Promise<T> {
    if (!fs.existsSync(this.scriptPath)) {
      throw new TiebaError("bridge", `没有找到 aiotieba bridge 脚本：${this.scriptPath}`);
    }

    const response = await runBridge<T>(this.getPythonPath(), this.scriptPath, request);
    if (response.ok) {
      return response.result;
    }

    throw new TiebaError(
      normalizeBridgeErrorCode(response.error.code),
      response.error.message,
      response.error.details
    );
  }
}

async function runBridge<T>(
  pythonPath: string,
  scriptPath: string,
  request: BridgeRequest
): Promise<BridgeResponse<T>> {
  const attempts = buildPythonAttempts(pythonPath);
  let lastProcessError: NodeJS.ErrnoException | undefined;

  for (const attempt of attempts) {
    try {
      return await runSingleBridgeAttempt<T>(attempt.command, [...attempt.argsPrefix, scriptPath], request);
    } catch (error) {
      if (isCommandNotFoundError(error)) {
        lastProcessError = error;
        continue;
      }

      throw error;
    }
  }

  const target = pythonPath || "python";
  throw new TiebaError(
    "bridge",
    `没有找到可用的 Python 解释器：${target}。请安装 Python，或把 tieba.pythonPath 改成正确的命令。`,
    lastProcessError
  );
}

function runSingleBridgeAttempt<T>(
  command: string,
  args: string[],
  request: BridgeRequest
): Promise<BridgeResponse<T>> {
  return new Promise((resolve, reject) => {
    const child = cp.spawn(command, args, {
      cwd: path.dirname(path.dirname(path.dirname(__dirname))),
      windowsHide: true
    });

    const timer = setTimeout(() => {
      child.kill();
      reject(new TiebaError("bridge", "aiotieba bridge 请求超时。"));
    }, 20_000);

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);

      if (!stdout.trim()) {
        const message = stderr.trim() || `aiotieba bridge 退出异常，exit code=${code ?? "unknown"}。`;
        reject(new TiebaError("bridge", message));
        return;
      }

      try {
        resolve(JSON.parse(stdout) as BridgeResponse<T>);
      } catch (error) {
        reject(
          new TiebaError("bridge", "aiotieba bridge 返回了不可解析的内容。", {
            stdout,
            stderr,
            error
          })
        );
      }
    });

    child.stdin.end(JSON.stringify(request));
  });
}

function buildPythonAttempts(configuredPath: string): Array<{ command: string; argsPrefix: string[] }> {
  const commands = new Set<string>();
  for (const candidate of [configuredPath.trim(), "python", "py"]) {
    if (candidate) {
      commands.add(candidate);
    }
  }

  return Array.from(commands).map((command) => ({
    command,
    argsPrefix: isPyLauncher(command) ? ["-3", "-X", "utf8"] : ["-X", "utf8"]
  }));
}

function isPyLauncher(command: string): boolean {
  const base = path.basename(command).toLowerCase();
  return base === "py" || base === "py.exe";
}

function isCommandNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT");
}

function normalizeBridgeErrorCode(code?: string): TiebaErrorCode {
  switch (code) {
    case "auth":
    case "bridge":
    case "captcha":
    case "network":
    case "parse":
    case "unknown":
      return code;
    default:
      return "unknown";
  }
}
