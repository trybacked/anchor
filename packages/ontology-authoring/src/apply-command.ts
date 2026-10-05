import type { AuthoringCommand } from "@trybacked/core";
import type {
  Entity,
  OntologySemanticsBlock,
  Property,
  Relation,
  Rule,
  SemanticModel,
} from "@trybacked/core";
import { MODEL_FORMAT_VERSION } from "@trybacked/core";
import { commandsForPack } from "./packs/index.js";
export class AuthoringCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthoringCommandError";
  }
}
function findEntity(model: SemanticModel, entityId: string): Entity {
  const entity = model.entities.find((entry) => entry.id === entityId);
  if (entity === undefined) {
    throw new AuthoringCommandError(`Entity "${entityId}" not found`);
  }
  return entity;
}
function findRelation(model: SemanticModel, relationId: string): Relation {
  const relation = model.relations.find((entry) => entry.id === relationId);
  if (relation === undefined) {
    throw new AuthoringCommandError(`Relation "${relationId}" not found`);
  }
  return relation;
}
function findRule(model: SemanticModel, ruleId: string): Rule {
  const rule = model.rules.find((entry) => entry.id === ruleId);
  if (rule === undefined) {
    throw new AuthoringCommandError(`Rule "${ruleId}" not found`);
  }
  return rule;
}
export function emptySemanticModel(runId: string): SemanticModel {
  const now = new Date().toISOString();
  return {
    metadata: {
      formatVersion: MODEL_FORMAT_VERSION,
      runId,
      generatedAt: now,
    },
    entities: [],
    relations: [],
    rules: [],
  };
}
function semanticsBlock(model: SemanticModel): OntologySemanticsBlock {
  return model.semantics ?? { glossary: [], examples: [] };
}
export function applyCommand(model: SemanticModel, command: AuthoringCommand): SemanticModel {
  switch (command.type) {
    case "addEntity": {
      if (model.entities.some((entity) => entity.id === command.entity.id)) {
        throw new AuthoringCommandError(`Entity "${command.entity.id}" already exists`);
      }
      return { ...model, entities: [...model.entities, command.entity] };
    }
    case "updateEntity": {
      const entity = findEntity(model, command.entityId);
      const updated: Entity = {
        ...entity,
        ...(command.patch.name !== undefined ? { name: command.patch.name } : {}),
        ...(command.patch.description !== undefined
          ? { description: command.patch.description }
          : {}),
        ...(command.patch.sourceTable !== undefined
          ? { sourceTable: command.patch.sourceTable }
          : {}),
        ...(command.patch.status !== undefined ? { status: command.patch.status } : {}),
        ...(command.patch.confidence !== undefined ? { confidence: command.patch.confidence } : {}),
      };
      return {
        ...model,
        entities: model.entities.map((entry) => (entry.id === command.entityId ? updated : entry)),
      };
    }
    case "removeEntity": {
      findEntity(model, command.entityId);
      return {
        ...model,
        entities: model.entities.filter((entity) => entity.id !== command.entityId),
        relations: model.relations.filter(
          (relation) =>
            relation.fromEntity !== command.entityId && relation.toEntity !== command.entityId,
        ),
      };
    }
    case "addProperty": {
      const entity = findEntity(model, command.entityId);
      if (
        entity.properties.some((property) => property.columnName === command.property.columnName)
      ) {
        throw new AuthoringCommandError(
          `Property column "${command.property.columnName}" already exists on "${command.entityId}"`,
        );
      }
      const updated: Entity = {
        ...entity,
        properties: [...entity.properties, command.property],
      };
      return {
        ...model,
        entities: model.entities.map((entry) => (entry.id === command.entityId ? updated : entry)),
      };
    }
    case "updateProperty": {
      const entity = findEntity(model, command.entityId);
      const property = entity.properties.find((entry) => entry.columnName === command.columnName);
      if (property === undefined) {
        throw new AuthoringCommandError(
          `Property "${command.columnName}" not found on "${command.entityId}"`,
        );
      }
      const nextColumnName = command.patch.columnName ?? command.columnName;
      if (
        nextColumnName !== command.columnName &&
        entity.properties.some((entry) => entry.columnName === nextColumnName)
      ) {
        throw new AuthoringCommandError(`Property column "${nextColumnName}" already exists`);
      }
      const updatedProperty: Property = {
        ...property,
        ...(command.patch.name !== undefined ? { name: command.patch.name } : {}),
        ...(command.patch.columnName !== undefined ? { columnName: command.patch.columnName } : {}),
        ...(command.patch.semanticType !== undefined
          ? { semanticType: command.patch.semanticType }
          : {}),
        ...(command.patch.role !== undefined ? { role: command.patch.role } : {}),
        ...(command.patch.nullable !== undefined ? { nullable: command.patch.nullable } : {}),
        ...(command.patch.confidence !== undefined ? { confidence: command.patch.confidence } : {}),
      };
      const updated: Entity = {
        ...entity,
        properties: entity.properties.map((entry) =>
          entry.columnName === command.columnName ? updatedProperty : entry,
        ),
      };
      return {
        ...model,
        entities: model.entities.map((entry) => (entry.id === command.entityId ? updated : entry)),
      };
    }
    case "removeProperty": {
      const entity = findEntity(model, command.entityId);
      if (!entity.properties.some((property) => property.columnName === command.columnName)) {
        throw new AuthoringCommandError(
          `Property "${command.columnName}" not found on "${command.entityId}"`,
        );
      }
      const updated: Entity = {
        ...entity,
        properties: entity.properties.filter(
          (property) => property.columnName !== command.columnName,
        ),
      };
      return {
        ...model,
        entities: model.entities.map((entry) => (entry.id === command.entityId ? updated : entry)),
      };
    }
    case "addRelation": {
      if (model.relations.some((relation) => relation.id === command.relation.id)) {
        throw new AuthoringCommandError(`Relation "${command.relation.id}" already exists`);
      }
      findEntity(model, command.relation.fromEntity);
      findEntity(model, command.relation.toEntity);
      return { ...model, relations: [...model.relations, command.relation] };
    }
    case "updateRelation": {
      const relation = findRelation(model, command.relationId);
      const updated: Relation = {
        ...relation,
        ...(command.patch.name !== undefined ? { name: command.patch.name } : {}),
        ...(command.patch.fromColumn !== undefined ? { fromColumn: command.patch.fromColumn } : {}),
        ...(command.patch.toColumn !== undefined ? { toColumn: command.patch.toColumn } : {}),
        ...(command.patch.cardinality !== undefined
          ? { cardinality: command.patch.cardinality }
          : {}),
        ...(command.patch.status !== undefined ? { status: command.patch.status } : {}),
      };
      return {
        ...model,
        relations: model.relations.map((entry) =>
          entry.id === command.relationId ? updated : entry,
        ),
      };
    }
    case "removeRelation": {
      findRelation(model, command.relationId);
      return {
        ...model,
        relations: model.relations.filter((relation) => relation.id !== command.relationId),
      };
    }
    case "addRule": {
      if (model.rules.some((rule) => rule.id === command.rule.id)) {
        throw new AuthoringCommandError(`Rule "${command.rule.id}" already exists`);
      }
      return { ...model, rules: [...model.rules, command.rule] };
    }
    case "updateRule": {
      const rule = findRule(model, command.ruleId);
      const updated: Rule = {
        ...rule,
        ...(command.patch.name !== undefined ? { name: command.patch.name } : {}),
        ...(command.patch.definition !== undefined ? { definition: command.patch.definition } : {}),
        ...(command.patch.appliesTo !== undefined ? { appliesTo: command.patch.appliesTo } : {}),
        ...(command.patch.column !== undefined ? { column: command.patch.column } : {}),
        ...(command.patch.status !== undefined ? { status: command.patch.status } : {}),
      };
      return {
        ...model,
        rules: model.rules.map((entry) => (entry.id === command.ruleId ? updated : entry)),
      };
    }
    case "removeRule": {
      findRule(model, command.ruleId);
      return {
        ...model,
        rules: model.rules.filter((rule) => rule.id !== command.ruleId),
      };
    }
    case "applyPack": {
      const catalog = command.catalog ?? "backed";
      const packCommands = commandsForPack(command.packId, catalog);
      return applyCommands(model, packCommands);
    }
    case "setPropertySemantics": {
      const entity = findEntity(model, command.entityId);
      const property = entity.properties.find((entry) => entry.columnName === command.columnName);
      if (property === undefined) {
        throw new AuthoringCommandError(
          `Property "${command.columnName}" not found on "${command.entityId}"`,
        );
      }
      const updatedProperty: Property = {
        ...property,
        semantics: { ...property.semantics, ...command.semantics },
      };
      const updated: Entity = {
        ...entity,
        properties: entity.properties.map((entry) =>
          entry.columnName === command.columnName ? updatedProperty : entry,
        ),
      };
      return {
        ...model,
        entities: model.entities.map((entry) => (entry.id === command.entityId ? updated : entry)),
      };
    }
    case "setEntitySemantics": {
      const entity = findEntity(model, command.entityId);
      const updated: Entity = {
        ...entity,
        semantics: { ...entity.semantics, ...command.semantics },
      };
      return {
        ...model,
        entities: model.entities.map((entry) => (entry.id === command.entityId ? updated : entry)),
      };
    }
    case "upsertGlossaryTerm": {
      const block = semanticsBlock(model);
      const without = block.glossary.filter((entry) => entry.id !== command.term.id);
      return {
        ...model,
        semantics: { ...block, glossary: [...without, command.term] },
      };
    }
    case "removeGlossaryTerm": {
      const block = semanticsBlock(model);
      return {
        ...model,
        semantics: {
          ...block,
          glossary: block.glossary.filter((entry) => entry.id !== command.termId),
        },
      };
    }
    case "upsertExample": {
      const block = semanticsBlock(model);
      const without = block.examples.filter((entry) => entry.id !== command.example.id);
      return {
        ...model,
        semantics: { ...block, examples: [...without, command.example] },
      };
    }
    case "removeExample": {
      const block = semanticsBlock(model);
      return {
        ...model,
        semantics: {
          ...block,
          examples: block.examples.filter((entry) => entry.id !== command.exampleId),
        },
      };
    }
    default: {
      const exhaustive: never = command;
      throw new AuthoringCommandError(`Unknown command type: ${String(exhaustive)}`);
    }
  }
}
export function applyCommands(model: SemanticModel, commands: AuthoringCommand[]): SemanticModel {
  let current = model;
  for (const command of commands) {
    current = applyCommand(current, command);
  }
  return current;
}
