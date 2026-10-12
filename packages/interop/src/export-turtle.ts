import type { OntologyV2 } from "@trybacked/core";

function iri(base: string, local: string): string {
  return `<${base}${local}>`;
}

export function exportOntologyTurtle(
  ontology: OntologyV2,
  baseIri = "https://backed.local/ontology/",
): string {
  const lines: string[] = [
    `@prefix owl: <http://www.w3.org/2002/07/owl#> .`,
    `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .`,
    `@prefix skos: <http://www.w3.org/2004/02/skos/core#> .`,
    ``,
    `${iri(baseIri, ontology.metadata.id)} a owl:Ontology ;`,
    `  rdfs:label "${ontology.metadata.id}" .`,
    ``,
  ];
  for (const objectType of ontology.objectTypes) {
    lines.push(`${iri(baseIri, objectType.id)} a owl:Class ;`);
    lines.push(`  rdfs:label "${objectType.name.replaceAll('"', '\\"')}" .`);
    if (objectType.semantics?.labels !== undefined) {
      for (const [locale, label] of Object.entries(objectType.semantics.labels)) {
        const text = typeof label === "string" ? label : label.singular;
        lines.push(
          `${iri(baseIri, objectType.id)} skos:prefLabel "${text.replaceAll('"', '\\"')}"@${locale} .`,
        );
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}
