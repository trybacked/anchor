import type { ConversationTurn } from "@trybacked/service";
import { describe, expect, it } from "vitest";
import {
  AGENT_PROMPT_MAX_HISTORY_TURNS,
  AGENT_PROMPT_MAX_TURN_CHARS,
} from "../../src/agent/limits.js";
import { buildConversationSection, recentTurns } from "../../src/conversation.js";

function turns(count: number): ConversationTurn[] {
  return Array.from({ length: count }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    text: `turn ${String(index)}`,
  }));
}

describe("conversation section", () => {
  it("is absent for a fresh chat", () => {
    expect(buildConversationSection(undefined)).toEqual([]);
    expect(buildConversationSection([])).toEqual([]);
  });

  it("keeps only the most recent turns", () => {
    const kept = recentTurns(turns(AGENT_PROMPT_MAX_HISTORY_TURNS + 3));
    expect(kept).toHaveLength(AGENT_PROMPT_MAX_HISTORY_TURNS);
    expect(kept[0]?.text).toBe("turn 3");
  });

  it("clips long turns and labels speakers", () => {
    const [section] = buildConversationSection([
      { role: "user", text: "x".repeat(AGENT_PROMPT_MAX_TURN_CHARS + 50) },
      { role: "assistant", text: "ok" },
    ]);
    expect(section).toContain(`- User: ${"x".repeat(AGENT_PROMPT_MAX_TURN_CHARS - 1)}…`);
    expect(section).toContain("- Assistant: ok");
    expect(section).not.toContain("Query:");
  });
});
