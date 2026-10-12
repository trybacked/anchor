import type { OntologyV2 } from "@trybacked/core";

/** Text2KGBench (2308.02357): schema conformance and hallucinated-edge detection. */
export type Text2KgMetrics = {
  objectTypeCount: number;
  linkTypeCount: number;
  invalidLinks: number;
  schemaConformance: number;
  hallucinatedEdgeRate: number;
};

export function computeText2KgMetrics(ontology: OntologyV2): Text2KgMetrics {
  const objectIds = new Set(ontology.objectTypes.map((objectType) => objectType.id));
  let invalidLinks = 0;
  for (const link of ontology.linkTypes) {
    if (!objectIds.has(link.fromObjectTypeId) || !objectIds.has(link.toObjectTypeId)) {
      invalidLinks += 1;
    }
  }
  const linkTypeCount = ontology.linkTypes.length;
  const schemaConformance =
    linkTypeCount === 0 ? 1 : (linkTypeCount - invalidLinks) / linkTypeCount;
  return {
    objectTypeCount: ontology.objectTypes.length,
    linkTypeCount,
    invalidLinks,
    schemaConformance,
    hallucinatedEdgeRate: linkTypeCount === 0 ? 0 : invalidLinks / linkTypeCount,
  };
}

/** RGB negative rejection proxy: ontology should not over-commit when CQ coverage is low. */
export function negativeRejectionScore(competencyCoverage: number, objectTypeCount: number): number {
  if (competencyCoverage >= 0.5) {
    return 1;
  }
  if (objectTypeCount <= 3) {
    return 1;
  }
  return Math.max(0, 1 - (objectTypeCount - 3) * 0.15);
}
