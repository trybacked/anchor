import type { SourceDescriptor } from "@trybacked/core";

export type TabularSourceInput = {
  sourceId: string;
  connectionId?: string | undefined;
  namespace?: string | undefined;

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
