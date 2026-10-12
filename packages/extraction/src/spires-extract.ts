import type { OntologyObjectTypeV2, OntologyV2 } from "@trybacked/core";
import { createGatewayLanguageModel, requireAiGatewayApiKey } from "@trybacked/infrastructure";
import { z } from "zod";
import { excerptAroundMatch, verifyEvidenceInSource } from "./evidence.js";

export type SpiresExtractedRow = {
  objectTypeId: string;
  values: Record<string, string>;
  evidenceUri: string;
  evidenceExcerpt: string | null;
  verified: boolean;
};

const RowSchema = z.object({
  rows: z.array(
    z.object({
      values: z.record(z.string()),
      evidenceQuote: z.string().min(1),
    }),
  ),
});

function schemaForObjectType(
  objectType: OntologyObjectTypeV2,
): z.ZodType<z.infer<typeof RowSchema>> {
  return RowSchema.describe(objectType.id);
}

/** SPIRES (2304.02711): schema-guided extraction via LLM only; values must verify against source text. */
export async function extractInstancesSpires(options: {
  ontology: OntologyV2;
  plainText: string;
  evidenceUri: string;
  env: NodeJS.ProcessEnv;
  cacheDir?: string;
  maxRowsPerType?: number;
}): Promise<SpiresExtractedRow[]> {
  requireAiGatewayApiKey(options.env);
  const targets = options.ontology.objectTypes.filter((objectType) => objectType.id !== "document");
  const maxRows = options.maxRowsPerType ?? 5;
  const output: SpiresExtractedRow[] = [];

  const llm = createGatewayLanguageModel({
    modelId:
      options.env["ONTOLOGY_EXTRACT_MODEL"]?.trim() ||
      options.env["SEMANTIC_MODEL"]?.trim() ||
      "openai/gpt-4o-mini",
    ...(options.cacheDir !== undefined ? { cacheDir: options.cacheDir } : {}),
  });

  for (const objectType of targets) {
    const propertyList = objectType.properties
      .filter((property) => property.kind === "physical")
      .map((property) => property.id)
      .join(", ");
    const result = await llm.generateStructured<z.infer<typeof RowSchema>>({
      schemaName: `extract_${objectType.id}`,
      schema: schemaForObjectType(objectType),
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Extract instances strictly from the passage. evidenceQuote MUST be a verbatim substring. Do not invent relations or values.",
        },
        {
          role: "user",
          content: `Object type: ${objectType.id}\nProperties: ${propertyList}\n\nText:\n${options.plainText.slice(0, 6000)}\n\nReturn up to ${String(maxRows)} rows.`,
        },
      ],
    });
    for (const row of result.value.rows.slice(0, maxRows)) {
      const primaryValue = row.values.name ?? Object.values(row.values)[0] ?? row.evidenceQuote;
      const verified =
        verifyEvidenceInSource(options.plainText, row.evidenceQuote) ||
        verifyEvidenceInSource(options.plainText, primaryValue);
      output.push({
        objectTypeId: objectType.id,
        values: row.values,
        evidenceUri: options.evidenceUri,
        evidenceExcerpt: verified ? excerptAroundMatch(options.plainText, primaryValue) : null,
        verified,
      });
    }
  }
  return output.filter((row) => row.verified);
}
