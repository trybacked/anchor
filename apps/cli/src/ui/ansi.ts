const ESC = "\u001B[";

/** Anchor brand orange — #ff8318 */
export const BRAND_RGB = "255;131;24";

export const ANSI = {
  reset: `${ESC}0m`,
  bold: `${ESC}1m`,
  dim: `${ESC}2m`,
  brand: `${ESC}38;2;${BRAND_RGB}m`,
  brandBold: `${ESC}1;38;2;${BRAND_RGB}m`,
  green: `${ESC}32m`,
  yellow: `${ESC}33m`,
  red: `${ESC}31m`,
  white: `${ESC}37m`,
  brightWhite: `${ESC}97m`,
} as const;

export function stripAnsi(text: string): string {
  return text.replace(/\u001B\[[0-9;]*m/g, "");
}

export function wrap(code: string, text: string): string {
  return `${code}${text}${ANSI.reset}`;
}
