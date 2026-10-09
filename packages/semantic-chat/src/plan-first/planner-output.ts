import {
  OBJECT_QUERY_AGGREGATE_OPS,
  OBJECT_QUERY_FILTER_OPS,
  OBJECT_QUERY_MODES,
  ObjectQueryAggregationSchema,
  ObjectQueryFilterSchema,
  ObjectQueryJoinSchema,
  ObjectQuerySchema,
  ObjectQueryTextSearchSchema,
} from "@trybacked/compiler";
import { z } from "zod";

export const PlannerOutputSchema = z.object({
  locale: z.string().min(2).max(8),

  query: ObjectQuerySchema.strict().nullable(),
  unanswerable: z.string().nullable(),
  assumptions: z.array(z.string()),
});

export type PlannerOutput = z.infer<typeof PlannerOutputSchema>;

export class PlannerOutputError extends Error {
  constructor(
    message: string,
    readonly text: string,
  ) {
    super(message);
    this.name = "PlannerOutputError";
  }
}

function keysOf(schema: z.ZodObject<z.ZodRawShape>): string {
  return Object.keys(schema.shape).join(", ");
}

export const PLANNER_OUTPUT_CONTRACT = [
  "Output: a single JSON object and nothing else (no prose, no code fence) with keys locale (string), query (ObjectQuery or null), unanswerable (string or null), assumptions (string[]).",
  `ObjectQuery keys: ${keysOf(ObjectQuerySchema)}. mode: ${OBJECT_QUERY_MODES.join(" | ")}.`,
  `filters[] keys: ${keysOf(ObjectQueryFilterSchema)}; op: ${OBJECT_QUERY_FILTER_OPS.join(" | ")}; value: string, number, boolean or array (for in / not_in).`,
  `joins[] keys: ${keysOf(ObjectQueryJoinSchema)}. textSearch keys: ${keysOf(ObjectQueryTextSearchSchema)}. aggregations[] keys: ${keysOf(ObjectQueryAggregationSchema)}; op: ${OBJECT_QUERY_AGGREGATE_OPS.join(" | ")}.`,
  "Omit keys you do not need; never invent placeholder values.",
].join("\n");

function stripCodeFence(text: string): string {
  return text.replace(/^\s*```[a-z]*\s*/i, "").replace(/\s*```\s*$/, "");
}

export function parsePlannerOutput(text: string): PlannerOutput {
  const body = stripCodeFence(text);
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new PlannerOutputError("Planner returned no JSON object.", text);
  }
  let json: unknown;
  try {
    json = JSON.parse(body.slice(start, end + 1));
  } catch (error) {
    throw new PlannerOutputError(
      `Planner JSON is invalid: ${error instanceof Error ? error.message : String(error)}`,
      text,
    );
  }
  const parsed = PlannerOutputSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.join(".") ?? "";
    throw new PlannerOutputError(
      `Planner output does not match the contract${path ? ` at ${path}` : ""}: ${issue?.message ?? "invalid"}`,
      text,
    );
  }
  return parsed.data;
}
