#!/usr/bin/env node
import { cpSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const fromDir = join(appRoot, "src/tenant");
const toDir = join(appRoot, "dist/tenant");
mkdirSync(toDir, { recursive: true });
for (const name of readdirSync(fromDir)) {
  if (name.endsWith(".yaml") || name.endsWith(".yml")) {
    cpSync(join(fromDir, name), join(toDir, name));
  }
}
