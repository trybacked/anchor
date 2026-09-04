/** PDF parsed successfully but contains no machine-readable text (e.g. scanned image). */
export class PdfNoExtractableTextError extends Error {
  readonly relativePath: string;

  constructor(relativePath: string) {
    super(`PDF has no extractable text: ${relativePath}`);
    this.name = "PdfNoExtractableTextError";
    this.relativePath = relativePath;
  }
}
