import type { DocumentTypeHintConfig } from "@backed/core";
import { toTableName } from "@backed/ingest";
import { confirm, input } from "@inquirer/prompts";
import type { Ui } from "./ui/format.js";
import type { createPromptTheme } from "./ui/prompts.js";
const DEFAULT_RULE_CONFIDENCE = 0.9;
const GUIDE_EXAMPLE_FILE = "invoice_acme_corp_2026.pdf";
export function exampleSlugForFilename(filename: string): string {
    return toTableName(filename);
}
export function printDocumentTypeHintGuide(ui: Ui): void {
    const exampleSlug = exampleSlugForFilename(GUIDE_EXAMPLE_FILE);
    ui.blank();
    ui.log(ui.box("Document filename rules (optional)", [
        "Anchor turns each filename into a normalized slug, then checks your keywords.",
        `  ${GUIDE_EXAMPLE_FILE}`,
        `  → slug: ${ui.accent(exampleSlug)}`,
        "If the slug contains your keyword → that document type is applied without LLM.",
        "Use one keyword per rule. Repeat the same type with different keywords (invoice, inv, …).",
        "No match → one LLM call per file (slower).",
    ]));
    ui.blank();
}
function validateTypeId(value: string): true | string {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
        return "Type id is required";
    }
    if (!/^[a-z][a-z0-9_]*$/.test(trimmed)) {
        return "Use lowercase letters, numbers, underscores (e.g. invoice)";
    }
    return true;
}
async function promptKeywordForType(theme: ReturnType<typeof createPromptTheme>, ui: Ui, typeLabel: string): Promise<string> {
    const keyword = await input({
        message: `Filename keyword for "${typeLabel}" (checked inside the slug):`,
        validate: (value) => (value.trim().length > 0 ? true : "Keyword is required"),
        theme,
    });
    const trimmed = keyword.trim();
    const demoFilename = `${trimmed}_acme_corp_2026.pdf`;
    const demoSlug = exampleSlugForFilename(demoFilename);
    ui.detail(`  Example: "${demoFilename}" → slug ${demoSlug} → ${trimmed.length > 0 && demoSlug.includes(trimmed.toLowerCase()) ? "matches" : "check your spelling"}`);
    return trimmed;
}
async function promptDocumentTypeGroup(theme: ReturnType<typeof createPromptTheme>, ui: Ui): Promise<DocumentTypeHintConfig[]> {
    ui.blank();
    ui.log(ui.bold("New document type"));
    const documentType = await input({
        message: "Type id — stable id in model.yaml / MCP (e.g. invoice, contract, notice):",
        validate: validateTypeId,
        theme,
    });
    const documentTypeLabel = await input({
        message: "Display name — label shown in review and exports (e.g. Invoice, Contract):",
        validate: (value) => (value.trim().length > 0 ? true : "Display name is required"),
        theme,
    });
    const hints: DocumentTypeHintConfig[] = [];
    const label = documentTypeLabel.trim();
    const typeId = documentType.trim();
    ui.detail(`  Add one or more filename keywords that identify "${label}".`);
    for (;;) {
        const keyword = await promptKeywordForType(theme, ui, label);
        hints.push({
            match: keyword,
            documentType: typeId,
            documentTypeLabel: label,
            confidence: DEFAULT_RULE_CONFIDENCE,
        });
        const anotherKeyword = await confirm({
            message: `Another keyword for the same type (${label})?`,
            default: false,
            theme,
        });
        if (!anotherKeyword) {
            break;
        }
    }
    return hints;
}
async function collectDocumentTypeHints(theme: ReturnType<typeof createPromptTheme>, ui: Ui, initial: DocumentTypeHintConfig[] = []): Promise<DocumentTypeHintConfig[]> {
    const hints = [...initial];
    if (hints.length === 0) {
        const start = await confirm({
            message: "Add document filename rules? (recommended for PDF folders — skips LLM when filenames match)",
            default: false,
            theme,
        });
        if (!start) {
            return [];
        }
        printDocumentTypeHintGuide(ui);
    }
    for (;;) {
        hints.push(...(await promptDocumentTypeGroup(theme, ui)));
        const anotherType = await confirm({
            message: "Add another document type?",
            default: false,
            theme,
        });
        if (!anotherType) {
            break;
        }
    }
    return hints;
}
export async function promptDocumentTypeHints(existingHints: DocumentTypeHintConfig[], theme: ReturnType<typeof createPromptTheme>, ui: Ui): Promise<DocumentTypeHintConfig[]> {
    let hints = [...existingHints];
    if (hints.length > 0) {
        ui.detail(`  ${String(hints.length)} rule(s) already in config (e.g. match "${hints[0]?.match ?? ""}" → ${hints[0]?.documentTypeLabel ?? ""}).`);
        const replace = await confirm({
            message: `Replace ${String(hints.length)} existing rule(s)?`,
            default: false,
            theme,
        });
        if (replace) {
            hints = [];
        }
        else {
            const addMore = await confirm({
                message: "Add more rules?",
                default: false,
                theme,
            });
            if (!addMore) {
                return hints;
            }
            printDocumentTypeHintGuide(ui);
        }
    }
    return collectDocumentTypeHints(theme, ui, hints);
}
export function summarizeDocumentTypeHints(hints: DocumentTypeHintConfig[]): string {
    if (hints.length === 0) {
        return "none (LLM will classify every document)";
    }
    const byType = new Map<string, {
        label: string;
        keywords: string[];
    }>();
    for (const hint of hints) {
        const entry = byType.get(hint.documentType) ?? {
            label: hint.documentTypeLabel,
            keywords: [],
        };
        entry.keywords.push(hint.match);
        byType.set(hint.documentType, entry);
    }
    return [...byType.entries()]
        .map(([typeId, entry]) => `${entry.label} (${typeId}): ${entry.keywords.join(", ")}`)
        .join(" · ");
}
