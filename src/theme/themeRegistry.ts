import {
  TiebaReadingContrast,
  TiebaReadingDensity,
  TiebaSettings,
  TiebaThemePreset
} from "../models/tieba";

export interface ReadingThemeOption<TValue extends string> {
  value: TValue;
  label: string;
  description: string;
}

export const THEME_PRESET_OPTIONS: ReadingThemeOption<TiebaThemePreset>[] = [
  {
    value: "default",
    label: "默认",
    description: "保持当前这套常规阅读样式。"
  },
  {
    value: "minimal",
    label: "极简",
    description: "更收敛、更克制，适合低打扰摸鱼。"
  },
  {
    value: "document",
    label: "文档风",
    description: "正文更舒展，适合长帖和资料贴。"
  }
];

export const READING_DENSITY_OPTIONS: ReadingThemeOption<TiebaReadingDensity>[] = [
  {
    value: "comfortable",
    label: "舒展排版",
    description: "保留更宽松的字号、留白和翻页节奏。"
  },
  {
    value: "compact",
    label: "紧凑排版",
    description: "压缩页面占用，一屏里能看到更多内容。"
  }
];

export const READING_CONTRAST_OPTIONS: ReadingThemeOption<TiebaReadingContrast>[] = [
  {
    value: "soft",
    label: "柔和对比",
    description: "降低按钮、分隔线和反馈条的视觉存在感。"
  },
  {
    value: "normal",
    label: "清晰对比",
    description: "保留更明显的信息层次和边界感。"
  }
];

export function getThemePresetOption(themePreset: TiebaThemePreset): ReadingThemeOption<TiebaThemePreset> {
  return findThemeOption(THEME_PRESET_OPTIONS, themePreset);
}

export function getReadingDensityOption(density: TiebaReadingDensity): ReadingThemeOption<TiebaReadingDensity> {
  return findThemeOption(READING_DENSITY_OPTIONS, density);
}

export function getReadingContrastOption(contrast: TiebaReadingContrast): ReadingThemeOption<TiebaReadingContrast> {
  return findThemeOption(READING_CONTRAST_OPTIONS, contrast);
}

export function formatReadingThemeSummary(
  settings: Pick<TiebaSettings, "themePreset" | "density" | "contrast">
): string {
  return [
    getThemePresetOption(settings.themePreset).label,
    getReadingDensityOption(settings.density).label,
    getReadingContrastOption(settings.contrast).label
  ].join(" · ");
}

function findThemeOption<TValue extends string>(
  options: ReadingThemeOption<TValue>[],
  value: TValue
): ReadingThemeOption<TValue> {
  return options.find((option) => option.value === value) ?? options[0];
}
