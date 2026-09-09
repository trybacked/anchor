export type PipelineProgressLevel = "step" | "detail" | "success" | "warn" | "error" | "heading";

export interface PipelineProgressEvent {
    level: PipelineProgressLevel;
    message: string;
}

export interface PipelineBatchProgress {
    label: string;
    completed: number;
    total: number;
}

export interface PipelineProgressReporter {
    heading?(message: string): void;
    step(message: string): void;
    detail(message: string): void;
    success(message: string): void;
    warn(message: string): void;
    error(message: string): void;
    track?(label: string, completed: number, total: number): void;
    indeterminate?(message: string): void;
}

function pushProgressEvent(events: PipelineProgressEvent[], level: PipelineProgressLevel, message: string): void {
    switch (level) {
        case "heading":
        case "step":
        case "detail":
        case "success":
        case "warn":
        case "error":
            events.push({ level, message });
            break;
        default: {
            const unhandled: never = level;
            throw new Error(`Unhandled progress level: ${String(unhandled)}`);
        }
    }
}

export function createCollectingProgressReporter(events: PipelineProgressEvent[] = []): PipelineProgressReporter {
    const push = (level: PipelineProgressLevel, message: string): void => {
        pushProgressEvent(events, level, message);
    };
    return {
        heading: (message) => {
            push("heading", message);
        },
        step: (message) => {
            push("step", message);
        },
        detail: (message) => {
            push("detail", message);
        },
        success: (message) => {
            push("success", message);
        },
        warn: (message) => {
            push("warn", message);
        },
        error: (message) => {
            push("error", message);
        },
        track: (label, completed, total) => {
            push("detail", `${label} ${String(completed)}/${String(total)}`);
        },
        indeterminate: (message) => {
            push("detail", message);
        },
    };
}

export function noopProgressReporter(): PipelineProgressReporter {
    return {
        step: () => undefined,
        detail: () => undefined,
        success: () => undefined,
        warn: () => undefined,
        error: () => undefined,
    };
}
