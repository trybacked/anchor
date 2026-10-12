import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client as S3ClientCtor,
  type S3Client,
} from "@aws-sdk/client-s3";
import { resolveS3StorageConfig, type S3StorageConfig } from "../s3/s3-config.js";

export type ProfileAvatar = {
  bytes: Uint8Array;
  contentType: string;
};

export type ProfileAvatarStorage = {
  /** Reads the stored avatar for a user, or undefined when none was uploaded. */
  read: (user: string) => Promise<ProfileAvatar | undefined>;
  /** Replaces the avatar for a user; only one image is kept per user. */
  write: (user: string, image: { bytes: Uint8Array; contentType: string }) => Promise<void>;
  /** Removes any stored avatar for a user. */
  remove: (user: string) => Promise<void>;
};

/** Avatar keys live outside the document archive scan so profile images never enter the docs catalog. */
function avatarPrefix(tenantPrefix: string, user: string): string {
  return `${tenantPrefix}.profiles/${user}/`;
}

export function createS3ProfileAvatarStorage(options: {
  config: S3StorageConfig;
  client?: S3Client;
}): ProfileAvatarStorage {
  const client = options.client ?? new S3ClientCtor({ region: options.config.region });
  const { bucket, tenantPrefix } = options.config;

  async function listKeys(prefix: string): Promise<string[]> {
    const response = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }),
    );
    return (response.Contents ?? [])
      .map((object) => object.Key)
      .filter((key): key is string => key !== undefined && key.length > 0);
  }

  return {
    async read(user) {
      const prefix = avatarPrefix(tenantPrefix, user);
      const keys = await listKeys(prefix);
      const key = keys[0];
      if (key === undefined) {
        return undefined;
      }
      const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const body = object.Body;
      if (body === undefined) {
        return undefined;
      }
      return {
        bytes: await body.transformToByteArray(),
        contentType: object.ContentType ?? "application/octet-stream",
      };
    },

    async write(user, image) {
      const prefix = avatarPrefix(tenantPrefix, user);
      const extension = image.contentType.split("/")[1]?.split(";")[0] ?? "bin";
      const key = `${prefix}avatar.${extension}`;
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: image.bytes,
          ContentType: image.contentType,
        }),
      );
      const stale = (await listKeys(prefix)).filter((existing) => existing !== key);
      if (stale.length > 0) {
        await client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: stale.map((existing) => ({ Key: existing })) },
          }),
        );
      }
    },

    async remove(user) {
      const prefix = avatarPrefix(tenantPrefix, user);
      const keys = await listKeys(prefix);
      if (keys.length === 0) {
        return;
      }
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: keys.map((key) => ({ Key: key })) },
        }),
      );
    },
  };
}

export function createProfileAvatarStorageFromEnv(options: {
  env: NodeJS.ProcessEnv;
  tenantId: string;
}): ProfileAvatarStorage | undefined {
  const config = resolveS3StorageConfig(options.env, options.tenantId);
  if (config === undefined) {
    return undefined;
  }
  return createS3ProfileAvatarStorage({ config });
}
