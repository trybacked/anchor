import { CLI_NAME, CLI_VERSION, SERVICES } from "../config.js";
import type { Command } from "../types.js";
import type { Ui } from "./format.js";
import { renderLogo } from "./logo.js";
export function printRootHelp(ui: Ui): void {
  ui.log(renderLogo());
  ui.blank();
  ui.log(`${ui.dim(`v${CLI_VERSION}`)} ${ui.dim("· Backed CLI")}`);
  ui.blank();
  ui.log(`${ui.label("Usage:")} ${ui.command(CLI_NAME)} ${ui.dim("<command> [args]")}`);
  ui.blank();
  ui.log(ui.label("Commands:"));
  ui.log(`  ${ui.command("version".padEnd(8))}  ${ui.dim("Print CLI version")}`);
  ui.log(
    `  ${ui.command(SERVICES.ANCHOR.padEnd(8))}  ${ui.dim("Ontology engine (init, run, sync, deploy)")}`,
  );
  ui.log(
    `  ${ui.command(SERVICES.FALCON.padEnd(8))}  ${ui.dim("UI capture pipeline (record → distill → report)")}`,
  );
  ui.log(`  ${ui.command("tenant".padEnd(8))}  ${ui.dim("Multi-tenant provisioning (create)")}`);
  ui.log(
    `  ${ui.command("platform".padEnd(8))}  ${ui.dim("Platform SP bootstrap and remote registry status")}`,
  );
  ui.blank();
  ui.log(
    `${ui.dim("Run")} ${ui.command(`${CLI_NAME} ${SERVICES.ANCHOR}`)} ${ui.dim("for the full command list.")}`,
  );
}
const FALCON_SUBCOMMANDS: ReadonlyArray<{ name: string; description: string }> = [
  { name: "record", description: "Capture a session (Swift on macOS, UIA on Windows)" },
  { name: "check", description: "Validate manifest + trace.raw" },
  { name: "ingest", description: "Normalize recorder JSONL to CaptureEvent rows" },
  { name: "analyze", description: "Scrub PII, segment, build analysis.json" },
  { name: "distill", description: "LLM process report (API key)" },
  { name: "report", description: "Print report.md to stdout" },
];

export function printFalconHelp(ui: Ui): void {
  ui.log(renderLogo());
  ui.blank();
  ui.log(
    `${ui.label("Usage:")} ${ui.command(CLI_NAME)} ${ui.command(SERVICES.FALCON)} ${ui.dim("<command> [args]")}`,
  );
  ui.blank();
  ui.log(ui.dim("Local UI shadowing: record → ingest → analyze → distill → report."));
  ui.blank();
  ui.log(ui.label("Commands:"));
  const nameWidth = Math.max(...FALCON_SUBCOMMANDS.map((cmd) => cmd.name.length), 8);
  for (const cmd of FALCON_SUBCOMMANDS) {
    ui.log(`  ${ui.command(cmd.name.padEnd(nameWidth))}  ${ui.dim(cmd.description)}`);
  }
  ui.blank();
  ui.log(
    `${ui.dim("Subcommand help:")} ${ui.command(`${CLI_NAME} ${SERVICES.FALCON} record --help`)}`,
  );
  ui.log(
    `${ui.dim("Setup:")} sibling ${ui.command("falcon/")} repo + uv, or ${ui.command("FALCON_BIN")} pointing at the Python CLI.`,
  );
}

export function printAnchorHelp(ui: Ui, commands: readonly Command[]): void {
  ui.log(renderLogo());
  ui.blank();
  ui.log(
    `${ui.label("Usage:")} ${ui.command(CLI_NAME)} ${ui.command(SERVICES.ANCHOR)} ${ui.dim("<command> [args]")}`,
  );
  ui.blank();
  ui.log(ui.label("Commands:"));
  const nameWidth = Math.max(...commands.map((cmd) => cmd.name.length), 8);
  for (const cmd of commands) {
    ui.log(`  ${ui.command(cmd.name.padEnd(nameWidth))}  ${ui.dim(cmd.description)}`);
  }
}
export function printHelp(ui: Ui, commands: readonly Command[]): void {
  printAnchorHelp(ui, commands);
}
