/**
 * Document-type hints from workspace config (`.backed/config.yaml`).
 * No built-in rules at runtime — run `backed init` to populate documentTypeHints.
 */

import type { DocumentTypeHintConfig } from "@backed/core";

export type { DocumentTypeHintConfig };

export interface DocumentTypeHint {
  documentType: string;
  documentTypeLabel: string;
  confidence: number;
  evidence: string;
}

function hintFromConfig(config: DocumentTypeHintConfig): DocumentTypeHint {
  return {
    documentType: config.documentType,
    documentTypeLabel: config.documentTypeLabel,
    confidence: config.confidence,
    evidence: `Table slug matches "${config.match}" (workspace rule)`,
  };
}

export function inferDocumentTypeHint(
  sourceTable: string,
  workspaceHints: DocumentTypeHintConfig[] | undefined,
): DocumentTypeHint | null {
  if (workspaceHints === undefined || workspaceHints.length === 0) {
    return null;
  }

  const slug = sourceTable.toLowerCase();
  for (const rule of workspaceHints) {
    if (slug.includes(rule.match.toLowerCase())) {
      return {
        ...hintFromConfig(rule),
        evidence: `Table slug matches "${rule.match}"`,
      };
    }
  }
  return null;
}
