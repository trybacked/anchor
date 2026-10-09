import type { DocumentTablesSpec, Entity, Ontology, SemanticModel } from "@trybacked/core";
export type DocumentsDatasetResolver = {
  qualifyTable: (tableName: string) => string;
  documentsTable: string;
  documentElementsTable: string;
  documentEntitiesTable: string;
  entityProfilesTable: string;
};
function inferCatalogFromOntology(ontology: Ontology): string | undefined {
  for (const object of ontology.objects) {
    const datasetId = object.sourceDatasetId;
    if (datasetId === undefined) {
      continue;
    }
    const segment = datasetId.split(".")[0];
    if (segment !== undefined && segment.length > 0) {
      return segment;
    }
  }
  return undefined;
}

export function createDocumentsDatasetResolver(options: {
  ontology: Ontology;
  catalog?: string | undefined;
  documentsSchema?: string | undefined;
  tables: DocumentTablesSpec;
}): DocumentsDatasetResolver | undefined {
  const catalog = options.catalog ?? inferCatalogFromOntology(options.ontology);
  const schema = options.documentsSchema ?? "docs";
  if (catalog === undefined || catalog.length === 0) {
    return undefined;
  }
  const qualifyTable = (tableName: string): string =>
    [catalog, schema, tableName].map(quoteIdentifier).join(".");
  return {
    qualifyTable,
    documentsTable: qualifyTable(options.tables.documents),
    documentElementsTable: qualifyTable(options.tables.documentElements),
    documentEntitiesTable: qualifyTable(options.tables.documentEntities),
    entityProfilesTable: qualifyTable(options.tables.entityProfiles),
  };
}
export function resolveEntityTable(
  model: SemanticModel,
  ontology: Ontology,
  entityId: string,
  documents: DocumentsDatasetResolver | undefined,
): string | null {
  const object = ontology.objects.find((candidate) => candidate.id === entityId);
  if (object?.sourceDatasetId !== undefined) {
    return object.sourceDatasetId;
  }
  const entity = model.entities.find((candidate) => candidate.id === entityId);
  if (entity?.sourceTable === undefined) {
    return null;
  }
  if (documents !== undefined) {
    return documents.qualifyTable(entity.sourceTable);
  }
  return null;
}
export function findEntity(model: SemanticModel, entityId: string): Entity | undefined {
  return model.entities.find((candidate) => candidate.id === entityId);
}
function quoteIdentifier(identifier: string): string {
  return `\`${identifier.replaceAll("`", "``")}\``;
}
