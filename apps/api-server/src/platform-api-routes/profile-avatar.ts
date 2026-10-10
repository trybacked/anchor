import { z } from "zod";
import { createProfileAvatarStorageFromEnv } from "@trybacked/infrastructure";
import { platformRoute, type RouteFactory } from "../platform-api-route-factory.js";
import { V1_PATH_PREFIX } from "../platform-api-route-meta.js";

const AVATAR_MAX_BYTES = 4 * 1024 * 1024;

const AVATAR_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const AvatarUserQuerySchema = z.object({
  user: z.string().regex(/^[a-z0-9]{1,64}$/, "user must be a slug"),
});

export const platformApiProfileAvatarRoutes: RouteFactory[] = [
  platformRoute(
    {
      operationId: "getProfileAvatar",
      method: "get",
      path: `${V1_PATH_PREFIX}/profile/avatar`,
      summary: "Read the uploaded profile avatar image for a user",
      tags: ["profile"],
      querySchema: AvatarUserQuerySchema,
      responses: {
        "200": { description: "Avatar image bytes" },
        "404": { description: "No avatar uploaded" },
      },
    },
    () => async (c) => {
      const storage = createProfileAvatarStorageFromEnv({
        env: process.env,
        tenantId: c.get("tenantId"),
      });
      if (storage === undefined) {
        return c.json({ error: "S3 storage not configured" }, 501);
      }
      const { user } = AvatarUserQuerySchema.parse(c.req.query());
      const avatar = await storage.read(user);
      if (avatar === undefined) {
        return c.json({ error: "No avatar uploaded" }, 404);
      }
      return new Response(new Uint8Array(avatar.bytes), {
        headers: {
          "Content-Type": avatar.contentType,
          "Cache-Control": "no-store",
        },
      });
    },
  ),
  platformRoute(
    {
      operationId: "uploadProfileAvatar",
      method: "post",
      path: `${V1_PATH_PREFIX}/profile/avatar`,
      summary: "Upload the profile avatar image for a user (PNG, JPEG, WebP, or GIF up to 4 MB)",
      tags: ["profile"],
      multipartBody: { description: "Multipart upload with the image in the file field" },
      querySchema: AvatarUserQuerySchema,
      responses: {
        "200": { description: "Stored avatar descriptor" },
        "400": { description: "Invalid image" },
      },
    },
    () => async (c) => {
      const storage = createProfileAvatarStorageFromEnv({
        env: process.env,
        tenantId: c.get("tenantId"),
      });
      if (storage === undefined) {
        return c.json({ error: "S3 storage not configured" }, 501);
      }
      const { user } = AvatarUserQuerySchema.parse(c.req.query());
      let form: FormData;
      try {
        form = await c.req.formData();
      } catch {
        return c.json({ error: "Expected multipart form" }, 400);
      }
      const file = form.get("file");
      if (!(file instanceof Blob)) {
        return c.json({ error: "Missing file field" }, 400);
      }
      if (!AVATAR_MIME_TYPES.has(file.type)) {
        return c.json({ error: "Unsupported image type" }, 400);
      }
      if (file.size === 0 || file.size > AVATAR_MAX_BYTES) {
        return c.json({ error: "Image too large" }, 400);
      }
      await storage.write(user, {
        bytes: new Uint8Array(await file.arrayBuffer()),
        contentType: file.type,
      });
      return c.json({ ok: true, user });
    },
  ),
  platformRoute(
    {
      operationId: "deleteProfileAvatar",
      method: "delete",
      path: `${V1_PATH_PREFIX}/profile/avatar`,
      summary: "Remove the profile avatar image for a user",
      tags: ["profile"],
      querySchema: AvatarUserQuerySchema,
      responses: {
        "200": { description: "Avatar removed" },
      },
    },
    () => async (c) => {
      const storage = createProfileAvatarStorageFromEnv({
        env: process.env,
        tenantId: c.get("tenantId"),
      });
      if (storage === undefined) {
        return c.json({ error: "S3 storage not configured" }, 501);
      }
      const { user } = AvatarUserQuerySchema.parse(c.req.query());
      await storage.remove(user);
      return c.json({ ok: true });
    },
  ),
];
