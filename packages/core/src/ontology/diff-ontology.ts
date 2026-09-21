import { z } from "zod";
import type { Ontology, OntologyObject, OntologyProperty, OntologyRelationship } from "./spec.js";

export const OntologyDiffChangeKindSchema = z.enum([
  "object_added",
  "object_removed",
  "property_added",
  "property_removed",
  "property_type_changed",
  "relationship_added",
  "relationship_removed",
  "logic_added",
  "logic_removed",
]);

export const OntologyDiffChangeSchema = z.object({
  kind: OntologyDiffChangeKindSchema,
  subject: z.string().min(1),
  detail: z.string().min(1),
  breaking: z.boolean(),
  before: z.string().optional(),
  after: z.string().optional(),
});

export const OntologyDiffSchema = z.object({
  fromVersion: z.number().int().positive(),
  toVersion: z.number().int().positive(),
  generatedAt: z.string().datetime(),
  changes: z.array(OntologyDiffChangeSchema),
});

export type OntologyDiffChangeKind = z.infer<typeof OntologyDiffChangeKindSchema>;
export type OntologyDiffChange = z.infer<typeof OntologyDiffChangeSchema>;
export type OntologyDiff = z.infer<typeof OntologyDiffSchema>;

function indexObjects(objects: OntologyObject[]): Map<string, OntologyObject> {
  return new Map(objects.map((object) => [object.id, object]));
}

function indexRelationships(relationships: OntologyRelationship[]): Map<string, OntologyRelationship> {
  return new Map(relationships.map((relationship) => [relationship.id, relationship]));
}

function propertyMap(object: OntologyObject): Map<string, OntologyProperty> {
  return new Map(object.properties.map((property) => [property.id, property]));
}

function diffProperties(
  objectId: string,
  previous: OntologyObject,
  next: OntologyObject,
  changes: OntologyDiffChange[],
): void {
  const prevProps = propertyMap(previous);
  const nextProps = propertyMap(next);
  for (const [propertyId] of nextProps) {
    if (!prevProps.has(propertyId)) {
      changes.push({
        kind: "property_added",
        subject: `${objectId}.${propertyId}`,
        detail: `Property "${propertyId}" added on object "${objectId}"`,
        breaking: false,
      });
    }
  }
  for (const [propertyId, property] of prevProps) {
    const nextProperty = nextProps.get(propertyId);
    if (nextProperty === undefined) {
      changes.push({
        kind: "property_removed",
        subject: `${objectId}.${propertyId}`,
        detail: `Property "${propertyId}" removed from object "${objectId}"`,
        breaking: true,
      });
      continue;
    }
    if (nextProperty.type !== property.type) {
      changes.push({
        kind: "property_type_changed",
        subject: `${objectId}.${propertyId}`,
        detail: `Property "${propertyId}" type changed on object "${objectId}"`,
        breaking: true,
        before: property.type,
        after: nextProperty.type,
      });
    }
  }
}

export function diffOntology(
  previous: Ontology,
  next: Ontology,
  options: { fromVersion: number; toVersion: number; now?: Date },
): OntologyDiff {
  const changes: OntologyDiffChange[] = [];
  const prevObjects = indexObjects(previous.objects);
  const nextObjects = indexObjects(next.objects);

  for (const [id, object] of nextObjects) {
    if (!prevObjects.has(id)) {
      changes.push({
        kind: "object_added",
        subject: id,
        detail: `Object "${object.name}" added`,
        breaking: false,
      });
    }
  }
  for (const [id, object] of prevObjects) {
    const nextObject = nextObjects.get(id);
    if (nextObject === undefined) {
      changes.push({
        kind: "object_removed",
        subject: id,
        detail: `Object "${object.name}" removed`,
        breaking: true,
      });
      continue;
    }
    diffProperties(id, object, nextObject, changes);
  }

  const prevRelations = indexRelationships(previous.relationships);
  const nextRelations = indexRelationships(next.relationships);
  for (const [id, relationship] of nextRelations) {
    if (!prevRelations.has(id)) {
      changes.push({
        kind: "relationship_added",
        subject: id,
        detail: `Relationship "${relationship.name}" added`,
        breaking: false,
      });
    }
  }
  for (const [id, relationship] of prevRelations) {
    if (!nextRelations.has(id)) {
      changes.push({
        kind: "relationship_removed",
        subject: id,
        detail: `Relationship "${relationship.name}" removed`,
        breaking: true,
      });
    }
  }

  const prevLogic = new Map(previous.logic.map((entry) => [entry.id, entry]));
  const nextLogic = new Map(next.logic.map((entry) => [entry.id, entry]));
  for (const [id, entry] of nextLogic) {
    if (!prevLogic.has(id)) {
      changes.push({
        kind: "logic_added",
        subject: id,
        detail: `Logic "${entry.name}" added`,
        breaking: false,
      });
    }
  }
  for (const [id, entry] of prevLogic) {
    if (!nextLogic.has(id)) {
      changes.push({
        kind: "logic_removed",
        subject: id,
        detail: `Logic "${entry.name}" removed`,
        breaking: true,
      });
    }
  }

  return OntologyDiffSchema.parse({
    fromVersion: options.fromVersion,
    toVersion: options.toVersion,
    generatedAt: (options.now ?? new Date()).toISOString(),
    changes,
  });
}

export function formatOntologyDiff(diff: OntologyDiff): string {
  const header = `Ontology diff v${String(diff.fromVersion)} → v${String(diff.toVersion)}`;
  if (diff.changes.length === 0) {
    return `${header}\nNo changes detected.`;
  }
  const breakingCount = diff.changes.filter((change) => change.breaking).length;
  const summary =
    breakingCount > 0
      ? `${String(diff.changes.length)} changes (${String(breakingCount)} breaking)`
      : `${String(diff.changes.length)} changes`;
  const lines = diff.changes.map((change) => {
    const marker = change.breaking ? "!" : change.kind.endsWith("_added") ? "+" : change.kind.endsWith("_removed") ? "-" : "~";
    return `  ${marker} ${change.detail}`;
  });
  return [header, summary, ...lines].join("\n");
}

export function hasBreakingOntologyChanges(diff: OntologyDiff): boolean {
  return diff.changes.some((change) => change.breaking);
}
