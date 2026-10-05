import type { Ontology, OntologyObject } from "@trybacked/core";
import { ObjectQueryCompileError } from "./errors.js";
import { compileObjectFilter, compileTextSearch } from "./filters.js";
import { compileJoinOnClause, resolveObjectInPlan, type JoinPlan } from "./join-plan.js";
import type { SqlParameter } from "./query.js";
function quoteIdentifier(identifier: string): string {
  return `\`${identifier.replaceAll("`", "``")}\``;
}
function quoteDatasetId(datasetId: string): string {
  return datasetId.split(".").map(quoteIdentifier).join(".");
}
function resolveObject(ontology: Ontology, objectId: string): OntologyObject {
  const object = ontology.objects.find((candidate) => candidate.id === objectId);
  if (object === undefined) {
    throw new ObjectQueryCompileError(
      "unknown_object",
      `Object "${objectId}" is not part of the ontology.`,
    );
  }
  return object;
}
function resolveDatasetId(object: OntologyObject): string {
  if (object.sourceDatasetId === undefined) {
    throw new ObjectQueryCompileError(
      "missing_dataset_mapping",
      `Object "${object.id}" has no backing dataset mapping (sourceDatasetId).`,
    );
  }
  return object.sourceDatasetId;
}
export function queryUsesPhysicalJoins(
  rootObjectId: string,
  select: string[] | undefined,
): boolean {
  if (select === undefined || select.length === 0) {
    return false;
  }
  return select.some((item) => {
    const dot = item.indexOf(".");
    if (dot <= 0) {
      return false;
    }
    const objectId = item.slice(0, dot);
    return objectId !== rootObjectId;
  });
}
export function compileExistsSemiJoin(
  ontology: Ontology,
  plan: JoinPlan,
  rootAlias: string,
  query: {
    objectId: string;
    filters: {
      objectId?: string | undefined;
      propertyId: string;
      op: string;
      value: unknown;
    }[];
    textSearch?:
      | {
          query: string;
          objectId?: string | undefined;
          propertyIds?: string[] | undefined;
        }
      | undefined;
  },
  parameters: SqlParameter[],
): string {
  const quoteColumn = (objectId: string, propertyId: string): string => {
    const alias = plan.objectAliases.get(objectId);
    if (alias === undefined) {
      throw new ObjectQueryCompileError(
        "unknown_join_object",
        `Missing alias for object "${objectId}".`,
      );
    }
    return `${quoteIdentifier(alias)}.${quoteIdentifier(propertyId)}`;
  };
  const firstStep = plan.steps[0];
  if (firstStep === undefined) {
    throw new ObjectQueryCompileError("invalid_join", "Join plan has no steps.");
  }
  const firstJoinAlias = plan.objectAliases.get(firstStep.toObjectId);
  if (firstJoinAlias === undefined) {
    throw new ObjectQueryCompileError("invalid_join", "First join alias missing.");
  }
  const { fromKey, toKey } = (() => {
    const relationship = firstStep.relationship;
    if (relationship.fromPropertyId === undefined || relationship.toPropertyId === undefined) {
      throw new ObjectQueryCompileError("invalid_join", "Relationship keys missing.");
    }
    if (relationship.fromObjectId === firstStep.fromObjectId) {
      return { fromKey: relationship.fromPropertyId, toKey: relationship.toPropertyId };
    }
    return { fromKey: relationship.toPropertyId, toKey: relationship.fromPropertyId };
  })();
  const linkPredicate = `${quoteIdentifier(rootAlias)}.${quoteIdentifier(fromKey)} = ${quoteIdentifier(firstJoinAlias)}.${quoteIdentifier(toKey)}`;
  const innerConditions: string[] = [linkPredicate];
  for (const filter of query.filters) {
    const targetObjectId = filter.objectId ?? query.objectId;
    if (targetObjectId === query.objectId) {
      continue;
    }
    const { object, alias } = resolveObjectInPlan(ontology, plan, targetObjectId);
    innerConditions.push(
      compileObjectFilter(
        object,
        alias,
        filter as Parameters<typeof compileObjectFilter>[2],
        parameters,
      ),
    );
  }
  if (query.textSearch !== undefined) {
    const searchObjectId = query.textSearch.objectId ?? query.objectId;
    if (searchObjectId !== query.objectId) {
      const { object, alias } = resolveObjectInPlan(ontology, plan, searchObjectId);
      innerConditions.push(
        compileTextSearch(
          object,
          alias,
          query.textSearch.query,
          query.textSearch.propertyIds,
          parameters,
        ),
      );
    }
  }
  const firstJoinedObject = resolveObject(ontology, firstStep.toObjectId);
  const firstJoinedDataset = quoteDatasetId(resolveDatasetId(firstJoinedObject));
  const remainingJoins = plan.steps.slice(1).map((step) => {
    const toObject = resolveObject(ontology, step.toObjectId);
    const toDataset = quoteDatasetId(resolveDatasetId(toObject));
    const toAlias = plan.objectAliases.get(step.toObjectId);
    if (toAlias === undefined) {
      throw new ObjectQueryCompileError("invalid_join", "Join target alias missing.");
    }
    const on = compileJoinOnClause(step, quoteColumn);
    return `INNER JOIN ${toDataset} AS ${quoteIdentifier(toAlias)} ON ${on}`;
  });
  const fromSql = `${firstJoinedDataset} AS ${quoteIdentifier(firstJoinAlias)}`;
  return `EXISTS (SELECT 1 FROM ${fromSql}\n${remainingJoins.join("\n")}\nWHERE ${innerConditions.join(" AND ")})`;
}
