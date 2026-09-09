import { z } from "zod";

export const ModelSearchMatchKindSchema = z.enum(["entity", "property", "relation", "rule"]);

export const ModelSearchMatchSchema = z.object({
    kind: ModelSearchMatchKindSchema,
    id: z.string(),
    name: z.string(),
    snippet: z.string(),
});

export type ModelSearchMatch = z.infer<typeof ModelSearchMatchSchema>;
