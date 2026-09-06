/**
 * Deterministic header-field extraction from table slugs and page-1 text.
 */

export interface ExtractedHeaderFields {
  protocolNumber: string | null;
  publishedDate: string | null;
  subject: string | null;
  issuingOffice: string | null;
}

const ISO_DATE_FROM_SLUG =
  /(?:^|_)del[_-](\d{2})[_-](\d{2})[_-](\d{4})(?:_|$)/i;

const PROTOCOL_FROM_SLUG =
  /(?:^|_)(?:prot[_-]?(?:par|int)?[_-]?)?(\d{5,})(?:_|$)/i;

const DETERMINATION_NUMBER_FROM_SLUG = /(?:^|_)n[_-](\d+)(?:_|$)/i;

const PROTOCOL_IN_TEXT =
  /\bprot\.?\s*(?:n\.?|num\.?)?\s*[:.]?\s*(\d[\d./-]*\d|\d+)/i;

const DATE_IN_TEXT =
  /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/;

const OFFICE_IN_TEXT =
  /\b(comune di [^\n,]+|provincia di [^\n,]+|regione [^\n,]+)/i;

/** OCR noise: dashes/symbols only, low alphanumeric ratio, or all-caps institution headers. */
export function isOcrNoiseLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return true;
  }
  if (/^[\s\-_=|*#./\\:+]+$/.test(trimmed)) {
    return true;
  }

  const alphanumeric = (trimmed.match(/[a-zA-Z0-9À-ÿ]/g) ?? []).length;
  if (alphanumeric / trimmed.length < 0.5) {
    return true;
  }

  const letters = trimmed.match(/[a-zA-ZÀ-ÿ]/g) ?? [];
  if (letters.length >= 8 && letters.every((letter) => letter === letter.toUpperCase())) {
    return true;
  }

  return false;
}

function toIsoDate(day: string, month: string, year: string): string | null {
  const d = Number.parseInt(day, 10);
  const m = Number.parseInt(month, 10);
  const y = Number.parseInt(year, 10);
  if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(y)) {
    return null;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) {
    return null;
  }
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function extractDateFromSlug(sourceTable: string): string | null {
  const match = ISO_DATE_FROM_SLUG.exec(sourceTable);
  if (!match) {
    return null;
  }
  return toIsoDate(match[1] ?? "", match[2] ?? "", match[3] ?? "");
}

function extractProtocolFromSlug(sourceTable: string): string | null {
  const determinationMatch = DETERMINATION_NUMBER_FROM_SLUG.exec(sourceTable);
  if (determinationMatch?.[1] !== undefined) {
    return determinationMatch[1];
  }

  const protocolMatch = PROTOCOL_FROM_SLUG.exec(sourceTable);
  if (protocolMatch?.[1] !== undefined) {
    return protocolMatch[1];
  }

  return null;
}

function extractSubjectFromHeader(headerLines: string[]): string | null {
  for (const line of headerLines) {
    const trimmed = line.trim();
    if (isOcrNoiseLine(trimmed)) {
      continue;
    }
    if (trimmed.length >= 12) {
      return trimmed.length > 200 ? `${trimmed.slice(0, 197)}...` : trimmed;
    }
  }
  return null;
}

function extractFromHeaderText(headerLines: string[]): ExtractedHeaderFields {
  const text = headerLines.join("\n");
  const protocolMatch = PROTOCOL_IN_TEXT.exec(text);
  const dateMatch = DATE_IN_TEXT.exec(text);
  const officeMatch = OFFICE_IN_TEXT.exec(text);

  return {
    protocolNumber: protocolMatch?.[1] ?? null,
    publishedDate:
      dateMatch !== null && dateMatch[1] !== undefined && dateMatch[2] !== undefined && dateMatch[3] !== undefined
        ? toIsoDate(dateMatch[1], dateMatch[2], dateMatch[3])
        : null,
    subject: extractSubjectFromHeader(headerLines),
    issuingOffice: officeMatch?.[1] ?? null,
  };
}

/** Merge slug-derived fields with header text; header wins when both exist. */
export function extractHeaderFields(
  sourceTable: string,
  headerLines: string[],
): ExtractedHeaderFields {
  const fromHeader = extractFromHeaderText(headerLines);
  const fromSlug: ExtractedHeaderFields = {
    protocolNumber: extractProtocolFromSlug(sourceTable),
    publishedDate: extractDateFromSlug(sourceTable),
    subject: null,
    issuingOffice: null,
  };

  return {
    protocolNumber: fromHeader.protocolNumber ?? fromSlug.protocolNumber,
    publishedDate: fromHeader.publishedDate ?? fromSlug.publishedDate,
    subject: fromHeader.subject,
    issuingOffice: fromHeader.issuingOffice,
  };
}
