import type { LlmMessage } from "@trybacked/ports";

/** AI SDK + Gateway: system content must use `instructions`, not role: system in messages. */
export function gatewayPromptFromLlmMessages(messages: readonly LlmMessage[]): {
  instructions?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
} {
  const instructions = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n")
    .trim();
  const conversation: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const message of messages) {
    if (message.role === "user" || message.role === "assistant") {
      conversation.push({ role: message.role, content: message.content });
    }
  }
  return {
    ...(instructions.length > 0 ? { instructions } : {}),
    messages: conversation,
  };
}
