import { describe, expect, it, vi } from "vitest";
import {
  DiscordThreadAutoNamer,
  sanitizeTitle,
  type AutoNamerDependencies,
} from "../src/auto-name.js";
import { parseSettings } from "../src/config.js";
import type { DiscordThread } from "../src/discord.js";

const EPOCH = 1_420_070_400_000;
const MINUTE = 60_000;

function snowflake(createdAt: number, sequence: number): string {
  return ((BigInt(createdAt - EPOCH) << 22n) | BigInt(sequence)).toString();
}

class MemoryStore<T> {
  private readonly values = new Map<string, { value: T; expiresAt: number }>();

  constructor(private readonly now: () => number) {}

  async lookup(key: string): Promise<T | undefined> {
    const entry = this.values.get(key);
    if (entry && entry.expiresAt > this.now()) {
      return entry.value;
    }
    this.values.delete(key);
    return undefined;
  }

  async registerIfAbsent(key: string, value: T, options?: { ttlMs?: number }): Promise<boolean> {
    if ((await this.lookup(key)) !== undefined) {
      return false;
    }
    this.values.set(key, { value, expiresAt: this.now() + (options?.ttlMs ?? Infinity) });
    return true;
  }

  async update(
    key: string,
    updateValue: (current: T | undefined) => T | undefined,
    options?: { ttlMs?: number },
  ): Promise<boolean> {
    const next = updateValue(await this.lookup(key));
    if (next === undefined) {
      this.values.delete(key);
      return false;
    }
    this.values.set(key, { value: next, expiresAt: this.now() + (options?.ttlMs ?? Infinity) });
    return true;
  }
}

function harness(threshold = 2) {
  let now = Date.UTC(2026, 8, 29, 2);
  let policy = "allowed";
  let allowed = true;
  const parentId = snowflake(now - 5 * MINUTE, 1);
  const originalName = "Original thread";
  const claims = new MemoryStore<{ claimedAt: number }>(() => now);
  const rates = new MemoryStore<number[]>(() => now);
  const getThread = vi.fn(async (id: string): Promise<DiscordThread> => ({
    id,
    guildId: "guild",
    parentId,
    name: originalName,
    createdAtMs: Number((BigInt(id) >> 22n) + BigInt(EPOCH)),
  }));
  const canManageThreads = vi.fn(async () => allowed);
  const renameThread = vi.fn(async () => true);
  const complete = vi.fn(async () => "Generated title");
  const deps: AutoNamerDependencies = {
    settings: parseSettings({ autoName: threshold }),
    claims,
    rates,
    tokenForAccount: () => "bot-token",
    policyVersion: () => policy,
    complete,
    rest: () => ({ getThread, canManageThreads, renameThread }),
    now: () => now,
  };
  return {
    deps,
    getThread,
    canManageThreads,
    renameThread,
    complete,
    threadId: (sequence: number) => snowflake(now - MINUTE, sequence),
    advance: (ms: number) => {
      now += ms;
    },
    setAllowed: (value: boolean) => {
      allowed = value;
    },
    setPolicy: (value: string) => {
      policy = value;
    },
  };
}

describe("Discord thread auto-naming", () => {
  it("sanitizes control characters, mentions, and markdown within 100 UTF-16 units", () => {
    expect(sanitizeTitle("**Plan**\nfor <@123> `release`\u0000")).toBe("Plan for release");
    expect(sanitizeTitle("[Release plan](https://example.com) @everyone")).toBe("Release plan");
    expect(sanitizeTitle("a".repeat(101))).toHaveLength(100);
    expect(sanitizeTitle("a".repeat(99) + "😀")).toBe("a".repeat(99));
    expect(sanitizeTitle("\n`_#~\u0000")).toBeNull();
  });

  it("uses accepted user and sent agent messages, then claims the thread once across restarts", async () => {
    const h = harness();
    const id = h.threadId(1);
    const namer = new DiscordThreadAutoNamer(h.deps);
    await namer.onInbound({
      accountId: "default",
      threadId: id,
      messageId: "1",
      content: "Discuss rollout",
    });
    await namer.onSent({
      accountId: "default",
      threadId: id,
      messageId: "2",
      content: "Let's plan it",
      success: true,
    });
    expect(h.complete).toHaveBeenCalledWith(
      "User: Discuss rollout\nAgent: Let's plan it",
      "default",
    );
    expect(h.renameThread).toHaveBeenCalledExactlyOnceWith(id, "Generated title");

    const restarted = new DiscordThreadAutoNamer(h.deps);
    await restarted.onInbound({
      accountId: "default",
      threadId: id,
      messageId: "3",
      content: "More",
    });
    await restarted.onInbound({
      accountId: "default",
      threadId: id,
      messageId: "4",
      content: "Details",
    });
    expect(h.renameThread).toHaveBeenCalledTimes(1);
  });

  it("does not count duplicate messages or failed outbound deliveries", async () => {
    const h = harness();
    const id = h.threadId(2);
    const namer = new DiscordThreadAutoNamer(h.deps);
    await namer.onInbound({ accountId: "default", threadId: id, messageId: "1", content: "Start" });
    await namer.onInbound({ accountId: "default", threadId: id, messageId: "1", content: "Start" });
    await namer.onSent({
      accountId: "default",
      threadId: id,
      messageId: "2",
      content: "Failed",
      success: false,
    });
    expect(h.complete).not.toHaveBeenCalled();
    await namer.onInbound({
      accountId: "default",
      threadId: id,
      messageId: "3",
      content: "Continue",
    });
    expect(h.renameThread).toHaveBeenCalledTimes(1);
  });

  it("skips before model generation when Manage Threads is missing", async () => {
    const h = harness(1);
    h.setAllowed(false);
    await new DiscordThreadAutoNamer(h.deps).onInbound({
      accountId: "default",
      threadId: h.threadId(3),
      content: "Private detail",
    });
    expect(h.complete).not.toHaveBeenCalled();
    expect(h.renameThread).not.toHaveBeenCalled();
  });

  it("drops a title if the Discord access policy changes during generation", async () => {
    const h = harness(1);
    h.complete.mockImplementationOnce(async () => {
      h.setPolicy("changed");
      return "Unsafe title";
    });
    await new DiscordThreadAutoNamer(h.deps).onInbound({
      accountId: "default",
      threadId: h.threadId(4),
      content: "Topic",
    });
    expect(h.renameThread).not.toHaveBeenCalled();
  });

  it("skips when permission is revoked during generation", async () => {
    const h = harness(1);
    h.complete.mockImplementationOnce(async () => {
      h.setAllowed(false);
      return "Unsafe title";
    });
    await new DiscordThreadAutoNamer(h.deps).onInbound({
      accountId: "default",
      threadId: h.threadId(5),
      content: "Topic",
    });
    expect(h.canManageThreads).toHaveBeenCalledTimes(2);
    expect(h.renameThread).not.toHaveBeenCalled();
  });

  it("allows only two rename attempts per parent in ten minutes", async () => {
    const h = harness(1);
    const namer = new DiscordThreadAutoNamer(h.deps);
    let rateLimitedThreadId = "";
    for (let sequence = 10; sequence < 13; sequence += 1) {
      const threadId = h.threadId(sequence);
      if (sequence === 12) {
        rateLimitedThreadId = threadId;
      }
      await namer.onInbound({
        accountId: "default",
        threadId,
        content: `Topic ${sequence}`,
      });
    }
    expect(h.renameThread).toHaveBeenCalledTimes(2);
    expect(h.complete).toHaveBeenCalledTimes(2);
    h.advance(10 * MINUTE + 1);
    await namer.onInbound({
      accountId: "default",
      threadId: rateLimitedThreadId,
      content: "Later topic",
    });
    expect(h.renameThread).toHaveBeenCalledTimes(3);
    expect(h.renameThread).toHaveBeenLastCalledWith(rateLimitedThreadId, "Generated title");
  });

  it("does not retry a Discord rate-limit rejection", async () => {
    const h = harness(1);
    h.renameThread.mockResolvedValueOnce(false);
    const id = h.threadId(20);
    const namer = new DiscordThreadAutoNamer(h.deps);
    await namer.onInbound({ accountId: "default", threadId: id, content: "Topic" });
    await namer.onInbound({ accountId: "default", threadId: id, content: "Another topic" });
    expect(h.renameThread).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the bounded claim store cannot admit a new thread", async () => {
    const h = harness(1);
    h.deps.claims.registerIfAbsent = vi.fn(async () => {
      throw new Error("store capacity reached");
    });
    await new DiscordThreadAutoNamer(h.deps).onInbound({
      accountId: "default",
      threadId: h.threadId(22),
      content: "Topic",
    });
    expect(h.complete).not.toHaveBeenCalled();
    expect(h.renameThread).not.toHaveBeenCalled();
  });

  it("does not rename a thread whose name changed during model generation", async () => {
    const h = harness(1);
    h.complete.mockImplementationOnce(async () => {
      h.getThread.mockImplementationOnce(async (id) => ({
        id,
        guildId: "guild",
        parentId: "parent",
        name: "Manual title",
        createdAtMs: Date.UTC(2026, 8, 29, 1, 59),
      }));
      return "Generated title";
    });
    await new DiscordThreadAutoNamer(h.deps).onInbound({
      accountId: "default",
      threadId: h.threadId(21),
      content: "Topic",
    });
    expect(h.renameThread).not.toHaveBeenCalled();
  });

  it("uses an older thread's session history on its next accepted message", async () => {
    const h = harness(5);
    const old = snowflake(Date.UTC(2026, 8, 27, 0), 1);
    h.deps.readHistory = vi.fn<NonNullable<AutoNamerDependencies["readHistory"]>>(async () => [
      { role: "User", content: "Witcher 3 graphics" },
      { role: "Agent", content: "Discussed RTX requirements" },
      { role: "User", content: "What about 4K?" },
      { role: "Agent", content: "Need more VRAM" },
    ]);
    await new DiscordThreadAutoNamer(h.deps).onInbound({
      accountId: "default",
      threadId: old,
      sessionKey: "agent:main:discord:thread:old",
      content: "What about DLSS?",
    });
    expect(h.deps.readHistory).toHaveBeenCalledWith("agent:main:discord:thread:old");
    expect(h.complete).toHaveBeenCalledWith(
      "User: Witcher 3 graphics\nAgent: Discussed RTX requirements\nUser: What about 4K?\nAgent: Need more VRAM\nUser: What about DLSS?",
      "default",
    );
    expect(h.renameThread).toHaveBeenCalledExactlyOnceWith(old, "Generated title");
  });
});
