import type { Ontology } from "./spec.js";
import type { ValidationIssue } from "./validation-result.js";
function objectIds(ontology: Ontology): Set<string> {
  return new Set(ontology.objects.map((object) => object.id));
}
function propertyIds(ontology: Ontology, objectId: string): Set<string> {
  const object = ontology.objects.find((candidate) => candidate.id === objectId);
  if (object === undefined) {
    return new Set();
  }
  return new Set(object.properties.map((property) => property.id));
}

export function validateSemanticsReferences(ontology: Ontology): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const objects = objectIds(ontology);
  for (const object of ontology.objects) {
    const semantics = object.semantics;
    if (semantics?.defaultTimeDimension !== undefined) {
      if (!propertyIds(ontology, object.id).has(semantics.defaultTimeDimension)) {
        issues.push({
          code: "semantics_unknown_property",
          severity: "error",
          message: `Object "${object.id}" defaultTimeDimension "${semantics.defaultTimeDimension}" is not a property id.`,
          path: `objects.${object.id}.semantics.defaultTimeDimension`,
        });
      }
    }
    for (const propertyId of semantics?.displayProperties ?? []) {
      if (!propertyIds(ontology, object.id).has(propertyId)) {
        issues.push({
          code: "semantics_unknown_property",
          severity: "error",
          message: `Object "${object.id}" displayProperties references unknown property "${propertyId}".`,
          path: `objects.${object.id}.semantics.displayProperties`,
        });
      }
    }
  }
  const block = ontology.semantics;
  if (block === undefined) {
    return issues;
  }
  const glossaryIds = new Set<string>();
  for (const term of block.glossary) {
    if (glossaryIds.has(term.id)) {
      issues.push({
        code: "semantics_duplicate_glossary_id",
        severity: "error",
        message: `Duplicate glossary id "${term.id}".`,
        path: "semantics.glossary",
      });
    }
    glossaryIds.add(term.id);
    if (term.objectId !== undefined && !objects.has(term.objectId)) {
      issues.push({
        code: "semantics_unknown_object",
        severity: "error",
        message: `Glossary term "${term.id}" references unknown object "${term.objectId}".`,
        path: `semantics.glossary.${term.id}`,
      });
    }
    if (term.propertyId !== undefined) {
      const objectId = term.objectId ?? ontology.objects[0]?.id;
      if (objectId === undefined || !propertyIds(ontology, objectId).has(term.propertyId)) {
        issues.push({
          code: "semantics_unknown_property",
          severity: "error",
          message: `Glossary term "${term.id}" references unknown property "${term.propertyId}".`,
          path: `semantics.glossary.${term.id}`,
        });
      }
    }
  }
  const exampleIds = new Set<string>();
  for (const example of block.examples) {
    if (exampleIds.has(example.id)) {
      issues.push({
        code: "semantics_duplicate_example_id",
        severity: "error",
        message: `Duplicate example id "${example.id}".`,
        path: "semantics.examples",
      });
    }
    exampleIds.add(example.id);
  }
  return issues;
}
