/** Shared thresholds and limits — single source of truth for the pipeline. */

export const MODEL_FORMAT_VERSION = "1" as const;

/** Metrica di prodotto: mai più di 10 domande umane per cartella. */
export const MAX_REVIEW_QUESTIONS = 10;

/** Sotto questa confidenza un'inferenza genera un dubbio/domanda, mai un fatto silenzioso. */
export const LOW_CONFIDENCE_THRESHOLD = 0.7;
