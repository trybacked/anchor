import type { SemanticModel } from "@trybacked/core";
import { readModelYaml } from "@trybacked/core";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const PMI_MINIMAL_FIXTURE_ROOT = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../fixtures/pmi-minimal",
);

export function loadPmiMinimalModel(): SemanticModel {
    return readModelYaml(PMI_MINIMAL_FIXTURE_ROOT);
}
