import * as vscode from "vscode";
import { TiebaSettings } from "../models/tieba";

interface StaticThemedWebviewPageOptions {
  context: vscode.ExtensionContext;
  webview: vscode.Webview;
  title: string;
  settings: TiebaSettings;
  pageId: string;
  body: string;
}

export function renderStaticThemedWebviewPage(options: StaticThemedWebviewPageOptions): string {
  const styleUri = options.webview.asWebviewUri(
    vscode.Uri.joinPath(options.context.extensionUri, "media", "common.css")
  );
  const csp = `default-src 'none'; style-src ${options.webview.cspSource};`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${styleUri}" />
    <title>${escapeHtml(options.title)}</title>
  </head>
  <body ${buildThemedBodyAttributes(options.settings, { "data-page": "utility", "data-utility-page": options.pageId })}>
    <main class="utility-page">
      ${options.body}
    </main>
  </body>
</html>`;
}

export function buildThemedBodyAttributes(
  settings: Pick<TiebaSettings, "showImages" | "themePreset" | "density" | "contrast">,
  extraAttributes: Record<string, string | undefined> = {}
): string {
  const attributes = new Map<string, string>();
  attributes.set("data-theme-preset", settings.themePreset);
  attributes.set("data-density", settings.density);
  attributes.set("data-contrast", settings.contrast);

  for (const [key, value] of Object.entries(extraAttributes)) {
    if (value) {
      attributes.set(key, value);
    }
  }

  const classes = settings.showImages ? [] : ["hide-images"];
  if (classes.length > 0) {
    attributes.set("class", classes.join(" "));
  }

  return Array.from(attributes.entries())
    .map(([key, value]) => `${key}="${escapeHtml(value)}"`)
    .join(" ");
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
