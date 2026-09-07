export class PdfNoExtractableTextError extends Error {
    readonly relativePath: string;
    constructor(relativePath: string) {
        super(`PDF has no extractable text: ${relativePath}`);
        this.name = "PdfNoExtractableTextError";
        this.relativePath = relativePath;
    }
}
