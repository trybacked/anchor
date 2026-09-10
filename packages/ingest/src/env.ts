const TRUTHY_ENV_VALUES = new Set(["1", "true", "yes"]);

export const BACKED_SKIP_OCR_ENV = "BACKED_SKIP_OCR";
export const BACKED_OCR_LANG_ENV = "BACKED_OCR_LANG";
export const BACKED_OCR_MAX_PAGES_ENV = "BACKED_OCR_MAX_PAGES";
export const BACKED_OCR_DPI_ENV = "BACKED_OCR_DPI";

export function isOcrEnabled(): boolean {
    const flag = process.env[BACKED_SKIP_OCR_ENV]?.trim().toLowerCase();
    return flag === undefined || !TRUTHY_ENV_VALUES.has(flag);
}
