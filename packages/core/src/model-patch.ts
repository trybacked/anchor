import { z } from "zod";
import { ElementStatusSchema } from "./model.js";
import type { ElementStatus, SemanticModel } from "./model.js";

export const ModelElementKindSchema = z.enum(["entity", "relation", "rule"]);
export type ModelElementKind = z.infer<typeof ModelElementKindSchema>;

export const PatchModelElementSchema = z
    .object({
        kind: ModelElementKindSchema,
        id: z.string().min(1),
        status: ElementStatusSchema,
        name: z.string().min(1).optional(),
    })
    .refine((patch) => patch.status !== "renamed" || patch.name !== undefined, {
        message: "A 'renamed' status requires name",
    });

export type PatchModelElement = z.infer<typeof PatchModelElementSchema>;

export class ModelElementNotFoundError extends Error {
    constructor(
        public readonly kind: ModelElementKind,
        public readonly id: string,
    ) {
        super(`Model element not found: ${kind}:${id}`);
        this.name = "ModelElementNotFoundError";
    }
}

function updateElementStatus<T extends { id: string; name: string; status: ElementStatus }>(
    elements: T[],
    id: string,
    status: ElementStatus,
    name?: string,
): { elements: T[]; found: boolean } {
    let found = false;
    const nextElements = elements.map((element) => {
        if (element.id !== id) {
            return element;
        }
        found = true;
        if (status === "renamed" && name !== undefined) {
            return { ...element, status, name };
        }
        return { ...element, status };
    });
    return { elements: nextElements, found };
}

export function patchModelElement(model: SemanticModel, patch: PatchModelElement): SemanticModel {
    const validated = PatchModelElementSchema.parse(patch);

    switch (validated.kind) {
        case "entity": {
            const { elements: entities, found } = updateElementStatus(
                model.entities,
                validated.id,
                validated.status,
                validated.name,
            );
            if (!found) {
                throw new ModelElementNotFoundError(validated.kind, validated.id);
            }
            return { ...model, entities };
        }
        case "relation": {
            const { elements: relations, found } = updateElementStatus(
                model.relations,
                validated.id,
                validated.status,
                validated.name,
            );
            if (!found) {
                throw new ModelElementNotFoundError(validated.kind, validated.id);
            }
            return { ...model, relations };
        }
        case "rule": {
            const { elements: rules, found } = updateElementStatus(
                model.rules,
                validated.id,
                validated.status,
                validated.name,
            );
            if (!found) {
                throw new ModelElementNotFoundError(validated.kind, validated.id);
            }
            return { ...model, rules };
        }
        default: {
            const _exhaustive: never = validated.kind;
            return _exhaustive;
        }
    }
}
