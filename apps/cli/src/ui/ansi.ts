const ESC = "\u001B[";
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
const ANSI_SGR_PATTERN = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m`, "g");

export function stripAnsi(text: string): string {
  return text.replace(ANSI_SGR_PATTERN, "");
}
export function wrap(code: string, text: string): string {
  return `${code}${text}${ANSI.reset}`;
}
