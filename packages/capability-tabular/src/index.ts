import type { SourceDescriptor } from "@trybacked/core";

/**
 * Tabular capability (Plan Phase 4).
 *
 * Structured sources get no special logic: they are datasets plus discovery.
 * A tabular source descriptor only records which datasets belong to the source
 * so the ontology-AI pipeline (Fase 5) can profile and propose against them.
 */

export type TabularSourceInput = {
  sourceId: string;
  connectionId?: string | undefined;
  namespace?: string | undefined;
  /** Dataset ids owned by this source (e.g. `catalog.schema.table`). */
  datasets: string[];
};

export function createTabularSourceDescriptor(input: TabularSourceInput): SourceDescriptor {
  return {
    sourceId: input.sourceId,
    kind: "table",
    capabilities: ["tabular"],
    datasets: [...input.datasets],
    ...(input.connectionId !== undefined ? { connectionId: input.connectionId } : {}),
    ...(input.namespace !== undefined ? { namespace: input.namespace } : {}),
  };
}

export function tabularDatasetIds(descriptor: SourceDescriptor): string[] {
  return descriptor.capabilities.includes("tabular") ? (descriptor.datasets ?? []) : [];
}