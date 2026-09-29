import type { PlanTemplate } from "../plan-template.js";

export const SEARCH_THEN_FILTER_TEMPLATE: PlanTemplate = {
  id: "search-then-filter",
  description:
    "Search the document archive for relevant passages, then list contracts linked to those documents for a given ingest month (source_year_month).",
  params: [
    {
      name: "query",
      description: "Natural-language or keyword text to search in archived documents.",
      type: "string",
    },
    {
      name: "month",
      description: 'Ingest month filter on contracts as YYYY-MM (e.g. "2025-06").',
      type: "string",
    },
  ],
  steps: [
    {
      type: "chunkSearch",
      id: "search",
      queryParam: "query",
      limit: 20,
    },
    {
      type: "objectQuery",
      id: "contracts",
      consumes: ["search"],
      query: {
        entityId: "contract",
        mode: "rows",
        limit: 15,
        filters: [
          {
            propertyId: "source_year_month",
            op: "eq",
            value: "${month}",
          },
        ],
      },
    },
  ],
};
