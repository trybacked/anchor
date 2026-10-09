import type { Ontology } from "@trybacked/core";

export const procurementOntology: Ontology = {
  metadata: { formatVersion: "1", id: "demo", version: 1 },
  objects: [
    {
      id: "organization",
      name: "Organization",
      sourceDatasetId: "demo.procurement.organizations",
      properties: [
        { id: "cf_amministrazione_appaltante", name: "CF", type: "string", role: "primary_key" },
        {
          id: "denominazione_amministrazione_appaltante",
          name: "Name",
          type: "string",
          role: "attribute",
        },
      ],
    },
    {
      id: "contract",
      name: "Contract",
      sourceDatasetId: "demo.procurement.contracts",
      properties: [
        { id: "cig", name: "CIG", type: "string", role: "primary_key" },
        { id: "oggetto_gara", name: "Subject", type: "string", role: "attribute" },
        { id: "cf_amministrazione_appaltante", name: "Org CF", type: "string", role: "attribute" },
        { id: "project_id", name: "Project id", type: "string", role: "attribute" },
      ],
    },
    {
      id: "project",
      name: "Project",
      sourceDatasetId: "backed.docs.projects",
      properties: [
        { id: "project_id", name: "Project id", type: "string", role: "primary_key" },
        { id: "name", name: "Name", type: "string", role: "attribute" },
      ],
    },
  ],
  relationships: [
    {
      id: "organization_has_contracts",
      name: "Organization has contracts",
      fromObjectId: "organization",
      toObjectId: "contract",
      fromPropertyId: "cf_amministrazione_appaltante",
      toPropertyId: "cf_amministrazione_appaltante",
      cardinality: "one_to_many",
    },
    {
      id: "project_has_contracts",
      name: "Project has contracts",
      fromObjectId: "project",
      toObjectId: "contract",
      fromPropertyId: "project_id",
      toPropertyId: "project_id",
      cardinality: "one_to_many",
    },
  ],
  logic: [],
  actions: [],
};
