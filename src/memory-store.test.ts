import { afterEach, expect, it, vi } from "vitest";
import { createMemoryKeyedStore } from "./memory-store.js";

afterEach(() => vi.useRealTimers());

it("claims a key once until its TTL expires", async () => {
  vi.useFakeTimers();
  const store = createMemoryKeyedStore<number>({ maxEntries: 1, defaultTtlMs: 1_000 });
  expect(await store.registerIfAbsent("thread", 1)).toBe(true);
  expect(await store.registerIfAbsent("thread", 2)).toBe(false);
  expect(await store.lookup("thread")).toBe(1);
  vi.advanceTimersByTime(1_000);
  expect(await store.lookup("thread")).toBeUndefined();
  expect(await store.registerIfAbsent("thread", 2)).toBe(true);
});

it("rejects new keys at capacity and updates existing keys", async () => {
  const store = createMemoryKeyedStore<number[]>({ maxEntries: 1, defaultTtlMs: 1_000 });
  expect(await store.registerIfAbsent("parent-a", [1])).toBe(true);
  expect(await store.update("parent-a", (current) => [...(current ?? []), 2])).toBe(true);
  expect(await store.lookup("parent-a")).toEqual([1, 2]);
  expect(await store.update("parent-b", () => [3])).toBe(false);
  expect(await store.lookup("parent-b")).toBeUndefined();
});
