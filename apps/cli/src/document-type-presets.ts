/**
 * Document-type presets for `backed init` only — not used at inference runtime.
 * Runtime rules live in `.backed/config.yaml` (`documentTypeHints`).
 */

import type { DocumentTypeHintConfig } from "@backed/core";

export interface DocumentTypePresetGroup {
  id: string;
  label: string;
  description: string;
  hints: DocumentTypeHintConfig[];
}

/** Selectable groups for `backed init`. */
export const DOCUMENT_TYPE_GROUPS: DocumentTypePresetGroup[] = [
  {
    id: "determination",
    label: "Determination",
    description: "Slug contains \"determina\"",
    hints: [
      {
        match: "determina",
        documentType: "determination",
        documentTypeLabel: "Determination",
        confidence: 0.95,
      },
    ],
  },
  {
    id: "deliberation",
    label: "Deliberation",
    description: "Slug contains \"delibera\"",
    hints: [
      {
        match: "delibera",
        documentType: "deliberation",
        documentTypeLabel: "Deliberation",
        confidence: 0.95,
      },
    ],
  },
  {
    id: "ordinance",
    label: "Ordinance",
    description: "Slug contains \"no_n_\" or \"ordinanza\"",
    hints: [
      {
        match: "no_n_",
        documentType: "ordinance",
        documentTypeLabel: "Ordinance",
        confidence: 0.9,
      },
      {
        match: "ordinanza",
        documentType: "ordinance",
        documentTypeLabel: "Ordinance",
        confidence: 0.9,
      },
    ],
  },
  {
    id: "administrative_document",
    label: "Administrative Document",
    description: "Slug contains prot_par_ or prot_int_",
    hints: [
      {
        match: "prot_par_",
        documentType: "unknown",
        documentTypeLabel: "Administrative Document",
        confidence: 0.85,
      },
      {
        match: "prot_int_",
        documentType: "unknown",
        documentTypeLabel: "Administrative Document",
        confidence: 0.85,
      },
    ],
  },
  {
    id: "publication",
    label: "Publication",
    description: "Slug contains \"pubblicazione\"",
    hints: [
      {
        match: "pubblicazione",
        documentType: "publication",
        documentTypeLabel: "Publication",
        confidence: 0.95,
      },
    ],
  },
  {
    id: "notice",
    label: "Notice",
    description: "Slug contains avviso, manifesto, convocazione, or concorso",
    hints: [
      {
        match: "avviso",
        documentType: "notice",
        documentTypeLabel: "Notice",
        confidence: 0.9,
      },
      {
        match: "manifesto",
        documentType: "notice",
        documentTypeLabel: "Notice",
        confidence: 0.9,
      },
      {
        match: "convocazione",
        documentType: "notice",
        documentTypeLabel: "Notice",
        confidence: 0.9,
      },
      {
        match: "concorso",
        documentType: "notice",
        documentTypeLabel: "Notice",
        confidence: 0.85,
      },
    ],
  },
  {
    id: "electoral_list",
    label: "Electoral / scrutineers list",
    description: "Slug contains \"scrutator\" or \"elettor\"",
    hints: [
      {
        match: "scrutator",
        documentType: "electoral_list",
        documentTypeLabel: "Electoral List",
        confidence: 0.9,
      },
      {
        match: "elettor",
        documentType: "electoral_list",
        documentTypeLabel: "Electoral List",
        confidence: 0.85,
      },
    ],
  },
  {
    id: "invoice",
    label: "Invoice",
    description: "Slug contains \"invoice\" or \"fattura\"",
    hints: [
      {
        match: "invoice",
        documentType: "invoice",
        documentTypeLabel: "Invoice",
        confidence: 0.9,
      },
      {
        match: "fattura",
        documentType: "invoice",
        documentTypeLabel: "Invoice",
        confidence: 0.9,
      },
    ],
  },
  {
    id: "contract",
    label: "Contract",
    description: "Slug contains \"contract\" or \"contratto\"",
    hints: [
      {
        match: "contract",
        documentType: "contract",
        documentTypeLabel: "Contract",
        confidence: 0.9,
      },
      {
        match: "contratto",
        documentType: "contract",
        documentTypeLabel: "Contract",
        confidence: 0.9,
      },
    ],
  },
  {
    id: "report",
    label: "Report",
    description: "Slug contains \"report\"",
    hints: [
      {
        match: "report",
        documentType: "report",
        documentTypeLabel: "Report",
        confidence: 0.85,
      },
    ],
  },
];

export function flattenDocumentTypeGroups(groups: DocumentTypePresetGroup[]): DocumentTypeHintConfig[] {
  return groups.flatMap((group) => group.hints);
}
