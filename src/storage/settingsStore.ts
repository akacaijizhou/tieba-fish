import * as vscode from "vscode";
import {
  TiebaReadingContrast,
  TiebaReadingDensity,
  TiebaSettings,
  TiebaThemePreset
} from "../models/tieba";
import { STORAGE_KEYS } from "./storageKeys";

export class SettingsStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  get(): TiebaSettings {
    const config = vscode.workspace.getConfiguration("tieba");
    const themePreset =
      this.readThemePresetFromConfiguration(config) ??
      this.context.globalState.get<TiebaThemePreset>(STORAGE_KEYS.themePreset, "default");
    const density =
      this.readDensityFromConfiguration(config) ??
      (config.get<boolean>("compactMode", false) ? "compact" : "comfortable");
    const contrast =
      this.readContrastFromConfiguration(config) ??
      (config.get<boolean>("lowContrastMode", true) ? "soft" : "normal");

    return {
      showImages: config.get<boolean>("showImages", true),
      density,
      contrast,
      compactMode: density === "compact",
      lowContrastMode: contrast === "soft",
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

    await this.updateConfigurationValue("themePreset", nextValue);
  }

  async updateDensity(nextValue: TiebaReadingDensity): Promise<void> {
    await this.updateConfigurationValue("density", nextValue);
  }

  async updateContrast(nextValue: TiebaReadingContrast): Promise<void> {
    await this.updateConfigurationValue("contrast", nextValue);
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

  private readDensityFromConfiguration(config: vscode.WorkspaceConfiguration): TiebaReadingDensity | undefined {
    const inspected = config.inspect<TiebaReadingDensity>("density");
    return normalizeDensity(
      inspected?.workspaceFolderValue ??
      inspected?.workspaceValue ??
      inspected?.globalValue ??
      inspected?.defaultValue
    );
  }

  private readContrastFromConfiguration(config: vscode.WorkspaceConfiguration): TiebaReadingContrast | undefined {
    const inspected = config.inspect<TiebaReadingContrast>("contrast");
    return normalizeContrast(
      inspected?.workspaceFolderValue ??
      inspected?.workspaceValue ??
      inspected?.globalValue ??
      inspected?.defaultValue
    );
  }

  private async updateConfigurationValue<TKey extends "themePreset" | "density" | "contrast">(
    key: TKey,
    value: TKey extends "themePreset"
      ? TiebaThemePreset
      : TKey extends "density"
        ? TiebaReadingDensity
        : TiebaReadingContrast
  ): Promise<void> {
    try {
      await vscode.workspace
        .getConfiguration("tieba")
        .update(key, value, vscode.ConfigurationTarget.Global);
    } catch (error) {
      if (!isMissingConfigurationError(error)) {
        throw error;
      }
    }
  }
}

function isMissingConfigurationError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes("没有注册配置 tieba.")
    || error.message.includes("not registered configuration tieba.");
}

function normalizeDensity(value: unknown): TiebaReadingDensity | undefined {
  return value === "compact" || value === "comfortable" ? value : undefined;
}

function normalizeContrast(value: unknown): TiebaReadingContrast | undefined {
  return value === "soft" || value === "normal" ? value : undefined;
}
