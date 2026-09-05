import type { DocumentTypeHintConfig } from "@backed/core";

/** Sample workspace rules used in unit tests. */
export const SAMPLE_DOCUMENT_TYPE_HINTS_FIXTURE: DocumentTypeHintConfig[] = [
  {
    match: "determina",
    documentType: "determination",
    documentTypeLabel: "Determination",
    confidence: 0.95,
  },
  {
    match: "avviso",
    documentType: "notice",
    documentTypeLabel: "Notice",
    confidence: 0.9,
  },
];
