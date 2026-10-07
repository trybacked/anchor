#!/usr/bin/env node
/**
 * no-domain-literals — CI guardrail (Plan Phase 0).
 *
 * Engine packages must not encode tenant/domain knowledge: no document-table
 * names, no COV entity ids, no Italian procurement keywords, no Databricks
 * volume/catalog conventions. Adapter and fixture code may reference them.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

/** Scanned roots: engine source only. Adapters and tests are allowlisted by path. */
const SCAN_DIRS = ["packages"];

/** Path segments that legitimately own domain/storage literals. */
const ALLOWED_PATH_PARTS = [
  "adapter-",
  "/provider-databricks/",
  "/capability-documents/",
  "/capability-tabular/",
  "/ontology-ai/",
  "/tests/",
  "/fixtures/",
  "/scripts/",
];

/** Literal fragments that must never leak into engine source. */
const DENYLIST = [
  // Document warehouse contract (legacy tables.ts names)
  /\bdocument_elements\b/,
  /\bdocument_entities\b/,
  /\bdocument_mentions\b/,
  /\bdocument_facts\b/,
  /\bdocument_chunks\b/,
  /\bdocument_lines\b/,
  /\bdocument_pages\b/,
  /\bentity_profiles\b/,
  /\bdoc_type_table_prefix\b/i,
  // COV / Italian PA entity ids
  /\bpublic_organization\b/,
  /\bprivate_organization\b/,
  /\bsupport_unit\b/,
  /\bperson_organization_affiliation\b/,
  // Italian procurement / document-archive heuristics
  /\bgara\b/i,
  /\bappalt/i,
  /\bstazione appaltante/i,
  /\bcig\b/,
  /\bimpresa\b/i,
  // Storage/catalog conventions
  /backed_\$\{/,
  /\/Volumes\//,
];

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      walk(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

const violations = [];
for (const dir of SCAN_DIRS) {
  const base = join(ROOT, dir);
  let files;
  try {
    files = walk(base);
  } catch {
    continue;
  }
  for (const file of files) {
    const rel = relative(ROOT, file).replaceAll("\\", "/");
    if (ALLOWED_PATH_PARTS.some((part) => rel.includes(part))) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      // Strip comments and string-unrelated noise: we still check strings since
      // domain literals inside SQL/template strings are exactly what we hunt.
      const commentOnly = line.trim().startsWith("//") || line.trim().startsWith("*");
      if (commentOnly) return;
      for (const pattern of DENYLIST) {
        if (pattern.test(line)) {
          violations.push(`${rel}:${i + 1}: ${pattern} → ${line.trim().slice(0, 120)}`);
        }
      }
    });
  }
}

if (violations.length > 0) {
  console.error(`no-domain-literals: ${violations.length} violation(s):\n`);
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log("no-domain-literals: OK (engine source is domain-free)");
