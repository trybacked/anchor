export type ParsedBlockKind = "heading" | "paragraph" | "table" | "list" | "code";

export type ParsedBlock = {
  kind: ParsedBlockKind;
  text: string;
  page?: number;
  charStart: number;
  charEnd: number;
  level?: number;
};

export type ParsedTable = {
  headers: string[];
  rows: string[][];
  page?: number;
};

export type ParsedDocument = {
  uri: string;
  mimeType: string;
  language?: string;
  title?: string;
  blocks: ParsedBlock[];
  tables: ParsedTable[];
  plainText: string;
};

export type DocumentParser = {
  supportedMimeTypes: readonly string[];
  parse(input: { uri: string; mimeType: string; bytes: Buffer }): Promise<ParsedDocument>;
};
