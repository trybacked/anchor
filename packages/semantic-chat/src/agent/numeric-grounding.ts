const ITALIAN_THOUSANDS = /^\d{1,3}(\.\d{3})+$/;
export function numericNeedleVariants(raw: string): readonly string[] {
  const variants = new Set<string>([raw]);
  if (ITALIAN_THOUSANDS.test(raw)) {
    variants.add(raw.replaceAll(".", ""));
  }
  if (/^\d+\.\d{3}$/.test(raw)) {
    variants.add(raw.replace(".", ""));
  }
  if (raw.includes(",")) {
    variants.add(raw.replaceAll(".", "").replace(",", "."));
    variants.add(raw.replace(",", "."));
  }
  return [...variants];
}
function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}
export function collectNumericStrings(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (value === null || value === undefined) {
    return out;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    out.add(String(value));
    if (Number.isInteger(value)) {
      out.add(String(Math.trunc(value)));
    }
    return out;
  }
  if (typeof value === "string") {
    if (value.length > 0) {
      out.add(value);
    }
    if (/^-?\d+$/.test(value)) {
      out.add(value);
    }
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectNumericStrings(item, out);
    }
    return out;
  }
  if (typeof value === "object") {
    for (const entry of Object.values(value)) {
      collectNumericStrings(entry, out);
    }
  }
  return out;
}
export function resultContainsNumeric(result: unknown, needle: string): boolean {
  const serialized = JSON.stringify(result);
  for (const variant of numericNeedleVariants(needle)) {
    if (serialized.includes(variant)) {
      return true;
    }
  }
  const needleDigits = digitsOnly(needle);
  if (needleDigits.length === 0) {
    return false;
  }
  for (const candidate of collectNumericStrings(result)) {
    if (candidate === needle) {
      return true;
    }
    if (digitsOnly(candidate) === needleDigits) {
      return true;
    }
    for (const variant of numericNeedleVariants(needle)) {
      if (digitsOnly(candidate) === digitsOnly(variant)) {
        return true;
      }
    }
  }
  return false;
}
