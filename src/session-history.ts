import { readSessionTranscriptVisibleMessageDelta } from "openclaw/plugin-sdk/session-transcript-runtime";

export const MAX_SESSION_TEXT_CHARS = 160_000;
const MAX_PAGE_BYTES = 8 * 1024 * 1024;
const MAX_PAGES = 1_000;

export type ConversationMessage = { role: "User" | "Agent"; content: string };

export class SessionHistoryUnavailableError extends Error {}

function messageText(content: unknown): string {
  if (typeof content === "string") {
    return content.replace(/\s+/g, " ").trim();
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .filter(
      (block): block is { type: "text"; text: string } =>
        block?.type === "text" && typeof block.text === "string",
    )
    .map((block) => block.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function readSessionConversation(
  sessionKey: string,
  sessionId: string,
  readPage: typeof readSessionTranscriptVisibleMessageDelta = readSessionTranscriptVisibleMessageDelta,
): Promise<ConversationMessage[]> {
  let cursor: string | undefined;
  let resets = 0;
  let textChars = 0;
  let messages: ConversationMessage[] = [];
  for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber += 1) {
    const page = await readPage({
      sessionKey,
      sessionId,
      ...(cursor ? { cursor } : {}),
      maxMessages: 100,
      maxBytes: MAX_PAGE_BYTES,
    });
    if (page.kind === "missing") {
      if (cursor) {
        throw new SessionHistoryUnavailableError("Session transcript disappeared during the read");
      }
      return [];
    }
    if (page.kind === "reset") {
      if (++resets > 2) {
        throw new SessionHistoryUnavailableError("Session transcript changed during the read");
      }
      cursor = undefined;
      textChars = 0;
      messages = [];
      continue;
    }
    if (page.kind !== "page" || (page.hasMore && page.entries.length === 0)) {
      throw new SessionHistoryUnavailableError("Session transcript page is unavailable");
    }
    for (const entry of page.entries) {
      if (entry.role !== "user" && entry.role !== "assistant") {
        continue;
      }
      const content = messageText(entry.message.content);
      if (!content) {
        continue;
      }
      textChars += content.length;
      if (textChars > MAX_SESSION_TEXT_CHARS) {
        throw new SessionHistoryUnavailableError("Session conversation exceeds the title budget");
      }
      messages.push({ role: entry.role === "user" ? "User" : "Agent", content });
    }
    if (!page.hasMore) {
      return messages;
    }
    if (page.cursor === cursor) {
      throw new SessionHistoryUnavailableError("Session transcript cursor did not advance");
    }
    cursor = page.cursor;
  }
  throw new SessionHistoryUnavailableError("Session transcript has too many pages");
}
