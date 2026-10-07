#!/usr/bin/env node
import { cpSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
cpSync(join(pkgRoot, "src/assets"), join(pkgRoot, "dist/assets"), {
  recursive: true,
});
