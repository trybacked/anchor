import {
  assertPlanTemplateStructure,
  parsePlanTemplate,
  type PlanTemplate,
} from "./plan-template.js";
import { SEARCH_THEN_FILTER_TEMPLATE } from "./templates/search-then-filter.js";

export type PlanTemplateRegistry = {
  list: () => PlanTemplate[];
  get: (id: string) => PlanTemplate | undefined;
};

export function createPlanTemplateRegistry(templates: PlanTemplate[]): PlanTemplateRegistry {
  const byId = new Map<string, PlanTemplate>();
  for (const template of templates) {
    const parsed = parsePlanTemplate(template);
    assertPlanTemplateStructure(parsed);
    if (byId.has(parsed.id)) {
      throw new Error(`Duplicate plan template id "${parsed.id}".`);
    }
    byId.set(parsed.id, parsed);
  }

  return {
    list: () => [...byId.values()],
    get: (id) => byId.get(id),
  };
}

export function createDefaultPlanTemplateRegistry(): PlanTemplateRegistry {
  return createPlanTemplateRegistry([SEARCH_THEN_FILTER_TEMPLATE]);
}
