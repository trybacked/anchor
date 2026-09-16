export type RunUploadInput =
    | File
    | Blob
    | {
          filename: string;
          content: Blob | ArrayBuffer | Uint8Array | string;
      };

export function buildRunUploadFormData(files: readonly RunUploadInput[]): FormData {
    if (files.length === 0) {
        throw new Error("At least one file is required to submit a pipeline run.");
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

        const blob =
            typeof file.content === "string"
                ? new Blob([file.content])
                : new Blob([file.content]);
        form.append("file", blob, file.filename);
    }

    return form;
}
