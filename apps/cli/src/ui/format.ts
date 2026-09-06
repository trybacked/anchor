import { ANSI, stripAnsi, wrap } from "./ansi.js";
import { createTaskProgress, type ProgressHandle, type ProgressUpdate } from "./progress.js";

export type { ProgressHandle, ProgressUpdate };
export { createTaskProgress };

export interface Ui {
  log: (text: string) => void;
  blank: () => void;
  dim: (text: string) => string;
  accent: (text: string) => string;
  bold: (text: string) => string;
  success: (text: string) => string;
  warn: (text: string) => string;
  error: (text: string) => string;
  label: (text: string) => string;
  command: (name: string) => string;
  path: (text: string) => string;
  heading: (text: string) => void;
  step: (text: string) => void;
  detail: (text: string) => void;
  writeError: (text: string) => void;
  writeSuccess: (text: string) => void;
  writeWarn: (text: string) => void;
  hr: () => void;
  colorizeDiff: (text: string) => string;
  box: (title: string, lines: string[]) => string;
  spinner: (label: string) => { stop: () => void };
  taskProgress: (label: string, total?: number) => ProgressHandle;
}

function paint(code: string, text: string): string {
  return wrap(code, text);
}

export function createUi(): Ui {
  const ui: Ui = {
    log(text: string): void {
      console.log(text);
    },

    blank(): void {
      console.log("");
    },

    dim(text: string): string {
      return paint(ANSI.dim, text);
    },

    accent(text: string): string {
      return paint(ANSI.brand, text);
    },

    bold(text: string): string {
      return paint(`${ANSI.bold}${ANSI.white}`, text);
    },

    success(text: string): string {
      return paint(ANSI.green, text);
    },

    warn(text: string): string {
      return paint(ANSI.yellow, text);
    },

    error(text: string): string {
      return paint(ANSI.red, text);
    },

    label(text: string): string {
      return paint(`${ANSI.bold}${ANSI.white}`, text);
    },

    command(name: string): string {
      return paint(ANSI.brandBold, name);
    },

    path(text: string): string {
      return paint(ANSI.brand, text);
    },

    heading(text: string): void {
      console.log(ui.bold(text));
    },

    step(text: string): void {
      console.log(`${ui.accent("→")} ${text}`);
    },

    detail(text: string): void {
      console.log(`  ${ui.dim(text)}`);
    },

    writeError(text: string): void {
      console.error(`${ui.error("error")} ${text}`);
    },

    writeSuccess(text: string): void {
      console.log(`${ui.success("✓")} ${text}`);
    },

    writeWarn(text: string): void {
      console.log(`${ui.warn("!")} ${text}`);
    },

    hr(): void {
      console.log(ui.dim("─".repeat(Math.min(52, process.stdout.columns || 52))));
    },

    colorizeDiff(text: string): string {
      return text
        .split("\n")
        .map((line) => {
          if (line.startsWith("+")) {
            return wrap(ANSI.green, line);
          }
          if (line.startsWith("-")) {
            return wrap(ANSI.red, line);
          }
          if (line.startsWith("~")) {
            return wrap(ANSI.yellow, line);
          }
          return line;
        })
        .join("\n");
    },

    box(title: string, lines: string[]): string {
      const innerWidth = Math.max(
        stripAnsi(title).length,
        ...lines.map((line) => stripAnsi(line).length),
        24,
      );
      const bar = "─".repeat(innerWidth + 2);
      const header = paint(ANSI.brandBold, title);
      const body = lines.map((line) => `│ ${line.padEnd(innerWidth)} │`).join("\n");
      return `${ui.dim(`┌${bar}┐`)}\n│ ${header.padEnd(innerWidth + 9)} │\n${ui.dim(`├${bar}┤`)}\n${body}\n${ui.dim(`└${bar}┘`)}`;
    },

    spinner(label: string): { stop: () => void } {
      const progress = createTaskProgress(label);
      return {
        stop(): void {
          progress.stop();
        },
      };
    },

    taskProgress(label: string, total?: number): ProgressHandle {
      return createTaskProgress(label, total);
    },
  };

  return ui;
}
