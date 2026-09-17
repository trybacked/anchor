import { AnchorValidationError } from "./errors.js";
import type { TenantPipelineConfigPatch } from "./types.js";

/**
 * File input accepted by {@link buildRunUploadFormData}.
 */
export type RunUploadInput =
  | File
  | Blob
  | {
      filename: string;
      content: Blob | ArrayBuffer | Uint8Array | string;
    };

/** Optional pipeline configuration attached to a run submission. */
export type SubmitRunConfig = TenantPipelineConfigPatch;

function toBlob(content: Blob | ArrayBuffer | Uint8Array | string): Blob {
  if (content instanceof Blob) {
    return content;
  }
  if (typeof content === "string") {
    return new Blob([content]);
  }
  if (content instanceof ArrayBuffer) {
    return new Blob([content]);
  }
  return new Blob([Uint8Array.from(content)]);
}

/**
 * Builds multipart form data for submitting pipeline run files.
 *
 * @throws {@link AnchorValidationError} When no files are provided.
 */
export function buildRunUploadFormData(
  files: readonly RunUploadInput[],
  config?: SubmitRunConfig,
): FormData {
  if (files.length === 0) {
    throw new AnchorValidationError("At least one file is required to submit a pipeline run.");
  }

  const form = new FormData();
  for (const file of files) {
    if (file instanceof File) {
      form.append("file", file, file.name);
      continue;
    }

    if (file instanceof Blob) {
      form.append("file", file);
      continue;
    }

    form.append("file", toBlob(file.content), file.filename);
  }

  if (config !== undefined) {
    form.append("config", JSON.stringify(config));
  }

  return form;
}
