/** Shared thresholds and limits — single source of truth for the pipeline. */

export const MODEL_FORMAT_VERSION = "1" as const;

/** Below this confidence, an inference becomes a doubt or review question — never a silent fact. */
export const LOW_CONFIDENCE_THRESHOLD = 0.7;

/** At or above this confidence, an inference skips human review (stays proposed). */
export const DEFAULT_REVIEW_CONFIDENCE_THRESHOLD = 0.95;

/** Maximum review questions per folder run — AI_GUIDELINES governance budget. */
export const MAX_REVIEW_QUESTIONS = 10;
