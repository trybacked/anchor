import {
    ARCHIVE_EXTENSIONS,
    IGNORED_SOURCE_BASENAMES,
    SOURCE_EXTENSION_FORMATS,
} from "./constants.js";
import type { DatasetFormat } from "./types.js";

export function resolveSourceFormat(extension: string): DatasetFormat | undefined {
    return SOURCE_EXTENSION_FORMATS[extension.toLowerCase()];
}

export function isArchiveExtension(extension: string): boolean {
    return ARCHIVE_EXTENSIONS.has(extension.toLowerCase());
}

export function isIgnoredSourceBasename(basename: string): boolean {
    return IGNORED_SOURCE_BASENAMES.has(basename.toLowerCase());
}
