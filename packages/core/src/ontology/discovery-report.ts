import { z } from "zod";
import { OntologySchema } from "./spec.js";

export const DatasetInspectionTableSchema = z.object({
  datasetId: z.string().min(1),
  rowCount: z.number().int().nonnegative(),
  columnCount: z.number().int().nonnegative(),
  primaryKeyCandidates: z.array(z.string().min(1)),
  foreignKeyColumnCount: z.number().int().nonnegative(),
});

export const DatasetInspectionSchema = z.object({
  inspectedAt: z.string().datetime(),
  tables: z.array(DatasetInspectionTableSchema),
});

export const DiscoveryReportSchema = z.object({
  inspection: DatasetInspectionSchema,
  ontology: OntologySchema,
});

export type DatasetInspectionTable = z.infer<typeof DatasetInspectionTableSchema>;
export type DatasetInspection = z.infer<typeof DatasetInspectionSchema>;
export type DiscoveryReport = z.infer<typeof DiscoveryReportSchema>;
