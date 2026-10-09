import type { Entity, Relation, SemanticModel } from "@trybacked/core";
import { docsQualifiedTable } from "./spec.js";
import {
  buildFoundryDocumentSemanticModel,
  type BuildFoundryDocumentSemanticModelOptions,
} from "./build-model.js";

const CORE_OBJECT_TYPE_IDS = [
  "document",
  "organization",
  "person",
  "legal_instrument",
  "topic",
  "military_asset",
] as const;

const PROFILE_TABLE_BY_ENTITY: Record<(typeof CORE_OBJECT_TYPE_IDS)[number], string> = {
  document: "documents",
  organization: "organization_profiles",
  person: "person_profiles",
  legal_instrument: "legal_instrument_profiles",
  topic: "topic_profiles",
  military_asset: "military_asset_profiles",
};

function directSemanticLink(
  id: string,
  name: string,
  fromEntity: string,
  toEntity: string,
  joinTable: string,
  fromColumn: string,
  toColumn: string,
  catalog: string,
  evidence: string,
  cardinality: Relation["cardinality"] = "many_to_many",
): Relation {
  const table = docsQualifiedTable(catalog, joinTable);
  return {
    id,
    name,
    fromEntity,
    toEntity,
    fromColumn,
    toColumn,
    cardinality,
    status: "proposed",
    confidence: 0.92,
    provenance: {
      table,
      column: fromColumn,
      evidence,
      method: "human",
    },
  };
}

export type BuildPalantirStyleDocumentSemanticModelOptions =
  BuildFoundryDocumentSemanticModelOptions & {
    /** When set, only object types with at least one row in the warehouse are included (except Document). */
    tablesWithRows?: ReadonlySet<string> | undefined;
  };

export function buildPalantirStyleDocumentSemanticModel(
  options: BuildPalantirStyleDocumentSemanticModelOptions,
): SemanticModel {
  const foundry = buildFoundryDocumentSemanticModel(options);
  const coreIds = new Set<string>(CORE_OBJECT_TYPE_IDS);
  let entities: Entity[] = foundry.entities
    .filter((entity) => coreIds.has(entity.id))
    .map((entity) => ({
      ...entity,
      status: "proposed" as const,
      confidence: entity.confidence ?? 0.9,
    }));

  if (options.tablesWithRows !== undefined && options.tablesWithRows.size > 0) {
    entities = entities.filter((entity) => {
      if (entity.id === "document") {
        return true;
      }
      const table = PROFILE_TABLE_BY_ENTITY[entity.id as (typeof CORE_OBJECT_TYPE_IDS)[number]];
      return table !== undefined && options.tablesWithRows?.has(table);
    });
  }

  const entityIds = new Set(entities.map((entity) => entity.id));
  const { catalog } = options;

  const relations: Relation[] = [];

  if (entityIds.has("document") && entityIds.has("organization")) {
    relations.push(
      directSemanticLink(
        "document_mentions_organization",
        "Mentions organization",
        "document",
        "organization",
        "document_organization_mentions",
        "document_id",
        "normalized_name",
        catalog,
        "Organization referenced in document text (join via document_organization_mentions).",
      ),
    );
  }
  if (entityIds.has("document") && entityIds.has("person")) {
    relations.push(
      directSemanticLink(
        "document_mentions_person",
        "Mentions person",
        "document",
        "person",
        "document_person_mentions",
        "document_id",
        "normalized_name",
        catalog,
        "Person referenced in document text (join via document_person_mentions).",
      ),
    );
  }
  if (entityIds.has("document") && entityIds.has("topic")) {
    relations.push(
      directSemanticLink(
        "document_about_topic",
        "About topic",
        "document",
        "topic",
        "document_topic_mentions",
        "document_id",
        "normalized_name",
        catalog,
        "Thematic subject of the document (join via document_topic_mentions).",
      ),
    );
  }
  if (entityIds.has("document") && entityIds.has("legal_instrument")) {
    relations.push(
      directSemanticLink(
        "document_cites_legal_instrument",
        "Cites legal instrument",
        "document",
        "legal_instrument",
        "document_legal_instrument_mentions",
        "document_id",
        "normalized_name",
        catalog,
        "Legal instrument cited in document (join via document_legal_instrument_mentions).",
      ),
    );
  }
  if (entityIds.has("person") && entityIds.has("organization")) {
    relations.push(
      directSemanticLink(
        "person_affiliated_with_organization",
        "Affiliated with organization",
        "person",
        "organization",
        "person_organization_affiliations",
        "normalized_name",
        "normalized_name",
        catalog,
        "Person linked to organization from co-occurrence in corpus.",
        "many_to_many",
      ),
    );
  }

  return {
    metadata: foundry.metadata,
    entities,
    relations,
    rules: [],
  };
}
