import { tags as t } from "@lezer/highlight";
import { createTheme } from "@uiw/codemirror-themes";
import { dracula } from "@uiw/codemirror-theme-dracula";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import type { Extension } from "@codemirror/state";

export type ThemeId = "vscode-dark" | "dracula" | "gnome";

export type ThemeDef = {
  id: ThemeId;
  label: string;
  editorTheme: Extension;
  terminal: { background: string; foreground: string; cursor: string };
  vars: Record<string, string>;
};

const gnomeStyle = [
  { tag: t.comment, color: "#9a9996" },
  { tag: t.string, color: "#33d17a" },
  { tag: t.atom, color: "#c061cb" },
  { tag: t.meta, color: "#eeeeec" },
  { tag: [t.keyword, t.operator, t.tagName], color: "#f66151" },
  { tag: [t.function(t.propertyName), t.propertyName], color: "#3584e4" },
  {
    tag: [
      t.definition(t.variableName),
      t.function(t.variableName),
      t.className,
      t.attributeName,
    ],
    color: "#f9c440",
  },
];

const gnomeEditorTheme = createTheme({
  theme: "dark",
  settings: {
    background: "#242424",
    foreground: "#eeeeec",
    caret: "#eeeeec",
    selection: "rgba(53, 132, 228, 0.35)",
    selectionMatch: "rgba(53, 132, 228, 0.2)",
    gutterBackground: "#242424",
    gutterForeground: "#77767b",
    gutterBorder: "transparent",
    lineHighlight: "rgba(255, 255, 255, 0.06)",
  },
  styles: gnomeStyle,
});

export const THEMES: Record<ThemeId, ThemeDef> = {
  "vscode-dark": {
    id: "vscode-dark",
    label: "VS Code Dark",
    editorTheme: vscodeDark,
    terminal: { background: "#1e1e1e", foreground: "#d4d4d4", cursor: "#d4d4d4" },
    vars: {
      "--bg-app": "#1e1e1e",
      "--bg-panel": "#252526",
      "--bg-elevated": "#2d2d2d",
      "--bg-hover": "#3d3d3d",
      "--bg-sidebar": "#1a2733",
      "--bg-sidebar-elevated": "#17222c",
      "--border-color": "#333333",
      "--border-color-soft": "#3a3a3a",
      "--text-primary": "#dddddd",
      "--text-secondary": "#999999",
      "--text-sidebar": "#c6d2dd",
      "--accent": "#3d7eff",
      "--accent-hover": "#5b8fff",
    },
  },
  dracula: {
    id: "dracula",
    label: "Dracula",
    editorTheme: dracula,
    terminal: { background: "#282a36", foreground: "#f8f8f2", cursor: "#f8f8f0" },
    vars: {
      "--bg-app": "#282a36",
      "--bg-panel": "#21222c",
      "--bg-elevated": "#343746",
      "--bg-hover": "#44475a",
      "--bg-sidebar": "#21222c",
      "--bg-sidebar-elevated": "#191a21",
      "--border-color": "#191a21",
      "--border-color-soft": "#44475a",
      "--text-primary": "#f8f8f2",
      "--text-secondary": "#6272a4",
      "--text-sidebar": "#f8f8f2",
      "--accent": "#bd93f9",
      "--accent-hover": "#caa9fa",
    },
  },
  gnome: {
    id: "gnome",
    label: "GNOME",
    editorTheme: gnomeEditorTheme,
    terminal: { background: "#242424", foreground: "#eeeeec", cursor: "#eeeeec" },
    vars: {
      "--bg-app": "#242424",
      "--bg-panel": "#303030",
      "--bg-elevated": "#383838",
      "--bg-hover": "#444444",
      "--bg-sidebar": "#1e1e1e",
      "--bg-sidebar-elevated": "#181818",
      "--border-color": "#000000",
      "--border-color-soft": "#4a4a4a",
      "--text-primary": "#eeeeec",
      "--text-secondary": "#9a9996",
      "--text-sidebar": "#eeeeec",
      "--accent": "#3584e4",
      "--accent-hover": "#4a97eb",
    },
  },
};

export const THEME_LIST = Object.values(THEMES);
