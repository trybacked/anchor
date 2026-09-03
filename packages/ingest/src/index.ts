/** DuckDB wrapper: lettura sorgenti → tabelle queryabili */

import { registerSource } from "./register.js";
import { scanFolder } from "./scan.js";
import { createDuckDbSession } from "./session.js";
import { toTableName, uniqueTableName } from "./table-names.js";
import type { Dataset, IngestSession, IngestWarning } from "./types.js";

export { quoteIdentifier, quoteString } from "./sql.js";
export type {
  CsvDialect,
  CsvEncoding,
  Dataset,
  DatasetFormat,
  DecimalSeparator,
  IngestResult,
  IngestSession,
  IngestWarning,
  IngestWarningKind,
  SqlQuery,
} from "./types.js";

export async function ingestFolder(folderPath: string): Promise<IngestSession> {
  const scan = await scanFolder(folderPath);
  const session = await createDuckDbSession();

  const datasets: Dataset[] = [];
  const warnings: IngestWarning[] = scan.unsupportedFiles.map((file) => ({
    kind: "unsupported_format" as const,
    file,
    message: "Formato non supportato: file ignorato",
  }));

  const usedNames = new Set<string>();
  for (const source of scan.sources) {
    const tableName = uniqueTableName(toTableName(source.relativePath), usedNames);
    try {
      const registration = await registerSource(session.query, source, tableName);
      datasets.push(registration.dataset);
      warnings.push(...registration.warnings);
    } catch (error) {
      warnings.push({
        kind: "unreadable_file",
        file: source.relativePath,
        message: `File non leggibile: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return { datasets, warnings, query: session.query, close: session.close };
}
