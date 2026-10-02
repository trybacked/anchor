import {
  PlanTemplateStructureError,
  type PlanTemplate,
  type PlanTemplateParam,
} from "./plan-template.js";
import type { ObjectQueryRequest } from "./plan-types.js";

const PLACEHOLDER_PATTERN = /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

export type TemplateParamValues = Record<string, string | number>;

export type InstantiatedChunkSearchStep = {
  type: "chunkSearch";
  id: string;
  query: string;
  limit: number;
};

export type InstantiatedObjectQueryStep = {
  type: "objectQuery";
  id: string;
  query: ObjectQueryRequest;
  consumes: string[];
};

export type InstantiatedPlanStep = InstantiatedChunkSearchStep | InstantiatedObjectQueryStep;

export type InstantiatedPlan = {
  templateId: string;
  steps: InstantiatedPlanStep[];
};

function coerceParamValue(param: PlanTemplateParam, raw: string | number): string | number {
  if (param.type === "number") {
    if (typeof raw === "number") {
      return raw;
    }
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      throw new PlanTemplateStructureError(
        `Parameter "${param.name}" must be a number, got ${JSON.stringify(raw)}.`,
      );
    }
    return parsed;
  }
  return typeof raw === "string" ? raw : String(raw);
}

function assertParamsForTemplate(template: PlanTemplate, params: TemplateParamValues): void {
  for (const spec of template.params) {
    const value = params[spec.name];
    if (value === undefined || value === "") {
      throw new PlanTemplateStructureError(`Missing template parameter "${spec.name}".`);
    }
    coerceParamValue(spec, value);
  }
}

function substitutePlaceholdersInString(
  input: string,
  params: TemplateParamValues,
  template: PlanTemplate,
): string {
  return input.replace(PLACEHOLDER_PATTERN, (_match, name: string) => {
    const spec = template.params.find((param) => param.name === name);
    if (spec === undefined) {
      throw new PlanTemplateStructureError(
        `Unknown placeholder \${${name}} in template "${template.id}".`,
      );
    }
    const raw = params[name];
    if (raw === undefined) {
      throw new PlanTemplateStructureError(
        `Unresolved placeholder \${${name}} in template "${template.id}".`,
      );
    }
    const coerced = coerceParamValue(spec, raw);
    return String(coerced);
  });
}

function substituteInFilterValue(
  value: ObjectQueryRequest["filters"][number]["value"],
  params: TemplateParamValues,
  template: PlanTemplate,
): ObjectQueryRequest["filters"][number]["value"] {
  if (typeof value === "string") {
    const replaced = substitutePlaceholdersInString(value, params, template);
    if (PLACEHOLDER_PATTERN.test(replaced)) {
      throw new PlanTemplateStructureError(
        `Unresolved placeholder in filter value for template "${template.id}".`,
      );
    }
    PLACEHOLDER_PATTERN.lastIndex = 0;
    return replaced;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => {
      if (typeof entry === "string") {
        return substitutePlaceholdersInString(entry, params, template);
      }
      return entry;
    });
  }
  return value;
}

function instantiateObjectQuery(
  query: ObjectQueryRequest,
  params: TemplateParamValues,
  template: PlanTemplate,
): ObjectQueryRequest {
  const filters = query.filters.map((filter) => ({
    ...filter,
    value: substituteInFilterValue(filter.value, params, template),
  }));
  const textSearch =
    query.textSearch === undefined
      ? undefined
      : {
          ...query.textSearch,
          query: substitutePlaceholdersInString(query.textSearch.query, params, template),
        };
  if (textSearch !== undefined && PLACEHOLDER_PATTERN.test(textSearch.query)) {
    PLACEHOLDER_PATTERN.lastIndex = 0;
    throw new PlanTemplateStructureError(
      `Unresolved placeholder in textSearch for template "${template.id}".`,
    );
  }
  PLACEHOLDER_PATTERN.lastIndex = 0;
  return {
    ...query,
    filters,
    ...(textSearch !== undefined ? { textSearch } : {}),
  };
}

export function instantiatePlanTemplate(
  template: PlanTemplate,
  params: TemplateParamValues,
): InstantiatedPlan {
  assertParamsForTemplate(template, params);
  const steps: InstantiatedPlanStep[] = [];

  for (const step of template.steps) {
    if (step.type === "chunkSearch") {
      const rawQuery = params[step.queryParam];
      if (rawQuery === undefined) {
        throw new PlanTemplateStructureError(
          `Missing chunk search parameter "${step.queryParam}".`,
        );
      }
      steps.push({
        type: "chunkSearch",
        id: step.id,
        query: String(rawQuery),
        limit: step.limit,
      });
      continue;
    }

    steps.push({
      type: "objectQuery",
      id: step.id,
      query: instantiateObjectQuery(step.query, params, template),
      consumes: step.consumes ?? [],
    });
  }

  return { templateId: template.id, steps };
}

export function collectTemplateRowLimits(steps: InstantiatedPlanStep[]): number[] {
  const limits: number[] = [];
  for (const step of steps) {
    if (step.type === "chunkSearch") {
      limits.push(step.limit);
      continue;
    }
    const mode = step.query.mode ?? "rows";
    if (mode === "count") {
      continue;
    }
    limits.push(step.query.limit ?? 15);
  }
  return limits;
}
