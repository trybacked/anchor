import type { ObjectQuery, ObjectQueryFilterOp } from "@trybacked/compiler";
import type { Ontology } from "@trybacked/core";

export type RenderableResult = {
  objectId: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  mode: "rows" | "count";
};

export type RenderedAnswer = {
  text: string;
  claims: { text: string; toolCallId: string }[];
};

type Messages = {
  total: (count: string, entity: string) => string;
  noResults: (entity: string) => string;
  listing: (shown: string, entity: string) => string;
  breakdown: (entity: string, groups: string) => string;
  criteria: string;
  filterOps: Record<ObjectQueryFilterOp, string>;
  textSearch: (query: string) => string;
};

const EN: Messages = {
  total: (count, entity) => `**${count}** ${entity}`,
  noResults: (entity) => `No ${entity} match these criteria.`,
  listing: (shown, entity) => `**${shown}** ${entity}:`,
  breakdown: (entity, groups) => `${entity} by ${groups}:`,
  criteria: "Criteria",
  filterOps: {
    eq: "is",
    neq: "is not",
    gt: "greater than",
    gte: "at least",
    lt: "less than",
    lte: "at most",
    contains: "contains",
    not_contains: "does not contain",
    in: "is one of",
    not_in: "is none of",
    is_null: "is empty",
    is_not_null: "is set",
    starts_with: "starts with",
  },
  textSearch: (query) => `text contains «${query}»`,
};

const IT: Messages = {
  total: (count, entity) => `**${count}** ${entity}`,
  noResults: (entity) => `Nessun risultato per ${entity} con questi criteri.`,
  listing: (shown, entity) => `**${shown}** ${entity}:`,
  breakdown: (entity, groups) => `${entity} per ${groups}:`,
  criteria: "Criteri",
  filterOps: {
    eq: "uguale a",
    neq: "diverso da",
    gt: "maggiore di",
    gte: "almeno",
    lt: "minore di",
    lte: "al massimo",
    contains: "contiene",
    not_contains: "non contiene",
    in: "tra",
    not_in: "non tra",
    is_null: "vuoto",
    is_not_null: "valorizzato",
    starts_with: "inizia con",
  },
  textSearch: (query) => `testo contiene «${query}»`,
};

const MESSAGES_BY_LANGUAGE: Record<string, Messages> = { en: EN, it: IT };
const MAX_LISTED_ROWS = 10;

function messagesFor(locale: string): Messages {
  const language = locale.toLowerCase().split(/[-_]/)[0] ?? "en";
  return MESSAGES_BY_LANGUAGE[language] ?? EN;
}

function entityLabel(ontology: Ontology, objectId: string): string {
  const object = ontology.objects.find((candidate) => candidate.id === objectId);
  return object?.name ?? objectId;
}

function propertyLabel(ontology: Ontology, objectId: string, propertyId: string): string {
  const object = ontology.objects.find((candidate) => candidate.id === objectId);
  const property = object?.properties.find((candidate) => candidate.id === propertyId);
  return property?.name ?? propertyId;
}

function columnLabel(ontology: Ontology, rootObjectId: string, column: string): string {
  if (column.includes(".")) {
    const [objectId, propertyId] = column.split(".", 2);
    if (objectId !== undefined && propertyId !== undefined) {
      return `${entityLabel(ontology, objectId)} · ${propertyLabel(ontology, objectId, propertyId)}`;
    }
  }
  return propertyLabel(ontology, rootObjectId, column);
}

function formatValue(value: unknown, locale: string): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return new Intl.NumberFormat(locale).format(value);
  if (typeof value === "string") {
    const numeric = Number(value);
    return value.trim() !== "" && Number.isFinite(numeric) && /^-?\d+(\.\d+)?$/.test(value.trim())
      ? new Intl.NumberFormat(locale).format(numeric)
      : value;
  }
  if (Array.isArray(value)) return value.map((entry) => formatValue(entry, locale)).join(", ");
  if (typeof value === "boolean" || typeof value === "bigint") return value.toString();
  return JSON.stringify(value);
}

function describeCriteria(
  ontology: Ontology,
  query: ObjectQuery,
  locale: string,
  messages: Messages,
): string | undefined {
  const parts = (query.filters ?? []).map((filter) => {
    const objectId = filter.objectId ?? query.objectId;
    const label =
      objectId === query.objectId
        ? propertyLabel(ontology, objectId, filter.propertyId)
        : `${entityLabel(ontology, objectId)} · ${propertyLabel(ontology, objectId, filter.propertyId)}`;
    const op = messages.filterOps[filter.op];
    if (filter.op === "is_null" || filter.op === "is_not_null") return `${label} ${op}`;
    return `${label} ${op} «${formatValue(filter.value, locale)}»`;
  });
  if (query.textSearch !== undefined) parts.push(messages.textSearch(query.textSearch.query));
  return parts.length > 0 ? `${messages.criteria}: ${parts.join("; ")}` : undefined;
}

function countValue(result: RenderableResult): number {
  const first = result.rows[0];
  const raw = first === undefined ? undefined : Object.values(first)[0];
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : result.rowCount;
}

/** Group keys in bold, then measures: a lone measure is shown bare, several keep their alias. */
function renderBreakdownRow(
  groupCount: number,
  columns: string[],
  row: Record<string, unknown>,
  locale: string,
): string {
  const keys = columns.slice(0, groupCount).map((column) => formatValue(row[column], locale));
  const measures = columns.slice(groupCount);
  const values = measures.map((column) =>
    measures.length === 1
      ? formatValue(row[column], locale)
      : `${column}: ${formatValue(row[column], locale)}`,
  );
  return `- **${keys.join(" · ")}**: ${values.join(" · ")}`;
}

function renderRow(
  ontology: Ontology,
  rootObjectId: string,
  columns: string[],
  row: Record<string, unknown>,
  locale: string,
): string {
  const cells = columns.map((column, index) => {
    const value = formatValue(row[column], locale);
    return index === 0
      ? `**${value}**`
      : `${columnLabel(ontology, rootObjectId, column)}: ${value}`;
  });
  return `- ${cells.join(" · ")}`;
}

export function renderPlanAnswer(options: {
  ontology: Ontology;
  query: ObjectQuery;
  result: RenderableResult;
  locale: string;
  toolCallId: string;
}): RenderedAnswer {
  const { ontology, query, result, locale, toolCallId } = options;
  const messages = messagesFor(locale);
  const entity = entityLabel(ontology, query.objectId);
  const criteria = describeCriteria(ontology, query, locale, messages);
  const lines: string[] = [];
  const claims: RenderedAnswer["claims"] = [];

  if (result.mode === "count") {
    const count = countValue(result);
    const formatted = formatValue(count, locale);
    lines.push(count === 0 ? messages.noResults(entity) : messages.total(formatted, entity));
    claims.push({ text: formatted, toolCallId });
  } else if (result.rows.length === 0) {
    lines.push(messages.noResults(entity));
  } else {
    const shown = result.rows.slice(0, MAX_LISTED_ROWS);
    const groupBy = query.groupBy ?? [];
    const formattedCount = formatValue(result.rowCount, locale);
    if (groupBy.length > 0) {
      const groups = groupBy
        .map((column) => columnLabel(ontology, query.objectId, column))
        .join(" · ");
      lines.push(
        messages.breakdown(entity, groups),
        ...shown.map((row) => renderBreakdownRow(groupBy.length, result.columns, row, locale)),
      );
    } else {
      lines.push(
        messages.listing(formattedCount, entity),
        ...shown.map((row) => renderRow(ontology, query.objectId, result.columns, row, locale)),
      );
    }
    claims.push({ text: formattedCount, toolCallId });
  }
  if (criteria !== undefined) lines.push("", `_${criteria}_`);
  return { text: lines.join("\n"), claims };
}
