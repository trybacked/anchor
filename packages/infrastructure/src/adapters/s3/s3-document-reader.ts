import { GetObjectCommand, type GetObjectCommandInput, S3Client } from "@aws-sdk/client-s3";
import type {
  LocalDocumentFileReader,
  LocalFileReadResult,
} from "../files/local-document-reader.js";
import { s3ObjectKey, type S3StorageConfig } from "./s3-config.js";

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

function contentTypeFromKey(key: string): string {
  const extension = key.toLowerCase().split(".").pop();
  if (extension === undefined) {
    return "application/octet-stream";
  }
  return CONTENT_TYPES[extension] ?? "application/octet-stream";
}

async function bodyToUint8Array(body: unknown): Promise<Uint8Array> {
  if (body === undefined || body === null) {
    return new Uint8Array();
  }
  if (body instanceof Uint8Array) {
    return body;
  }
  if (typeof body === "string") {
    return new TextEncoder().encode(body);
  }
  if (typeof body === "object" && "transformToByteArray" in body) {
    const transform = (body as { transformToByteArray: () => Promise<Uint8Array> })
      .transformToByteArray;
    return transform();
  }
  const chunks: Uint8Array[] = [];
  const stream = body as AsyncIterable<Uint8Array>;
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

export function createS3DocumentFileReader(options: {
  config: S3StorageConfig;
  client?: S3Client;
}): LocalDocumentFileReader {
  const client =
    options.client ??
    new S3Client({
      region: options.config.region,
    });
  const { bucket, tenantPrefix } = options.config;

  return async (volumePath, init): Promise<LocalFileReadResult> => {
    const key = s3ObjectKey(volumePath, tenantPrefix);
    const input: GetObjectCommandInput = {
      Bucket: bucket,
      Key: key,
    };
    if (init?.range !== undefined) {
      input.Range = init.range.trim();
    }
    const response = await client.send(new GetObjectCommand(input));
    const data = await bodyToUint8Array(response.Body);
    const contentType =
      typeof response.ContentType === "string" && response.ContentType.length > 0
        ? response.ContentType
        : contentTypeFromKey(key);
    if (response.ContentRange !== undefined && response.ContentRange.length > 0) {
      return {
        status: 206,
        data,
        contentType,
        contentLength: data.byteLength,
        contentRange: response.ContentRange,
        acceptRanges: "bytes",
      };
    }
    return {
      status: 200,
      data,
      contentType,
      contentLength: data.byteLength,
    };
  };
}
