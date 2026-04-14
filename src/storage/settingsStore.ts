import * as vscode from "vscode";
import { TiebaSettings, TiebaThemePreset } from "../models/tieba";

export class SettingsStore {
  get(): TiebaSettings {
    const config = vscode.workspace.getConfiguration("tieba");
    return {
      showImages: config.get<boolean>("showImages", true),
      compactMode: config.get<boolean>("compactMode", false),
      lowContrastMode: config.get<boolean>("lowContrastMode", true),
      themePreset: config.get<TiebaThemePreset>("themePreset", "default"),
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
    await vscode.workspace
      .getConfiguration("tieba")
      .update("themePreset", nextValue, vscode.ConfigurationTarget.Global);
  }
}
