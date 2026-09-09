import type { Entity, Rule, SemanticModel } from "@backed/core";
import { CONFIRMED_STATUS, RULE_MATCH_SCORE } from "./constants.js";
import { definitionNotFoundMessage, emptyDefinitionTermMessage } from "./errors.js";
import type { DefinitionResult, EntityDetail, EntitySummary, RelationSummary, SearchMatch, } from "./schemas.js";
import { DefinitionResultSchema, EntityDetailSchema, EntitySummarySchema, RelationSummarySchema, SearchMatchSchema, validateModelPayload, } from "./schemas.js";
export type { EntitySummary, EntityDetail, RelationSummary, SearchMatch, DefinitionResult };
function optionalDescription(description: string | undefined): {
    description: string;
} | Record<string, never> {
    return description !== undefined ? { description } : {};
}
function entitySummaryFields(entity: Entity): EntitySummary {
    return {
        id: entity.id,
        name: entity.name,
        ...optionalDescription(entity.description),
        status: entity.status,
    };
}
export function listEntities(model: SemanticModel): EntitySummary[] {
    return model.entities
        .map((entity) => validateModelPayload(EntitySummarySchema, entitySummaryFields(entity)));
}
export function getEntity(model: SemanticModel, id: string): EntityDetail | null {
    const entity = model.entities.find((candidate) => candidate.id === id);
    if (entity === undefined) {
        return null;
    }
    const detail: EntityDetail = {
        ...entitySummaryFields(entity),
        provenance: entity.provenance,
        properties: entity.properties.map((property) => ({
            name: property.name,
            columnName: property.columnName,
            semanticType: property.semanticType,
            role: property.role,
            provenance: property.provenance,
        })),
    };
    return validateModelPayload(EntityDetailSchema, detail);
}
export function listRelations(model: SemanticModel, entityId?: string): RelationSummary[] {
    const relations = entityId === undefined
        ? model.relations
        : model.relations.filter((relation) => relation.fromEntity === entityId || relation.toEntity === entityId);
    const summaries = relations.map((relation) => ({
        id: relation.id,
        name: relation.name,
        fromEntity: relation.fromEntity,
        toEntity: relation.toEntity,
        fromColumn: relation.fromColumn,
        toColumn: relation.toColumn,
        cardinality: relation.cardinality,
        status: relation.status,
    }));
    return summaries.map((summary) => validateModelPayload(RelationSummarySchema, summary));
}
function matches(query: string, ...fields: (string | undefined)[]): boolean {
    return fields.some((field) => field?.toLowerCase().includes(query));
}
export interface SearchModelOptions {
    semanticSearch?: (query: string) => Promise<SearchMatch[]>;
}
function mergeSearchMatches(semanticMatches: SearchMatch[], substringMatches: SearchMatch[]): SearchMatch[] {
    const seen = new Set<string>();
    const merged: SearchMatch[] = [];
    for (const match of [...semanticMatches, ...substringMatches]) {
        const key = `${match.kind}:${match.id}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        merged.push(match);
    }
    return merged;
}
function searchModelBySubstring(model: SemanticModel, rawQuery: string): SearchMatch[] {
    const query = rawQuery.trim().toLowerCase();
    if (query.length === 0) {
        return [];
    }
    const results: SearchMatch[] = [];
    for (const entity of model.entities) {
        if (matches(query, entity.id, entity.name, entity.description)) {
            results.push({
                kind: "entity",
                id: entity.id,
                name: entity.name,
                snippet: entity.description ?? `Entity "${entity.name}"`,
            });
        }
        for (const property of entity.properties) {
            if (matches(query, property.name, property.columnName)) {
                results.push({
                    kind: "property",
                    id: `${entity.id}.${property.columnName}`,
                    name: property.name,
                    snippet: `Attribute of "${entity.name}" (${property.semanticType}, ${property.role})`,
                });
            }
        }
    }
    for (const relation of model.relations) {
        if (matches(query, relation.id, relation.name, relation.fromEntity, relation.toEntity)) {
            results.push({
                kind: "relation",
                id: relation.id,
                name: relation.name,
                snippet: `${relation.fromEntity}.${relation.fromColumn} → ${relation.toEntity}.${relation.toColumn} (${relation.cardinality})`,
            });
        }
    }
    for (const rule of model.rules) {
        if (matches(query, rule.id, rule.name, rule.definition)) {
            results.push({
                kind: "rule",
                id: rule.id,
                name: rule.name,
                snippet: rule.definition,
            });
        }
    }
    return results.map((match) => validateModelPayload(SearchMatchSchema, match));
}
export async function searchModel(model: SemanticModel, rawQuery: string, options: SearchModelOptions = {}): Promise<SearchMatch[]> {
    const substringMatches = searchModelBySubstring(model, rawQuery);
    if (options.semanticSearch === undefined) {
        return substringMatches;
    }
    const trimmedQuery = rawQuery.trim();
    if (trimmedQuery.length === 0) {
        return substringMatches;
    }
    try {
        const semanticMatches = await options.semanticSearch(trimmedQuery);
        return mergeSearchMatches(semanticMatches, substringMatches);
    }
    catch {
        return substringMatches;
    }
}
function ruleMatchScore(rule: Rule, normalizedTerm: string): number {
    if (rule.id.toLowerCase() === normalizedTerm) {
        return RULE_MATCH_SCORE.exactId;
    }
    if (rule.name.toLowerCase() === normalizedTerm) {
        return RULE_MATCH_SCORE.exactName;
    }
    if (rule.name.toLowerCase().includes(normalizedTerm)) {
        return RULE_MATCH_SCORE.partialName;
    }
    if (rule.definition.toLowerCase().includes(normalizedTerm)) {
        return RULE_MATCH_SCORE.partialDefinition;
    }
    return 0;
}
export function getDefinition(model: SemanticModel, rawTerm: string): DefinitionResult {
    const term = rawTerm.trim();
    const normalizedTerm = term.toLowerCase();
    if (normalizedTerm.length === 0) {
        const result: DefinitionResult = {
            found: false,
            term,
            message: emptyDefinitionTermMessage(),
        };
        return validateModelPayload(DefinitionResultSchema, result);
    }
    const confirmedRules = model.rules.filter((rule) => rule.status === CONFIRMED_STATUS);
    let bestRule: Rule | undefined;
    let bestScore = 0;
    for (const rule of confirmedRules) {
        const score = ruleMatchScore(rule, normalizedTerm);
        if (score > bestScore) {
            bestScore = score;
            bestRule = rule;
        }
    }
    if (bestRule === undefined || bestScore === 0) {
        const result: DefinitionResult = {
            found: false,
            term,
            message: definitionNotFoundMessage(term),
        };
        return validateModelPayload(DefinitionResultSchema, result);
    }
    const result: DefinitionResult = {
        found: true,
        id: bestRule.id,
        name: bestRule.name,
        definition: bestRule.definition,
        appliesTo: bestRule.appliesTo,
        ...(bestRule.column !== undefined ? { column: bestRule.column } : {}),
        status: CONFIRMED_STATUS,
        provenance: bestRule.provenance,
    };
    return validateModelPayload(DefinitionResultSchema, result);
}
