import * as vscode from "vscode";
import { TiebaSettings, TiebaThemePreset } from "../models/tieba";
import { STORAGE_KEYS } from "./storageKeys";

export class SettingsStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  get(): TiebaSettings {
    const config = vscode.workspace.getConfiguration("tieba");
    const themePreset =
      this.readThemePresetFromConfiguration(config) ??
      this.context.globalState.get<TiebaThemePreset>(STORAGE_KEYS.themePreset, "default");

    return {
      showImages: config.get<boolean>("showImages", true),
      compactMode: config.get<boolean>("compactMode", false),
      lowContrastMode: config.get<boolean>("lowContrastMode", true),
      themePreset,
      cacheMinutes: config.get<number>("cacheMinutes", 3),
      maxHistory: config.get<number>("maxHistory", 100),
      openThreadMode: config.get<"active" | "beside">("openThreadMode", "active"),
      fallbackToBrowser: config.get<boolean>("fallbackToBrowser", true)
    };
  }

  async updateShowImages(nextValue: boolean): Promise<void> {
    await vscode.workspace
      .getConfiguration("tieba")
      .update("showImages", nextValue, vscode.ConfigurationTarget.Global);
  }

  async updateThemePreset(nextValue: TiebaThemePreset): Promise<void> {
    await this.context.globalState.update(STORAGE_KEYS.themePreset, nextValue);

    try {
      await vscode.workspace
        .getConfiguration("tieba")
        .update("themePreset", nextValue, vscode.ConfigurationTarget.Global);
    } catch (error) {
      if (!isMissingConfigurationError(error)) {
        throw error;
      }
    }
  }

  private readThemePresetFromConfiguration(config: vscode.WorkspaceConfiguration): TiebaThemePreset | undefined {
    const inspected = config.inspect<TiebaThemePreset>("themePreset");
    return (
      inspected?.workspaceFolderValue ??
      inspected?.workspaceValue ??
      inspected?.globalValue ??
      inspected?.defaultValue
    );
  }
}

function isMissingConfigurationError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes("没有注册配置 tieba.themePreset")
    || error.message.includes("not registered configuration tieba.themePreset");
}
