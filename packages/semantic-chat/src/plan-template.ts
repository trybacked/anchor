import { z } from "zod";
import { ObjectQueryRequestSchema } from "./plan-types.js";

export const PlanTemplateParamSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  type: z.enum(["string", "number"]),
});

export const PlanTemplateChunkSearchStepSchema = z.object({
  type: z.literal("chunkSearch"),
  id: z.string().min(1),
  queryParam: z.string().min(1),
  limit: z.number().int().positive().max(50).default(20),
});

export const PlanTemplateObjectQueryStepSchema = z.object({
  type: z.literal("objectQuery"),
  id: z.string().min(1),
  query: ObjectQueryRequestSchema,
  consumes: z.array(z.string().min(1)).optional(),
});

export const PlanTemplateStepSchema = z.discriminatedUnion("type", [
  PlanTemplateChunkSearchStepSchema,
  PlanTemplateObjectQueryStepSchema,
]);

export const PlanTemplateSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  params: z.array(PlanTemplateParamSchema).min(1),
  steps: z.array(PlanTemplateStepSchema).min(1).max(3),
});

export type PlanTemplateParam = z.infer<typeof PlanTemplateParamSchema>;
export type PlanTemplateStep = z.infer<typeof PlanTemplateStepSchema>;
export type PlanTemplate = z.infer<typeof PlanTemplateSchema>;

export class PlanTemplateStructureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanTemplateStructureError";
  }
}

/** Cross-field checks beyond Zod shape (param names, consumes → prior chunkSearch). */
export function assertPlanTemplateStructure(template: PlanTemplate): void {
  const paramNames = new Set(template.params.map((param) => param.name));
  const stepIds = new Set<string>();

  for (const step of template.steps) {
    if (stepIds.has(step.id)) {
      throw new PlanTemplateStructureError(
        `Duplicate step id "${step.id}" in template "${template.id}".`,
      );
    }
    stepIds.add(step.id);
  }

  for (let index = 0; index < template.steps.length; index += 1) {
    const step = template.steps[index];
    if (step === undefined) {
      continue;
    }
    if (step.type === "chunkSearch") {
      if (!paramNames.has(step.queryParam)) {
        throw new PlanTemplateStructureError(
          `Step "${step.id}" queryParam "${step.queryParam}" is not declared in template params.`,
        );
      }
      continue;
    }

    for (const consumedId of step.consumes ?? []) {
      const consumed = template.steps.find((candidate) => candidate.id === consumedId);
      if (consumed === undefined) {
        throw new PlanTemplateStructureError(
          `Step "${step.id}" consumes unknown step "${consumedId}".`,
        );
      }
      const consumedIndex = template.steps.findIndex((candidate) => candidate.id === consumedId);
      if (consumedIndex >= index) {
        throw new PlanTemplateStructureError(
          `Step "${step.id}" must consume a chunkSearch step that appears earlier.`,
        );
      }
      if (consumed.type !== "chunkSearch") {
        throw new PlanTemplateStructureError(
          `Step "${step.id}" consumes "${consumedId}" which is not a chunkSearch step.`,
        );
      }
    }
  }
}

export function parsePlanTemplate(raw: unknown): PlanTemplate {
  const parsed = PlanTemplateSchema.safeParse(raw);
  if (!parsed.success) {
    throw new PlanTemplateStructureError(
      parsed.error.issues[0]?.message ?? "Invalid plan template shape.",
    );
  }
  assertPlanTemplateStructure(parsed.data);
  return parsed.data;
}
