import type { Ontology } from "@trybacked/core";
import { describe, expect, it } from "vitest";
import { compileObjectQuery } from "../../src/index.js";

const procurementOntology: Ontology = {
  metadata: { formatVersion: "1", id: "demo", version: 1 },
  objects: [
    {
      id: "organization",
      name: "Organization",
      sourceDatasetId: "backed.anac.organizations",
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
      sourceDatasetId: "backed.anac.contracts",
      properties: [
        { id: "cig", name: "CIG", type: "string", role: "primary_key" },
        { id: "oggetto_gara", name: "Subject", type: "string", role: "attribute" },
        { id: "cf_amministrazione_appaltante", name: "Org CF", type: "string", role: "attribute" },
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

describe("compileObjectQuery joins", () => {
  it("compiles multi-hop joins with filters on related objects and contains", () => {
    const compiled = compileObjectQuery(procurementOntology, {
      objectId: "contract",
      joins: [{ relationshipId: "project_has_contracts" }],
      filters: [
        { objectId: "project", propertyId: "name", op: "eq", value: "X" },
        { propertyId: "oggetto_gara", op: "contains", value: "pagament" },
      ],
      limit: 20,
    });

    expect(compiled.joinedObjectIds).toEqual(["contract", "project"]);
    expect(compiled.sql).toContain("FROM `backed`.`anac`.`contracts` AS `o0`");
    expect(compiled.sql).toContain("EXISTS (SELECT 1 FROM `backed`.`docs`.`projects` AS `o1`");
    expect(compiled.sql).toContain("`o0`.`project_id` = `o1`.`project_id`");
    expect(compiled.sql).toContain("`o1`.`name` = :p1");
    expect(compiled.sql).toContain("LOWER(`o0`.`oggetto_gara`) LIKE LOWER(:p0)");
    expect(compiled.parameters).toEqual([
      { name: "p0", value: "%pagament%" },
      { name: "p1", value: "X" },
    ]);
    expect(compiled.sql).toContain("LIMIT 20");
  });

  it("compiles count mode over a join graph", () => {
    const compiled = compileObjectQuery(procurementOntology, {
      objectId: "contract",
      joins: [{ relationshipId: "organization_has_contracts" }],
      filters: [
        {
          objectId: "organization",
          propertyId: "denominazione_amministrazione_appaltante",
          op: "contains",
          value: "Gerace",
        },
      ],
      mode: "count",
    });
    expect(compiled.sql).toBe(
      "SELECT COUNT(*) AS `count` FROM `backed`.`anac`.`contracts` AS `o0` WHERE EXISTS (SELECT 1 FROM `backed`.`anac`.`organizations` AS `o1`\n\nWHERE `o0`.`cf_amministrazione_appaltante` = `o1`.`cf_amministrazione_appaltante` AND LOWER(`o1`.`denominazione_amministrazione_appaltante`) LIKE LOWER(:p0))",
    );
  });

  it("uses INNER JOIN when select includes joined object properties", () => {
    const compiled = compileObjectQuery(procurementOntology, {
      objectId: "contract",
      joins: [{ relationshipId: "organization_has_contracts" }],
      select: ["cig", "organization.denominazione_amministrazione_appaltante"],
      filters: [
        {
          objectId: "organization",
          propertyId: "denominazione_amministrazione_appaltante",
          op: "contains",
          value: "Gerace",
        },
      ],
      limit: 5,
    });
    expect(compiled.sql).toContain(
      "INNER JOIN `backed`.`anac`.`organizations` AS `o1` ON `o0`.`cf_amministrazione_appaltante` = `o1`.`cf_amministrazione_appaltante`",
    );
    expect(compiled.columns).toContain("organization.denominazione_amministrazione_appaltante");
  });

  it("compiles textSearch as OR across string columns", () => {
    const compiled = compileObjectQuery(procurementOntology, {
      objectId: "contract",
      textSearch: { query: "inconsistenza pagamenti" },
      limit: 5,
    });
    expect(compiled.sql).toContain(
      "(LOWER(`o0`.`cig`) LIKE LOWER(:p0) OR LOWER(`o0`.`oggetto_gara`) LIKE LOWER(:p0) OR LOWER(`o0`.`cf_amministrazione_appaltante`) LIKE LOWER(:p0))",
    );
    expect(compiled.parameters).toEqual([{ name: "p0", value: "%inconsistenza pagamenti%" }]);
  });

  it("rejects a join that does not touch the current object", () => {
    expect(() =>
      compileObjectQuery(procurementOntology, {
        objectId: "contract",
        joins: [{ relationshipId: "organization_has_contracts" }, { relationshipId: "project_has_contracts" }],
        filters: [],
      }),
    ).toThrow(/does not touch object/);
  });
});
