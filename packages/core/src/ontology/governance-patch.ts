import { z } from "zod";
import { AuditActionSchema } from "./audit.js";
import type { AuditAction, AuditEvent } from "./audit.js";
import type { Ontology, OntologyObject, OntologyProperty } from "./spec.js";

export const GovernanceElementKindSchema = z.enum([
  "object",
  "property",
  "relationship",
  "logic",
  "action",
]);

export const OntologyGovernancePatchSchema = z.object({
  action: AuditActionSchema,
  elementKind: GovernanceElementKindSchema,
  /** Target element id (object id, relationship id, or object id for property paths). */
  targetId: z.string().min(1),
  /** Property id when `elementKind` is `property`. */
  propertyId: z.string().min(1).optional(),
  /** Secondary target for merge/split (e.g. merge source id). */
  secondaryId: z.string().min(1).optional(),
  /** Human-readable label after modify/rename. */
  name: z.string().min(1).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export type GovernanceElementKind = z.infer<typeof GovernanceElementKindSchema>;
export type OntologyGovernancePatch = z.infer<typeof OntologyGovernancePatchSchema>;

export type GovernancePatchAction = Extract<
  AuditAction,
  "modify" | "merge" | "split" | "add" | "remove" | "override"
>;

const GOVERNANCE_ACTIONS = new Set<GovernancePatchAction>([
  "modify",
  "merge",
  "split",
  "add",
  "remove",
  "override",
]);

export function isGovernancePatchAction(action: AuditAction): action is GovernancePatchAction {
  return GOVERNANCE_ACTIONS.has(action as GovernancePatchAction);
}

export class OntologyGovernanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OntologyGovernanceError";
  }
}

function findObject(objects: OntologyObject[], id: string): OntologyObject {
  const object = objects.find((entry) => entry.id === id);
  if (object === undefined) {
    throw new OntologyGovernanceError(`Object not found: ${id}`);
  }
  return object;
}

function applyModify(ontology: Ontology, patch: OntologyGovernancePatch): Ontology {
  if (patch.elementKind === "object") {
    return {
      ...ontology,
      objects: ontology.objects.map((object) =>
        object.id === patch.targetId
          ? {
              ...object,
              ...(patch.name !== undefined ? { name: patch.name } : {}),
              source: "manual" as const,
            }
          : object,
      ),
    };
  }
  if (patch.elementKind === "property") {
    if (patch.propertyId === undefined) {
      throw new OntologyGovernanceError("Property modify requires propertyId");
    }
    return {
      ...ontology,
      objects: ontology.objects.map((object) => {
        if (object.id !== patch.targetId) {
          return object;
        }
        return {
          ...object,
          properties: object.properties.map((property) =>
            property.id === patch.propertyId
              ? {
                  ...property,
                  ...(patch.name !== undefined ? { name: patch.name } : {}),
                  source: "manual" as const,
                }
              : property,
          ),
        };
      }),
    };
  }
  throw new OntologyGovernanceError(`Modify not supported for kind ${patch.elementKind}`);
}

function applyRemove(ontology: Ontology, patch: OntologyGovernancePatch): Ontology {
  switch (patch.elementKind) {
    case "object":
      return {
        ...ontology,
        objects: ontology.objects.filter((object) => object.id !== patch.targetId),
        relationships: ontology.relationships.filter(
          (relationship) =>
            relationship.fromObjectId !== patch.targetId &&
            relationship.toObjectId !== patch.targetId,
        ),
        logic: ontology.logic.filter((entry) => entry.objectId !== patch.targetId),
        actions: ontology.actions.filter((action) => action.objectId !== patch.targetId),
      };
    case "relationship":
      return {
        ...ontology,
        relationships: ontology.relationships.filter(
          (relationship) => relationship.id !== patch.targetId,
        ),
      };
    case "logic":
      return { ...ontology, logic: ontology.logic.filter((entry) => entry.id !== patch.targetId) };
    case "action":
      return {
        ...ontology,
        actions: ontology.actions.filter((action) => action.id !== patch.targetId),
      };
    case "property":
      if (patch.propertyId === undefined) {
        throw new OntologyGovernanceError("Property remove requires propertyId");
      }
      return {
        ...ontology,
        objects: ontology.objects.map((object) =>
          object.id === patch.targetId
            ? {
                ...object,
                properties: object.properties.filter(
                  (property) => property.id !== patch.propertyId,
                ),
              }
            : object,
        ),
      };
    default: {
      const _exhaustive: never = patch.elementKind;
      throw new OntologyGovernanceError(`Unhandled element kind: ${String(_exhaustive)}`);
    }
  }
}

function applyAdd(ontology: Ontology, patch: OntologyGovernancePatch): Ontology {
  if (patch.elementKind !== "object") {
    throw new OntologyGovernanceError("Add currently supports object elements only");
  }
  if (patch.name === undefined) {
    throw new OntologyGovernanceError("Add requires name");
  }
  if (ontology.objects.some((object) => object.id === patch.targetId)) {
    throw new OntologyGovernanceError(`Object already exists: ${patch.targetId}`);
  }
  const newObject: OntologyObject = {
    id: patch.targetId,
    name: patch.name,
    properties: [],
    status: "proposed",
    lifecycle: "proposed",
    source: "manual",
  };
  return { ...ontology, objects: [...ontology.objects, newObject] };
}

function applyMerge(ontology: Ontology, patch: OntologyGovernancePatch): Ontology {
  if (patch.elementKind !== "object" || patch.secondaryId === undefined) {
    throw new OntologyGovernanceError("Merge requires object kind and secondaryId");
  }
  const target = findObject(ontology.objects, patch.targetId);
  const source = findObject(ontology.objects, patch.secondaryId);
  const mergedProperties: OntologyProperty[] = [...target.properties];
  for (const property of source.properties) {
    if (!mergedProperties.some((entry) => entry.id === property.id)) {
      mergedProperties.push(property);
    }
  }
  const merged: OntologyObject = {
    ...target,
    name: patch.name ?? target.name,
    properties: mergedProperties,
    source: "manual",
  };
  const removedId = patch.secondaryId;
  return applyRemove(
    {
      ...ontology,
      objects: ontology.objects.map((object) => (object.id === target.id ? merged : object)),
    },
    { action: "remove", elementKind: "object", targetId: removedId },
  );
}

function applySplit(ontology: Ontology, patch: OntologyGovernancePatch): Ontology {
  if (
    patch.elementKind !== "object" ||
    patch.secondaryId === undefined ||
    patch.name === undefined
  ) {
    throw new OntologyGovernanceError("Split requires object kind, secondaryId, and name");
  }
  const source = findObject(ontology.objects, patch.targetId);
  if (ontology.objects.some((object) => object.id === patch.secondaryId)) {
    throw new OntologyGovernanceError(`Split target id already exists: ${patch.secondaryId}`);
  }
  const propertyIds = Array.isArray(patch.payload?.["propertyIds"])
    ? (patch.payload["propertyIds"] as string[])
    : [];
  if (propertyIds.length === 0) {
    throw new OntologyGovernanceError("Split requires payload.propertyIds");
  }
  const splitProperties = source.properties.filter((property) => propertyIds.includes(property.id));
  const remainder = source.properties.filter((property) => !propertyIds.includes(property.id));
  const newObject: OntologyObject = {
    id: patch.secondaryId,
    name: patch.name,
    properties: splitProperties,
    status: "proposed",
    lifecycle: "proposed",
    source: "manual",
  };
  return {
    ...ontology,
    objects: [
      ...ontology.objects.map((object) =>
        object.id === patch.targetId
          ? { ...object, properties: remainder, source: "manual" as const }
          : object,
      ),
      newObject,
    ],
  };
}

function applyOverride(ontology: Ontology, patch: OntologyGovernancePatch): Ontology {
  return applyModify(ontology, { ...patch, action: "modify" });
}

export function applyOntologyGovernancePatch(
  ontology: Ontology,
  patch: OntologyGovernancePatch,
): Ontology {
  const validated = OntologyGovernancePatchSchema.parse(patch);
  const action = validated.action;
  if (!isGovernancePatchAction(action)) {
    throw new OntologyGovernanceError(`Not a governance action: ${action}`);
  }

  switch (action) {
    case "modify":
      return applyModify(ontology, validated);
    case "remove":
      return applyRemove(ontology, validated);
    case "add":
      return applyAdd(ontology, validated);
    case "merge":
      return applyMerge(ontology, validated);
    case "split":
      return applySplit(ontology, validated);
    case "override":
      return applyOverride(ontology, validated);
    default: {
      const _exhaustive: never = action;
      throw new OntologyGovernanceError(`Unhandled governance action: ${String(_exhaustive)}`);
    }
  }
}

export function buildGovernanceAuditEvent(input: {
  runId: string;
  recordedAt: string;
  patch: OntologyGovernancePatch;
  actorId?: string;
}): AuditEvent {
  const event: AuditEvent = {
    id: `${input.runId}:governance:${input.patch.action}:${input.patch.targetId}:${input.recordedAt}`,
    recordedAt: input.recordedAt,
    runId: input.runId,
    action: input.patch.action,
    source: "human",
    detail: {
      elementKind: input.patch.elementKind,
      targetId: input.patch.targetId,
      ...(input.patch.propertyId !== undefined ? { propertyId: input.patch.propertyId } : {}),
      ...(input.patch.secondaryId !== undefined ? { secondaryId: input.patch.secondaryId } : {}),
      ...(input.patch.payload !== undefined ? { payload: input.patch.payload } : {}),
    },
  };
  if (input.actorId !== undefined) {
    event.actor = { id: input.actorId };
  }
  return event;
}
