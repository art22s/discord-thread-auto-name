import { describe, expect, it, vi } from "vitest";
import { MAX_SESSION_TEXT_CHARS } from "./session-history.js";
import { prepareTitleInput } from "./title-input.js";

describe("title input", () => {
  it("passes a short transcript through without summarizing", async () => {
    const summarize = vi.fn(async () => "unused");
    await expect(prepareTitleInput(["User: hello", "Agent: hi"], summarize)).resolves.toBe(
      "User: hello\nAgent: hi",
    );
    expect(summarize).not.toHaveBeenCalled();
  });

  it("summarizes every chunk of a long conversation", async () => {
    const summarize = vi.fn(async (chunk: string) => `Summary ${chunk[0]} ${chunk.at(-1)}`);
    const titleInput = await prepareTitleInput(["A".repeat(12_000), "B".repeat(12_000)], summarize);
    expect(summarize).toHaveBeenCalledTimes(3);
    expect(titleInput).toContain("Summary A A");
    expect(titleInput).toContain("Summary B B");
  });

  it("does not silently truncate an oversized conversation", async () => {
    await expect(prepareTitleInput(["x".repeat(MAX_SESSION_TEXT_CHARS + 1)])).resolves.toBeNull();
  });
});
