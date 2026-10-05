import type { ConversationTurn } from "@trybacked/service";
import { AGENT_PROMPT_MAX_HISTORY_TURNS, AGENT_PROMPT_MAX_TURN_CHARS } from "./agent/limits.js";

const FOLLOW_UP_RULES = [
  'Conversation so far (oldest first). The current question may be a follow-up: pronouns, ellipsis or a bare refinement ("and in Sicily?", "only above 1M", "group them by region") refer to the previous turns.',
  "For a follow-up, start from the most recent query below and change only what the question changes; constraints the user did not revisit stay in place, and a constraint restated differently replaces the earlier one.",
  "When the question stands on its own, ignore the history and plan it from scratch.",
].join(" ");

function clip(text: string): string {
  return text.length > AGENT_PROMPT_MAX_TURN_CHARS
    ? `${text.slice(0, AGENT_PROMPT_MAX_TURN_CHARS - 1)}…`
    : text;
}

function formatTurn(turn: ConversationTurn): string {
  const speaker = turn.role === "user" ? "User" : "Assistant";
  const query = turn.query === undefined ? "" : `\n  Query: ${JSON.stringify(turn.query)}`;
  return `- ${speaker}: ${clip(turn.text)}${query}`;
}

/** Interface language declared by the client; absent when the client did not say. */
export function buildLocaleSection(locale: string | undefined): string[] {
  return locale === undefined
    ? []
    : [
        `The user's interface language is "${locale}": write every user-facing text in it unless the question is unmistakably written in another language.`,
      ];
}

/** Keeps the latest turns only; the planner needs the recent thread, not the whole chat. */
export function recentTurns(history: readonly ConversationTurn[]): ConversationTurn[] {
  return history.slice(-AGENT_PROMPT_MAX_HISTORY_TURNS);
}

/** Prompt section describing the thread, or nothing when the chat has just started. */
export function buildConversationSection(
  history: readonly ConversationTurn[] | undefined,
): string[] {
  if (history === undefined || history.length === 0) return [];
  return [[FOLLOW_UP_RULES, ...recentTurns(history).map(formatTurn)].join("\n")];
}
