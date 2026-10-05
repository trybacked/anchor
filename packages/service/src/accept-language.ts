/**
 * Primary language subtag of the most preferred entry in an Accept-Language
 * header (RFC 9110 §12.5.4), e.g. "it-IT,it;q=0.9,en;q=0.8" → "it".
 */
export function preferredLanguage(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;
  const ranked = header
    .split(",")
    .map((entry) => {
      const [tag = "", ...params] = entry.trim().split(";");
      const q = params
        .map((param) => param.trim())
        .find((param) => param.startsWith("q="))
        ?.slice(2);
      const weight = q === undefined ? 1 : Number(q);
      return { tag: tag.trim(), weight: Number.isFinite(weight) ? weight : 0 };
    })
    .filter((entry) => entry.tag.length > 0 && entry.tag !== "*" && entry.weight > 0)
    .sort((left, right) => right.weight - left.weight);
  const primary = ranked[0]?.tag.split("-")[0]?.toLowerCase();
  return primary !== undefined && /^[a-z]{2,3}$/.test(primary) ? primary : undefined;
}
