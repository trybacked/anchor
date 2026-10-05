import { ListRelationsQuerySchema } from "@trybacked/service";
import { z } from "zod";
export const EntityIdParamSchema = z.object({ id: z.string().min(1) });
export const DocumentIdParamSchema = z.object({ id: z.string().min(1) });
export const DocumentPreviewQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  format: z.enum(["json", "file"]).optional(),
});
export { ListRelationsQuerySchema };
