export interface MultipartFile {
    fileName: string;
    content: Buffer;
}

export interface ParsedMultipartForm {
    files: MultipartFile[];
    fields: Record<string, string>;
}

function parseContentDisposition(header: string): { name?: string; fileName?: string } {
    const nameMatch = /name="([^"]+)"/i.exec(header);
    const fileNameMatch = /filename="([^"]+)"/i.exec(header);
    return {
        ...(nameMatch?.[1] !== undefined ? { name: nameMatch[1] } : {}),
        ...(fileNameMatch?.[1] !== undefined ? { fileName: fileNameMatch[1] } : {}),
    };
}

export function parseMultipartFormData(body: Buffer, contentType: string | undefined): ParsedMultipartForm {
    if (contentType === undefined || !contentType.toLowerCase().startsWith("multipart/form-data")) {
        throw new Error("Expected multipart/form-data content type");
    }
    const boundaryMatch = /boundary=(.+)$/i.exec(contentType);
    const boundary = boundaryMatch?.[1]?.trim();
    if (boundary === undefined || boundary.length === 0) {
        throw new Error("Missing multipart boundary");
    }
    const delimiter = `--${boundary}`;
    const raw = body.toString("latin1");
    const parts = raw.split(delimiter).slice(1, -1);
    const files: MultipartFile[] = [];
    const fields: Record<string, string> = {};
    for (const part of parts) {
        const trimmed = part.replace(/^\r\n/, "").replace(/\r\n$/, "");
        const separatorIndex = trimmed.indexOf("\r\n\r\n");
        if (separatorIndex === -1) {
            continue;
        }
        const headerBlock = trimmed.slice(0, separatorIndex);
        const content = trimmed.slice(separatorIndex + 4).replace(/\r\n$/, "");
        const disposition = headerBlock
            .split("\r\n")
            .find((line) => line.toLowerCase().startsWith("content-disposition:"));
        if (disposition === undefined) {
            continue;
        }
        const parsed = parseContentDisposition(disposition);
        if (parsed.fileName !== undefined && parsed.name !== undefined) {
            files.push({
                fileName: parsed.fileName,
                content: Buffer.from(content, "latin1"),
            });
            continue;
        }
        if (parsed.name !== undefined) {
            fields[parsed.name] = content;
        }
    }
    return { files, fields };
}
