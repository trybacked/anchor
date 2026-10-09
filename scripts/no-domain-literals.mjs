#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

const SCAN_DIRS = ["packages"];

const ALLOWED_PATH_PARTS = [
  "adapter-",
  "/capability-documents/",
  "/capability-tabular/",
  "/ontology-ai/",
  "/tests/",
  "/fixtures/",
  "/scripts/",
];

const DENYLIST = [
  /\bdocument_elements\b/,
  /\bdocument_entities\b/,
  /\bdocument_mentions\b/,
  /\bdocument_facts\b/,
  /\bdocument_chunks\b/,
  /\bdocument_lines\b/,
  /\bdocument_pages\b/,
  /\bentity_profiles\b/,
  /\bdoc_type_table_prefix\b/i,
  /\bpublic_organization\b/,
  /\bprivate_organization\b/,
  /\bsupport_unit\b/,
  /\bperson_organization_affiliation\b/,
  /\bgara\b/i,
  /\bappalt/i,
  /\bstazione appaltante/i,
  /\bcig\b/,
  /\bimpresa\b/i,
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
