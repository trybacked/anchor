import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import {
    ModelElementNotFoundError,
    parseModelYaml,
    patchModelElement,
    PatchModelElementSchema,
    serializeModelYaml,
} from "@trybacked/core";
import type { PatchModelElement, SemanticModel } from "@trybacked/core";
import { resolveTenantWorkspace } from "@backed/runner";

export class ModelNotFoundError extends Error {
    constructor(message = "Model not found") {
        super(message);
        this.name = "ModelNotFoundError";
    }
}

export async function patchTenantModelElement(
    dataRoot: string,
    tenantId: string,
    patch: PatchModelElement,
): Promise<SemanticModel> {
    const workspace = resolveTenantWorkspace(dataRoot, tenantId);
    if (!existsSync(workspace.paths.modelPath)) {
        throw new ModelNotFoundError();
    }

    const validated = PatchModelElementSchema.parse(patch);
    const modelYaml = await readFile(workspace.paths.modelPath, "utf8");
    const model = parseModelYaml(modelYaml);
    const updated = patchModelElement(model, validated);
    await writeFile(workspace.paths.modelPath, serializeModelYaml(updated), "utf8");
    return updated;
}

export { ModelElementNotFoundError };
