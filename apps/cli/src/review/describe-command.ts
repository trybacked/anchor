import type { AuthoringCommandV2 } from "@trybacked/core";

export function describeCommandTarget(command: AuthoringCommandV2): string {
  switch (command.type) {
    case "addObjectType":
      return command.objectType.id;
    case "updateObjectType":
    case "removeObjectType":
    case "setObjectTypeSemantics":
      return command.objectTypeId;
    case "addProperty":
      return `${command.objectTypeId}.${command.property.id}`;
    case "removeProperty":
    case "setPropertySemantics":
      return `${command.objectTypeId}.${command.propertyId}`;
    case "bindDatasource":
      return `${command.objectTypeId} ← ${command.binding.datasetId}`;
    case "unbindDatasource":
      return `${command.objectTypeId} ← ${command.sourceId}`;
    case "addInterface":
      return command.interface.id;
    case "updateInterface":
    case "removeInterface":
      return command.interfaceId;
    case "addValueType":
      return command.valueType.id;
    case "removeValueType":
      return command.valueTypeId;
    case "addLinkType":
      return `${command.linkType.fromObjectTypeId} → ${command.linkType.toObjectTypeId}`;
    case "updateLinkType":
    case "removeLinkType":
      return command.linkTypeId;
    case "addActionType":
      return command.actionType.id;
    case "removeActionType":
      return command.actionTypeId;
    case "upsertGlossaryTerm":
      return command.term.id;
    case "removeGlossaryTerm":
      return command.termId;
    case "upsertExample":
      return command.example.id;
    case "removeExample":
      return command.exampleId;
    default: {
      const _exhaustive: never = command;
      throw new Error(`Unhandled authoring command: ${String(_exhaustive)}`);
    }
  }
}
