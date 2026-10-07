#!/usr/bin/env node
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const dest = join(appRoot, "dist/db/schema.sql");
mkdirSync(dirname(dest), { recursive: true });
cpSync(join(appRoot, "src/db/schema.sql"), dest);
