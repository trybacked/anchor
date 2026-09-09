import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HELPERS_DIR = dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = join(HELPERS_DIR, "../../../..");
export const CLI_PATH = join(REPO_ROOT, "apps/cli/dist/cli.js");
export const NODE_EXECUTABLE = process.execPath;

export const PMI_MINIMAL_FIXTURE = join(REPO_ROOT, "fixtures/pmi-minimal");
export const PMI_MINIMAL_NUMERIC_FIXTURE = join(REPO_ROOT, "fixtures/pmi-minimal-numeric");
