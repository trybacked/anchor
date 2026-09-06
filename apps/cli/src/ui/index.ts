import { createUi, type Ui } from "./format.js";
import { printHelp } from "./help.js";
import { createPromptTheme } from "./prompts.js";

export { renderLogo } from "./logo.js";
export { LOGO_ART_LINES } from "./logo-art.js";
export type { ProgressHandle, ProgressUpdate, Ui } from "./format.js";
export { createAiProgressReporter, createTaskProgress } from "./progress.js";
export type { AiProgressReporter } from "./progress.js";
export { printHelp } from "./help.js";
export { createPromptTheme } from "./prompts.js";

let activeUi: Ui | undefined;

export function initUi(): Ui {
  activeUi = createUi();
  return activeUi;
}

export function getUi(): Ui {
  if (activeUi === undefined) {
    return initUi();
  }
  return activeUi;
}
