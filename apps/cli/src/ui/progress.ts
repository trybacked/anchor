import { ANSI, stripAnsi, wrap } from "./ansi.js";

export interface ProgressUpdate {
  completed: number;
  total: number;
  label?: string;
}

export interface ProgressHandle {
  update(state: ProgressUpdate): void;
  stop(): void;
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

function paint(code: string, text: string): string {
  return wrap(code, text);
}

function formatEtaSeconds(seconds: number): string {
  if (seconds < 60) {
    return `${String(Math.round(seconds))}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${String(minutes)}m ${String(remainder)}s`;
}

function estimateRemainingSeconds(completed: number, total: number, startedAtMs: number): number | null {
  if (completed <= 0 || completed >= total) {
    return null;
  }
  const elapsedSeconds = (Date.now() - startedAtMs) / 1000;
  if (elapsedSeconds <= 0) {
    return null;
  }
  const rate = completed / elapsedSeconds;
  if (rate <= 0) {
    return null;
  }
  return (total - completed) / rate;
}

function renderBar(completed: number, total: number, width: number): string {
  if (total <= 0) {
    return `[${"─".repeat(width)}]`;
  }
  const ratio = Math.min(1, Math.max(0, completed / total));
  const filled = Math.round(ratio * width);
  const empty = Math.max(0, width - filled);
  return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
}

function truncateLabel(label: string, maxWidth: number): string {
  if (stripAnsi(label).length <= maxWidth) {
    return label;
  }
  if (maxWidth <= 3) {
    return label.slice(0, maxWidth);
  }
  return `${label.slice(0, maxWidth - 1)}…`;
}

export function createTaskProgress(initialLabel: string, total?: number): ProgressHandle {
  if (!process.stderr.isTTY) {
    let lastLoggedPercent = -1;
    const resolvedTotal = total ?? 0;

    return {
      update(state: ProgressUpdate): void {
        if (resolvedTotal <= 0 && state.total <= 0) {
          return;
        }
        const effectiveTotal = state.total > 0 ? state.total : resolvedTotal;
        if (effectiveTotal <= 0) {
          return;
        }
        const percent = Math.floor((state.completed / effectiveTotal) * 100);
        if (state.completed >= effectiveTotal || percent >= lastLoggedPercent + 10) {
          console.error(`${initialLabel}: ${String(state.completed)}/${String(effectiveTotal)}`);
          lastLoggedPercent = percent;
        }
      },
      stop(): void {},
    };
  }

  let label = initialLabel;
  let completed = 0;
  let resolvedTotal = total ?? 0;
  let frameIndex = 0;
  const startedAtMs = Date.now();

  const render = (): void => {
    const frame = paint(ANSI.brand, SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length] ?? "⠋");
    frameIndex += 1;

    const columns = process.stderr.columns ?? 80;
    const eta =
      resolvedTotal > 0
        ? estimateRemainingSeconds(completed, resolvedTotal, startedAtMs)
        : null;
    const suffix =
      resolvedTotal > 0
        ? ` ${renderBar(completed, resolvedTotal, 16)} ${String(completed)}/${String(resolvedTotal)}${
            eta !== null ? paint(ANSI.dim, ` ~${formatEtaSeconds(eta)} left`) : ""
          }`
        : "";

    const suffixWidth = stripAnsi(suffix).length;
    const labelWidth = Math.max(12, columns - stripAnsi(frame).length - suffixWidth - 2);
    const line = `${frame} ${truncateLabel(label, labelWidth)}${suffix}`;
    process.stderr.write(`\r\x1b[2K${line}`);
  };

  render();
  const timer = setInterval(render, 80);

  return {
    update(state: ProgressUpdate): void {
      completed = state.completed;
      if (state.total > 0) {
        resolvedTotal = state.total;
      }
      if (state.label !== undefined) {
        label = state.label;
      }
      render();
    },
    stop(): void {
      clearInterval(timer);
      process.stderr.write("\r\x1b[2K");
    },
  };
}

export interface AiProgressReporter {
  track: (label: string, completed: number, total: number) => void;
  indeterminate: (label: string) => void;
  detail: (message: string) => void;
  end: () => void;
}

export function createAiProgressReporter(detail: (message: string) => void): AiProgressReporter {
  let handle: ProgressHandle | undefined;
  let indeterminateLabel: string | undefined;

  return {
    track(label: string, completed: number, total: number): void {
      indeterminateLabel = undefined;
      if (handle === undefined) {
        handle = createTaskProgress(label, total);
      }
      handle.update({ completed, total, label });
      if (completed >= total) {
        handle.stop();
        handle = undefined;
      }
    },

    indeterminate(label: string): void {
      if (indeterminateLabel === label && handle !== undefined) {
        return;
      }
      indeterminateLabel = label;
      handle?.stop();
      handle = createTaskProgress(label);
    },

    detail(message: string): void {
      handle?.stop();
      handle = undefined;
      indeterminateLabel = undefined;
      detail(message);
    },

    end(): void {
      handle?.stop();
      handle = undefined;
      indeterminateLabel = undefined;
    },
  };
}
