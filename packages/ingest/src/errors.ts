export class EmptyLineDocumentError extends Error {
    readonly relativePath: string;

    constructor(relativePath: string) {
        super(`No extractable text: ${relativePath}`);
        this.name = "EmptyLineDocumentError";
        this.relativePath = relativePath;
    }
}
