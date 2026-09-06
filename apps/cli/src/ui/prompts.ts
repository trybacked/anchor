import { ANSI, wrap } from "./ansi.js";

export interface AnchorPromptTheme {
  prefix: { idle: string; done: string };
  style: {
    answer: (text: string) => string;
    message: (text: string) => string;
    help: (text: string) => string;
    highlight: (text: string) => string;
    key: (text: string) => string;
  };
}

function paint(code: string, text: string): string {
  return wrap(code, text);
}

export function createPromptTheme(): AnchorPromptTheme {
  return {
    prefix: { idle: paint(ANSI.brand, "?"), done: paint(ANSI.green, "✓") },
    style: {
      answer: (text: string) => paint(`${ANSI.bold}${ANSI.white}`, text),
      message: (text: string) => paint(`${ANSI.bold}${ANSI.white}`, text),
      help: (text: string) => paint(ANSI.dim, text),
      highlight: (text: string) => paint(ANSI.brandBold, text),
      key: (text: string) => paint(ANSI.brand, text),
    },
  };
}
