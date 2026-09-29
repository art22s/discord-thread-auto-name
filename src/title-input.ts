import { MAX_SESSION_TEXT_CHARS } from "./session-history.js";

const MAX_PROMPT_CHARS = 12_000;
const MAX_SUMMARY_CHARS = 1_000;
const MAX_SUMMARY_PASSES = 4;

function splitText(text: string): string[] {
  const chunks: string[] = [];
  for (let offset = 0; offset < text.length;) {
    let end = Math.min(offset + MAX_PROMPT_CHARS, text.length);
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1] ?? "")) {
      end -= 1;
    }
    chunks.push(text.slice(offset, end));
    offset = end;
  }
  return chunks;
}

export async function prepareTitleInput(
  lines: string[],
  summarize?: (chunk: string) => Promise<string | null>,
): Promise<string | null> {
  let text = lines.join("\n");
  if (!text || text.length > MAX_SESSION_TEXT_CHARS) {
    return null;
  }
  for (let pass = 0; text.length > MAX_PROMPT_CHARS; pass += 1) {
    if (pass >= MAX_SUMMARY_PASSES || !summarize) {
      return null;
    }
    const summaries: string[] = [];
    for (const chunk of splitText(text)) {
      const summary = (await summarize(chunk))?.replace(/\s+/g, " ").trim();
      if (!summary) {
        return null;
      }
      summaries.push(summary.slice(0, MAX_SUMMARY_CHARS));
    }
    const next = summaries.join("\n");
    if (next.length >= text.length) {
      return null;
    }
    text = next;
  }
  return text;
}
