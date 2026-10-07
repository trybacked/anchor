#!/usr/bin/env node
import { cpSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const anchorRoot = join(scriptDir, "..");
const task = process.argv[2];

function copyFile(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
}

function copyDir(from, to) {
  cpSync(from, to, { recursive: true });
}

switch (task) {
  case "control-plane-schema": {
    copyFile(
      join(anchorRoot, "apps/control-plane/src/db/schema.sql"),
      join(anchorRoot, "apps/control-plane/dist/db/schema.sql"),
    );
    break;
  }
  case "cli-tenant-yaml": {
    const fromDir = join(anchorRoot, "apps/cli/src/tenant");
    const toDir = join(anchorRoot, "apps/cli/dist/tenant");
    mkdirSync(toDir, { recursive: true });
    for (const name of readdirSync(fromDir)) {
      if (name.endsWith(".yaml") || name.endsWith(".yml")) {
        copyFile(join(fromDir, name), join(toDir, name));
      }
    }
    break;
  }
  case "platform-admin-assets": {
    copyDir(
      join(anchorRoot, "packages/platform-admin/src/assets"),
      join(anchorRoot, "packages/platform-admin/dist/assets"),
    );
    break;
  }
  default:
    console.error(`Unknown copy-dist task: ${task ?? "(missing)"}`);
    process.exit(1);
}
