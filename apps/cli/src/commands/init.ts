import { existsSync } from "node:fs";
import path from "node:path";

import type { DocumentTypeHintConfig, WorkspaceConfig } from "@backed/core";
import {
  initWorkspace,
  readWorkspaceConfig,
  workspacePaths,
  writeWorkspaceConfig,
} from "@backed/core";
import { checkbox, confirm, input } from "@inquirer/prompts";

import { DOCUMENT_TYPE_GROUPS, flattenDocumentTypeGroups } from "../document-type-presets.js";
import type { CommandHandler } from "../types.js";

const DEFAULT_SOURCES_DIR = "./sources";

function filterArgs(args: string[]): string[] {
  return args.filter((arg) => !arg.startsWith("-"));
}

async function promptCustomDocumentType(): Promise<DocumentTypeHintConfig | null> {
  const add = await confirm({
    message: "Add a custom document type rule?",
    default: false,
  });
  if (!add) {
    return null;
  }

  const match = await input({
    message: "Filename slug match (substring, case-insensitive):",
    validate: (value) => (value.trim().length > 0 ? true : "Match is required"),
  });
  const documentType = await input({
    message: "Document type id (slug, e.g. invoice):",
    validate: (value) => (/^[a-z][a-z0-9_]*$/.test(value.trim()) ? true : "Use lowercase slug"),
  });
  const documentTypeLabel = await input({
    message: "Display name (English, e.g. Invoice):",
    validate: (value) => (value.trim().length > 0 ? true : "Label is required"),
  });

  return {
    match: match.trim(),
    documentType: documentType.trim(),
    documentTypeLabel: documentTypeLabel.trim(),
    confidence: 0.9,
  };
}

async function collectCustomHints(): Promise<DocumentTypeHintConfig[]> {
  const hints: DocumentTypeHintConfig[] = [];
  for (;;) {
    const hint = await promptCustomDocumentType();
    if (hint === null) {
      break;
    }
    hints.push(hint);
  }
  return hints;
}

async function promptDocumentTypeHints(
  existingHints: DocumentTypeHintConfig[],
): Promise<DocumentTypeHintConfig[]> {
  const selected = await checkbox({
    message: "Which document types should filename rules cover?",
    choices: DOCUMENT_TYPE_GROUPS.map((group) => ({
      name: `${group.label} — ${group.description}`,
      value: group.id,
      checked:
        existingHints.length > 0
          ? group.hints.every((hint) =>
              existingHints.some(
                (existing) =>
                  existing.match === hint.match && existing.documentType === hint.documentType,
              ),
            )
          : true,
    })),
  });

  const documentTypeHints = flattenDocumentTypeGroups(
    DOCUMENT_TYPE_GROUPS.filter((group) => selected.includes(group.id)),
  );

  const addMore = await confirm({
    message: "Add custom filename rules?",
    default: false,
  });
  if (addMore) {
    documentTypeHints.push(...(await collectCustomHints()));
  }

  return documentTypeHints;
}

async function promptSourcesDir(defaultDir: string): Promise<string> {
  const sourcesDir = await input({
    message: "Sources folder (CSV, Excel, PDF, …):",
    default: defaultDir,
  });
  return sourcesDir.trim() || defaultDir;
}

async function buildInteractiveConfig(
  root: string,
  sourcesArg: string | undefined,
): Promise<WorkspaceConfig> {
  let existing: WorkspaceConfig | undefined;
  try {
    existing = readWorkspaceConfig(root);
  } catch {
    existing = undefined;
  }

  const documentTypeHints = await promptDocumentTypeHints(existing?.documentTypeHints ?? []);
  const defaultSources = sourcesArg ?? existing?.sourcesDir ?? DEFAULT_SOURCES_DIR;
  const sourcesDir = await promptSourcesDir(defaultSources);

  return {
    sourcesDir,
    documentTypeHints,
  };
}

export const initCommand: CommandHandler = async (args) => {
  if (!process.stdin.isTTY) {
    console.error("backed init requires an interactive terminal.");
    process.exitCode = 1;
    return;
  }

  const root = process.cwd();
  const positional = filterArgs(args)[0];

  const config = await buildInteractiveConfig(root, positional);

  if (!existsSync(path.resolve(root, config.sourcesDir))) {
    console.log(
      `Note: sources folder "${config.sourcesDir}" does not exist yet. Create it and add your files before running "backed model".`,
    );
  }

  const alreadyInitialized = existsSync(workspacePaths(root).configPath);
  const configPath = alreadyInitialized
    ? writeWorkspaceConfig(root, config)
    : initWorkspace(root, config);

  console.log(
    alreadyInitialized
      ? `Workspace updated: ${configPath}`
      : `Workspace initialized: ${configPath}`,
  );
  console.log(`Sources: ${config.sourcesDir}`);
  console.log(
    `Document type rules: ${String(config.documentTypeHints.length)} (edit in config before "backed model")`,
  );
  console.log('Next: review `.backed/config.yaml` if needed, then run "backed model".');
};
