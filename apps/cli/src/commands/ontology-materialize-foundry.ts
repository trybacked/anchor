import { readWorkspaceConfig } from "@trybacked/core";
import { duckDbPathFromEnv, materializeFoundryRowsToDuckDb } from "@trybacked/infrastructure";
import {
  buildFoundryTableRows,
  defaultFoundryCatalog,
  FoundryExtractOutputSchema,
  synthesizeFoundryExtractFromSeed,
  type FoundrySeedPayload,
} from "@trybacked/ontology-extract";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { isHelpFlag } from "../config.js";
import { loadWorkspaceDotEnv } from "../env.js";
import type { CommandHandler } from "../types.js";
import { initUi } from "../ui/index.js";

function readArgValue(args: string[], prefix: string): string | undefined {
  const hit = args.find((arg) => arg.startsWith(prefix));
  if (hit === undefined) {
    return undefined;
  }
  return hit.slice(prefix.length).trim();
}

function loadSeed(root: string, seedPath: string): FoundrySeedPayload {
  const absolute = resolve(root, seedPath);
  const raw = JSON.parse(readFileSync(absolute, "utf8")) as Partial<FoundrySeedPayload>;
  return {
    schema: "docs",
    military_assets: [],
    linkTypes: [],
    doubts: [],
    note: "",
    documents: [],
    organizations: [],
    persons: [],
    legal_instruments: [],
    topics: [],
    catalog: "backed_default",
    ...raw,
  };
}

export const ontologyMaterializeFoundryCommand: CommandHandler = async (args) => {
  loadWorkspaceDotEnv(process.cwd());
  const ui = initUi();
  if (args.some(isHelpFlag)) {
    ui.log(
      "Usage: backed ontology materialize-foundry [--seed-path=seed/foundry-instances.json] [--extract-path=runs/…/foundry-extract.json] [--duckdb-path=.backed/warehouse.duckdb]",
    );
    ui.log("  Builds docs.* tables in DuckDB for query_objects. Set BACKED_DUCKDB_PATH in .env.");
    return;
  }

  const root = loadWorkspaceDotEnv(process.cwd());
  let catalogForPath = "backed_default";
  try {
    const seedPreview = loadSeed(
      root,
      readArgValue(args, "--seed-path=") ?? join("seed", "foundry-instances.json"),
    );
    catalogForPath = seedPreview.catalog;
  } catch {
    /* resolved below */
  }
  const duckPath =
    readArgValue(args, "--duckdb-path=") ??
    duckDbPathFromEnv(process.env) ??
    join(root, ".backed", `${catalogForPath}.duckdb`);

  const seedPath = readArgValue(args, "--seed-path=") ?? join("seed", "foundry-instances.json");
  if (!existsSync(resolve(root, seedPath))) {
    ui.writeError(`Seed not found: ${seedPath}. Run "backed ontology extract-foundry" first.`);
    process.exitCode = 1;
    return;
  }

  const seed = loadSeed(root, seedPath);
  let ontologyId = "default";
  try {
    ontologyId = readWorkspaceConfig(root).ontologyId ?? ontologyId;
  } catch {
    /* optional */
  }
  const catalog = seed.catalog.length > 0 ? seed.catalog : defaultFoundryCatalog(ontologyId);

  const extractArg = readArgValue(args, "--extract-path=");
  const extractPath = extractArg !== undefined ? resolve(root, extractArg) : undefined;

  let output;
  if (extractPath !== undefined && existsSync(extractPath)) {
    output = FoundryExtractOutputSchema.parse(JSON.parse(readFileSync(extractPath, "utf8")));
  } else {
    ui.step("No extract artifact — synthesizing instance links from seed (heuristic).");
    output = synthesizeFoundryExtractFromSeed(seed);
  }

  const rows = buildFoundryTableRows(output, seed);
  const json = args.includes("--json");
  ui.heading("Foundry materialize");
  ui.step(`DuckDB → ${duckPath} · catalog ${catalog}`);

  const result = await materializeFoundryRowsToDuckDb({
    dbPath: duckPath,
    catalog,
    schema: seed.schema,
    rows,
  });

  if (json) {
    ui.log(JSON.stringify({ duckPath, catalog, ...result }, null, 2));
    return;
  }

  ui.writeSuccess(`Materialized ${String(result.tables.length)} table(s) → ${ui.path(duckPath)}`);
  for (const [table, count] of Object.entries(result.rowCounts)) {
    if (count > 0) {
      ui.detail(`${table}: ${String(count)} row(s)`);
    }
  }
  ui.step(
    'Set BACKED_DUCKDB_PATH and BACKED_CATALOG, then "backed anchor sync" and "backed anchor deploy".',
  );
};
