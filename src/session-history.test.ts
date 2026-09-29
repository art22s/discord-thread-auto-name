import { describe, expect, it, vi } from "vitest";
import {
  MAX_SESSION_TEXT_CHARS,
  readSessionConversation,
  SessionHistoryUnavailableError,
} from "./session-history.js";

type Reader = NonNullable<Parameters<typeof readSessionConversation>[2]>;
const entry = (role: string, content: unknown) => ({ role, message: { content } });

describe("session conversation reader", () => {
  it("reads all pages and keeps only user and assistant text", async () => {
    const read = vi
      .fn<Reader>()
      .mockResolvedValueOnce({
        kind: "page",
        cursor: "next",
        hasMore: true,
        entries: [
          entry("user", [{ type: "text", text: "First  topic" }]),
          entry("toolResult", "secret tool output"),
          entry("assistant", [{ type: "toolCall", text: "secret call" }]),
        ],
      })
      .mockResolvedValueOnce({
        kind: "page",
        cursor: "end",
        hasMore: false,
        entries: [entry("assistant", [{ type: "text", text: "Useful reply" }])],
      });
    await expect(readSessionConversation("key", "id", read)).resolves.toEqual([
      { role: "User", content: "First topic" },
      { role: "Agent", content: "Useful reply" },
    ]);
    expect(read).toHaveBeenNthCalledWith(2, {
      sessionKey: "key",
      sessionId: "id",
      cursor: "next",
      maxMessages: 100,
      maxBytes: 8 * 1024 * 1024,
    });
  });

  it("fails closed when the session text exceeds its budget", async () => {
    const read = vi.fn<Reader>().mockResolvedValue({
      kind: "page",
      cursor: "end",
      hasMore: false,
      entries: [entry("user", "x".repeat(MAX_SESSION_TEXT_CHARS + 1))],
    });
    await expect(readSessionConversation("key", "id", read)).rejects.toBeInstanceOf(
      SessionHistoryUnavailableError,
    );
  });
});
