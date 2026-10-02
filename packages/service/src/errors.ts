export function entityNotFoundMessage(entityId: string): string {
  return `Entity "${entityId}" not found. Use list_entities for available ids.`;
}

export function emptyDefinitionTermMessage(): string {
  return "Definition term must not be empty.";
}

export function definitionNotFoundMessage(term: string): string {
  return `Definition not found for "${term}".`;
}

export class ServiceNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceNotReadyError";
  }
}

export class ServiceNotImplementedError extends Error {
  readonly capability: string;

  constructor(capability: string) {
    super(`Capability "${capability}" is not implemented yet.`);
    this.name = "ServiceNotImplementedError";
    this.capability = capability;
  }
}
