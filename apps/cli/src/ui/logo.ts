import { ANSI, wrap } from "./ansi.js";
import { LOGO_ART_LINES } from "./logo-art.js";
const SOLID_CHAR = "█";
export function renderLogo(): string {
    return LOGO_ART_LINES.map((line) => paintLogoLine(line)).join("\n");
}
function paintLogoLine(line: string): string {
    const glyphs = line.replaceAll("#", SOLID_CHAR);
    return glyphs
        .split("")
        .map((char) => (char === SOLID_CHAR ? wrap(ANSI.brandBold, SOLID_CHAR) : char))
        .join("");
}
