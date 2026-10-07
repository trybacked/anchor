import { z } from "zod";
import {
  DatasourceBindingSchema,
  OntologyActionTypeV2Schema,
  OntologyInterfaceV2Schema,
  OntologyLinkTypeV2Schema,
  OntologyObjectTypeV2Schema,
  OntologyPropertyV2Schema,
  OntologyV2Schema,
  OntologyValueTypeSchema,
  type OntologyV2,
} from "./spec-v2.js";
import {
  EntitySemanticsSchema,
  GlossaryTermSchema,
  PropertySemanticsSchema,
  VerifiedExampleSchema,
} from "../semantics.js";
import type { ValidationResult } from "./validation-result.js";
import { validationResult } from "./validation-result.js";

/**
 * Authoring commands for OntologySpec v2 (Plan Phase 1).
 *
 * Every mutation is a typed command so it can be diffed, audited, and produced
 * by the AI proposal engine. Exhaustive switches guarantee compile-time
 * failures when new command kinds are added.
 */
export const AuthoringCommandV2Schema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("addObjectType"), objectType: OntologyObjectTypeV2Schema }),
  z.object({
    type: z.literal("updateObjectType"),
    objectTypeId: z.string().min(1),
    patch: z
      .object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        titlePropertyId: z.string().min(1).optional(),
        status: z.enum(["proposed", "confirmed", "renamed"]).optional(),
        confidence: z.number().min(0).max(1).optional(),
      })
      .strict(),
  }),
  z.object({ type: z.literal("removeObjectType"), objectTypeId: z.string().min(1) }),
  z.object({
    type: z.literal("addProperty"),
    objectTypeId: z.string().min(1),
    property: OntologyPropertyV2Schema,
  }),
  z.object({
    type: z.literal("removeProperty"),
    objectTypeId: z.string().min(1),
    propertyId: z.string().min(1),
  }),
  z.object({
    type: z.literal("bindDatasource"),
    objectTypeId: z.string().min(1),
    binding: DatasourceBindingSchema,
  }),
  z.object({
    type: z.literal("unbindDatasource"),
    objectTypeId: z.string().min(1),
    sourceId: z.string().min(1),
  }),
  z.object({ type: z.literal("addInterface"), interface: OntologyInterfaceV2Schema }),
  z.object({
    type: z.literal("updateInterface"),
    interfaceId: z.string().min(1),
    patch: z
      .object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
      })
      .strict(),
  }),
  z.object({ type: z.literal("removeInterface"), interfaceId: z.string().min(1) }),
  z.object({ type: z.literal("addValueType"), valueType: OntologyValueTypeSchema }),
  z.object({ type: z.literal("removeValueType"), valueTypeId: z.string().min(1) }),
  z.object({ type: z.literal("addLinkType"), linkType: OntologyLinkTypeV2Schema }),
  z.object({
    type: z.literal("updateLinkType"),
    linkTypeId: z.string().min(1),
    patch: z
      .object({
        name: z.string().min(1).optional(),
        cardinality: z
          .enum(["one_to_one", "one_to_many", "many_to_one", "many_to_many"])
          .optional(),
        status: z.enum(["proposed", "confirmed", "renamed"]).optional(),
      })
      .strict(),
  }),
  z.object({ type: z.literal("removeLinkType"), linkTypeId: z.string().min(1) }),
  z.object({ type: z.literal("addActionType"), actionType: OntologyActionTypeV2Schema }),
  z.object({ type: z.literal("removeActionType"), actionTypeId: z.string().min(1) }),
  z.object({
    type: z.literal("setObjectTypeSemantics"),
    objectTypeId: z.string().min(1),
    semantics: EntitySemanticsSchema,
  }),
  z.object({
    type: z.literal("setPropertySemantics"),
    objectTypeId: z.string().min(1),
    propertyId: z.string().min(1),
    semantics: PropertySemanticsSchema,
  }),
  z.object({ type: z.literal("upsertGlossaryTerm"), term: GlossaryTermSchema }),
  z.object({ type: z.literal("removeGlossaryTerm"), termId: z.string().min(1) }),
  z.object({ type: z.literal("upsertExample"), example: VerifiedExampleSchema }),
  z.object({ type: z.literal("removeExample"), exampleId: z.string().min(1) }),
]);
export type AuthoringCommandV2 = z.infer<typeof AuthoringCommandV2Schema>;

export class AuthoringCommandV2Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthoringCommandV2Error";
  }
}

function assertExhaustive(command: never): never {
  throw new AuthoringCommandV2Error(`Unhandled authoring command: ${JSON.stringify(command)}`);
}

function upsert<T>(list: T[], find: (item: T) => boolean, next: T): T[] {
  const index = list.findIndex(find);
  if (index >= 0) {
    const copy = [...list];
    copy[index] = next;
    return copy;
  }
  return [...list, next];
}

/** Apply a single v2 command. Throws AuthoringCommandV2Error on invalid targets. */
export function applyCommandV2(model: OntologyV2, command: AuthoringCommandV2): OntologyV2 {
  switch (command.type) {
    case "addObjectType": {
      if (model.objectTypes.some((o) => o.id === command.objectType.id)) {
        throw new AuthoringCommandV2Error(`Object type "${command.objectType.id}" already exists`);
      }
      return { ...model, objectTypes: [...model.objectTypes, command.objectType] };
    }
    case "updateObjectType": {
      const objectType = model.objectTypes.find((o) => o.id === command.objectTypeId);
      if (objectType === undefined) {
        throw new AuthoringCommandV2Error(`Object type "${command.objectTypeId}" not found`);
      }
      return {
        ...model,
        objectTypes: model.objectTypes.map((o) =>
          o.id === command.objectTypeId
            ? {
                ...o,
                ...(command.patch.name !== undefined ? { name: command.patch.name } : {}),
                ...(command.patch.description !== undefined
                  ? { description: command.patch.description }
                  : {}),
                ...(command.patch.titlePropertyId !== undefined
                  ? { titlePropertyId: command.patch.titlePropertyId }
                  : {}),
                ...(command.patch.status !== undefined ? { status: command.patch.status } : {}),
                ...(command.patch.confidence !== undefined
                  ? { confidence: command.patch.confidence }
                  : {}),
              }
            : o,
        ),
      };
    }
    case "removeObjectType": {
      if (!model.objectTypes.some((o) => o.id === command.objectTypeId)) {
        throw new AuthoringCommandV2Error(`Object type "${command.objectTypeId}" not found`);
      }
      return {
        ...model,
        objectTypes: model.objectTypes.filter((o) => o.id !== command.objectTypeId),
        linkTypes: model.linkTypes.filter(
          (l) => l.fromObjectTypeId !== command.objectTypeId && l.toObjectTypeId !== command.objectTypeId,
        ),
      };
    }
    case "addProperty": {
      const objectType = model.objectTypes.find((o) => o.id === command.objectTypeId);
      if (objectType === undefined) {
        throw new AuthoringCommandV2Error(`Object type "${command.objectTypeId}" not found`);
      }
      return {
        ...model,
        objectTypes: model.objectTypes.map((o) =>
          o.id === command.objectTypeId
            ? { ...o, properties: [...o.properties, command.property] }
            : o,
        ),
      };
    }
    case "removeProperty": {
      return {
        ...model,
        objectTypes: model.objectTypes.map((o) =>
          o.id === command.objectTypeId
            ? { ...o, properties: o.properties.filter((p) => p.id !== command.propertyId) }
            : o,
        ),
      };
    }
    case "bindDatasource": {
      const objectType = model.objectTypes.find((o) => o.id === command.objectTypeId);
      if (objectType === undefined) {
        throw new AuthoringCommandV2Error(`Object type "${command.objectTypeId}" not found`);
      }
      return {
        ...model,
        objectTypes: model.objectTypes.map((o) =>
          o.id === command.objectTypeId
            ? {
                ...o,
                backing: upsert(
                  o.backing,
                  (b) => b.sourceId === command.binding.sourceId,
                  command.binding,
                ),
              }
            : o,
        ),
      };
    }
    case "unbindDatasource": {
      return {
        ...model,
        objectTypes: model.objectTypes.map((o) =>
          o.id === command.objectTypeId
            ? { ...o, backing: o.backing.filter((b) => b.sourceId !== command.sourceId) }
            : o,
        ),
      };
    }
    case "addInterface": {
      return {
        ...model,
        interfaces: upsert(model.interfaces, (i) => i.id === command.interface.id, command.interface),
      };
    }
    case "updateInterface": {
      return {
        ...model,
        interfaces: model.interfaces.map((i) =>
          i.id === command.interfaceId
            ? {
                ...i,
                ...(command.patch.name !== undefined ? { name: command.patch.name } : {}),
                ...(command.patch.description !== undefined
                  ? { description: command.patch.description }
                  : {}),
              }
            : i,
        ),
      };
    }
    case "removeInterface": {
      return { ...model, interfaces: model.interfaces.filter((i) => i.id !== command.interfaceId) };
    }
    case "addValueType": {
      return {
        ...model,
        valueTypes: upsert(model.valueTypes, (v) => v.id === command.valueType.id, command.valueType),
      };
    }
    case "removeValueType": {
      return { ...model, valueTypes: model.valueTypes.filter((v) => v.id !== command.valueTypeId) };
    }
    case "addLinkType": {
      return {
        ...model,
        linkTypes: upsert(model.linkTypes, (l) => l.id === command.linkType.id, command.linkType),
      };
    }
    case "updateLinkType": {
      return {
        ...model,
        linkTypes: model.linkTypes.map((l) =>
          l.id === command.linkTypeId
            ? {
                ...l,
                ...(command.patch.name !== undefined ? { name: command.patch.name } : {}),
                ...(command.patch.cardinality !== undefined
                  ? { cardinality: command.patch.cardinality }
                  : {}),
                ...(command.patch.status !== undefined ? { status: command.patch.status } : {}),
              }
            : l,
        ),
      };
    }
    case "removeLinkType": {
      return { ...model, linkTypes: model.linkTypes.filter((l) => l.id !== command.linkTypeId) };
    }
    case "addActionType": {
      return {
        ...model,
        actionTypes: upsert(
          model.actionTypes,
          (a) => a.id === command.actionType.id,
          command.actionType,
        ),
      };
    }
    case "removeActionType": {
      return {
        ...model,
        actionTypes: model.actionTypes.filter((a) => a.id !== command.actionTypeId),
      };
    }
    case "setObjectTypeSemantics": {
      return {
        ...model,
        objectTypes: model.objectTypes.map((o) =>
          o.id === command.objectTypeId ? { ...o, semantics: command.semantics } : o,
        ),
      };
    }
    case "setPropertySemantics": {
      return {
        ...model,
        objectTypes: model.objectTypes.map((o) =>
          o.id === command.objectTypeId
            ? {
                ...o,
                properties: o.properties.map((p) =>
                  p.id === command.propertyId
                    ? ({ ...p, semantics: command.semantics } as typeof p)
                    : p,
                ),
              }
            : o,
        ),
      };
    }
    case "upsertGlossaryTerm": {
      const glossary = upsert(
        model.semantics?.glossary ?? [],
        (t) => t.id === command.term.id,
        command.term,
      );
      return {
        ...model,
        semantics: { glossary, examples: model.semantics?.examples ?? [] },
      };
    }
    case "removeGlossaryTerm": {
      const glossary = (model.semantics?.glossary ?? []).filter((t) => t.id !== command.termId);
      return {
        ...model,
        semantics: { glossary, examples: model.semantics?.examples ?? [] },
      };
    }
    case "upsertExample": {
      const examples = upsert(
        model.semantics?.examples ?? [],
        (e) => e.id === command.example.id,
        command.example,
      );
      return {
        ...model,
        semantics: { glossary: model.semantics?.glossary ?? [], examples },
      };
    }
    case "removeExample": {
      const examples = (model.semantics?.examples ?? []).filter((e) => e.id !== command.exampleId);
      return {
        ...model,
        semantics: { glossary: model.semantics?.glossary ?? [], examples },
      };
    }
    default:
      return assertExhaustive(command);
  }
}

/** Apply a command list sequentially (reduced with validation errors deferred to validateOntologyV2). */
export function applyCommandsV2(model: OntologyV2, commands: AuthoringCommandV2[]): OntologyV2 {
  return commands.reduce((current, command) => applyCommandV2(current, command), model);
}

/** Structural validation: references, interfaces, link keys, value types. */
export function validateOntologyV2(model: OntologyV2): ValidationResult {
  const issues: ValidationResult["issues"] = [];
  const objectTypeIds = new Set(model.objectTypes.map((o) => o.id));
  const interfaceIds = new Set(model.interfaces.map((i) => i.id));
  const valueTypeIds = new Set(model.valueTypes.map((v) => v.id));

  const checkTypeExpr = (path: string, expr: unknown): void => {
    if (typeof expr === "string") {
      return;
    }
    const node = expr as { kind?: string; valueTypeId?: string; fields?: unknown[] };
    if (node.kind === "valueType") {
      if (!valueTypeIds.has(node.valueTypeId ?? "")) {
        issues.push({
          code: "unknown_value_type",
          severity: "error",
          message: `Value type "${node.valueTypeId}" is not defined in the ontology`,
          path,
        });
      }
      return;
    }
    if (node.kind === "struct" && Array.isArray(node.fields)) {
      for (const field of node.fields as { name: string; type: unknown }[]) {
        checkTypeExpr(`${path}.${field.name}`, field.type);
      }
    }
  };

  for (const objectType of model.objectTypes) {
    if (objectType.backing.length === 0) {
      issues.push({
        code: "object_without_backing",
        severity: "error",
        message: `Object type "${objectType.id}" has no datasource binding`,
        path: `objectTypes.${objectType.id}`,
      });
    }
    for (const interfaceId of objectType.implements ?? []) {
      if (!interfaceIds.has(interfaceId)) {
        issues.push({
          code: "unknown_interface",
          severity: "error",
          message: `Object type "${objectType.id}" implements unknown interface "${interfaceId}"`,
          path: `objectTypes.${objectType.id}.implements`,
        });
      }
    }
    for (const property of objectType.properties) {
      checkTypeExpr(`objectTypes.${objectType.id}.properties.${property.id}`, property);
      if (property.kind === "physical" && !objectType.backing.some((b) => b.sourceId === property.bindingSourceId)) {
        issues.push({
          code: "property_without_binding",
          severity: "error",
          message: `Property "${property.id}" binds source "${property.bindingSourceId}" which is not in the backing of "${objectType.id}"`,
          path: `objectTypes.${objectType.id}.properties.${property.id}`,
        });
      }
      if (property.kind === "shared") {
        const iface = model.interfaces.find((i) => i.id === property.interfaceId);
        if (iface === undefined) {
          issues.push({
            code: "unknown_interface",
            severity: "error",
            message: `Property "${property.id}" references unknown interface "${property.interfaceId}"`,
            path: `objectTypes.${objectType.id}.properties.${property.id}`,
          });
        } else if (!iface.sharedProperties.some((s) => s.id === property.sharedPropertyId)) {
          issues.push({
            code: "unknown_shared_property",
            severity: "error",
            message: `Property "${property.id}" references unknown shared property "${property.sharedPropertyId}"`,
            path: `objectTypes.${objectType.id}.properties.${property.id}`,
          });
        }
      }
    }
  }
  for (const linkType of model.linkTypes) {
    if (!objectTypeIds.has(linkType.fromObjectTypeId) || !objectTypeIds.has(linkType.toObjectTypeId)) {
      issues.push({
        code: "unknown_link_endpoint",
        severity: "error",
        message: `Link type "${linkType.id}" references an unknown object type`,
        path: `linkTypes.${linkType.id}`,
      });
    }
  }
  for (const actionType of model.actionTypes) {
    if (actionType.objectTypeId !== undefined && !objectTypeIds.has(actionType.objectTypeId)) {
      issues.push({
        code: "unknown_action_object",
        severity: "error",
        message: `Action type "${actionType.id}" targets unknown object type "${actionType.objectTypeId}"`,
        path: `actionTypes.${actionType.id}`,
      });
    }
  }
  return validationResult(issues);
}

export const OntologyV2DraftSchema = OntologyV2Schema;