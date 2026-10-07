#!/usr/bin/env node
import {
  ANCHOR_COMMAND_NAMES,
  ANCHOR_COMMANDS,
  dispatchAnchorCommand,
  UnknownAnchorCommandError,
} from "./anchor-commands.js";
import { ontologyDiscoverDocsAiCommand } from "./commands/ontology-discover-docs-ai.js";
import { ontologyDiscoverDocsCommand } from "./commands/ontology-discover-docs.js";
import { ontologyDiscoveryReviewCommand } from "./commands/ontology-discovery-review.js";
import { ontologyImportCommand } from "./commands/ontology-import.js";
import { platformBootstrapCommand, platformStatusCommand } from "./commands/platform-bootstrap.js";
import { tenantCreateCommand } from "./commands/tenant-create.js";
import { printCliVersion } from "./commands/version.js";
import { formatCliCommand, isHelpFlag, isVersionFlag, SERVICES } from "./config.js";
import { loadWorkspaceDotEnv } from "./env.js";
import { getUi, initUi, printAnchorHelp, printRootHelp } from "./ui/index.js";
export const COMMANDS = ANCHOR_COMMANDS;
export function printCliHelp(): void {
  printRootHelp(getUi());
}
function loadDotEnv(): void {
  loadWorkspaceDotEnv(process.cwd());
}
async function runAnchorCommand(commandName: string, args: string[]): Promise<void> {
  try {
    await dispatchAnchorCommand(commandName, args);
  } catch (error) {
    if (error instanceof UnknownAnchorCommandError) {
      const ui = getUi();
      ui.writeError(error.message);
      ui.blank();
      printAnchorHelp(ui, ANCHOR_COMMANDS);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}
async function main(): Promise<void> {
  initUi();
  const argv = process.argv.slice(2);
  if (argv.length === 0 || isHelpFlag(argv[0] ?? "")) {
    printRootHelp(getUi());
    return;
  }
  const first = argv[0];
  if (first === undefined) {
    printRootHelp(getUi());
    return;
  }
  const second = argv[1];
  const rest = argv.slice(2);
  if (isVersionFlag(first)) {
    printCliVersion();
    return;
  }
  if (first === "platform") {
    if (second === undefined || isHelpFlag(second)) {
      getUi().log("Usage: backed platform bootstrap | status");
      return;
    }
    if (second === "bootstrap") {
      platformBootstrapCommand(rest);
      return;
    }
    if (second === "status") {
      await platformStatusCommand(rest);
      return;
    }
    getUi().writeError(`Unknown platform subcommand: ${second}`);
    process.exitCode = 1;
    return;
  }
  if (first === "ontology") {
    if (second === "import") {
      await ontologyImportCommand(rest);
      return;
    }
    if (second === "discover-docs") {
      await ontologyDiscoverDocsCommand(rest);
      return;
    }
    if (second === "discover-docs-ai") {
      await ontologyDiscoverDocsAiCommand(rest);
      return;
    }
    if (second === "discovery-review") {
      await ontologyDiscoveryReviewCommand(rest);
      return;
    }
    getUi().writeError(
      "Usage: backed ontology import | discover-docs | discover-docs-ai | discovery-review … (see backed ontology --help)",
    );
    process.exitCode = 1;
    return;
  }
  if (first === "tenant") {
    if (second === undefined || isHelpFlag(second)) {
      getUi().log("Usage: backed tenant create <tenant-id>");
      return;
    }
    if (second === "create") {
      await tenantCreateCommand(rest);
      return;
    }
    getUi().writeError(`Unknown tenant subcommand: ${second}`);
    process.exitCode = 1;
    return;
  }
  if (first === SERVICES.ANCHOR) {
    if (second === undefined || isHelpFlag(second)) {
      printAnchorHelp(getUi(), ANCHOR_COMMANDS);
      return;
    }
    loadDotEnv();
    await runAnchorCommand(second, rest);
    return;
  }
  const legacyAliases: Record<string, string> = {
    discover: "pull",
    serve: "deploy",
    publish: "sync",
    register: "sync",
  };
  if (legacyAliases[first] !== undefined || ANCHOR_COMMAND_NAMES.has(first)) {
    const ui = getUi();
    const canonical = legacyAliases[first] ?? first;
    ui.log(ui.dim(`Prefer ${formatCliCommand(canonical)} — running top-level alias.`));
    loadDotEnv();
    await runAnchorCommand(first, argv.slice(1));
    return;
  }
  const ui = getUi();
  ui.writeError(`Unknown command: ${first}`);
  ui.blank();
  printRootHelp(ui);
  process.exitCode = 1;
}
main().catch((error: unknown) => {
  const ui = getUi();
  ui.writeError(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
