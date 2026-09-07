import { TOOL_NAMES } from "./constants.js";
export function entityNotFoundMessage(entityId: string): string {
    return `Entity "${entityId}" not found. Use ${TOOL_NAMES.listEntities} for available ids.`;
}
export function emptyDefinitionTermMessage(): string {
    return "Definition term must not be empty.";
}
export function definitionNotFoundMessage(term: string): string {
    return `Definition not found for "${term}".`;
}
