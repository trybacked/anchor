const TRUTHY_ENV_VALUES = new Set(["1", "true", "yes"]);

export function isOcrEnabled(): boolean {
    const flag = process.env["BACKED_SKIP_OCR"]?.trim().toLowerCase();
    return flag === undefined || !TRUTHY_ENV_VALUES.has(flag);
}
