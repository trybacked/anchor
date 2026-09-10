import { DocumentTypeHintsSchema, WorkspaceConfigSchema } from "@backed/core";
import type { DocumentTypeHintConfig, WorkspaceConfig } from "@backed/core";

export function parseDocumentTypeHintsJson(raw: string): DocumentTypeHintConfig[] {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") {
        throw new Error("--rules must be a JSON object with documentTypeHints.");
    }
    const record = parsed as Record<string, unknown>;
    const hints = record["documentTypeHints"];
    if (hints === undefined) {
        return [];
    }
    return DocumentTypeHintsSchema.parse(hints);
}

export function buildHeadlessInitConfig(sourcesDir: string, rulesJson: string | undefined): WorkspaceConfig {
    const documentTypeHints = rulesJson === undefined ? [] : parseDocumentTypeHintsJson(rulesJson);
    return WorkspaceConfigSchema.parse({
        sourcesDir,
        documentTypeHints,
    });
}
