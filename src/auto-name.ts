import { createHash } from "node:crypto";
import { thresholdForAccount, type Settings } from "./config.js";
import { DiscordRest, type DiscordThread } from "./discord.js";
import type { ConversationMessage } from "./session-history.js";
import { prepareTitleInput } from "./title-input.js";

const RENAME_WINDOW_MS = 10 * 60_000;
const MAX_TRACKED_THREADS = 10_000;
const MAX_SEEN_IDS = 1_000;

type KeyedStore<T> = {
  lookup(key: string): Promise<T | undefined>;
  registerIfAbsent(key: string, value: T, opts?: { ttlMs?: number }): Promise<boolean>;
  update?: (
    key: string,
    updateValue: (current: T | undefined) => T | undefined,
    opts?: { ttlMs?: number },
  ) => Promise<boolean>;
};

type ThreadState = {
  thread: DiscordThread;
  originalName: string;
  policyVersion: string;
  tokenHash: string;
  count: number;
  seen: Set<string>;
  transcript: string[];
  done: boolean;
};

type NameThreadResult = "complete" | "rate-limited" | "skipped";

export type InboundMessage = {
  accountId: string;
  threadId: string;
  sessionKey?: string;
  messageId?: string;
  content: string;
  hasMedia?: boolean;
};

export type SentMessage = {
  accountId: string;
  threadId: string;
  messageId?: string;
  content: string;
  success: boolean;
};

export type AutoNamerDependencies = {
  settings: Settings;
  claims: KeyedStore<{ claimedAt: number }>;
  rates: KeyedStore<number[]>;
  tokenForAccount: (accountId: string) => string | null;
  policyVersion: () => string;
  complete: (transcript: string, accountId: string) => Promise<string | null>;
  summarize?: (chunk: string, accountId: string) => Promise<string | null>;
  readHistory?: (sessionKey: string) => Promise<ConversationMessage[]>;
  rest?: (token: string) => Pick<DiscordRest, "getThread" | "canManageThreads" | "renameThread">;
  now?: () => number;
};

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function truncateUtf16(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  const sliced = value.slice(0, maxLength);
  return /[\uD800-\uDBFF]$/.test(sliced) ? sliced.slice(0, -1) : sliced;
}

export function sanitizeTitle(raw: string): string | null {
  const normalized = raw
    .replace(/<@!?\d+>|<@&\d+>|<#\d+>|<a?:[^:>]+:\d+>/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/@(?:everyone|here)\b/gi, " ")
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/[*_~`>#|[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return truncateUtf16(normalized, 100).trim() || null;
}

function transcriptLine(role: "User" | "Agent", content: string): string {
  const text = content.replace(/\s+/g, " ").trim() || "[attachment]";
  return `${role}: ${text}`;
}

export class DiscordThreadAutoNamer {
  private readonly threads = new Map<string, ThreadState>();
  private readonly loading = new Map<string, Promise<ThreadState | null>>();
  private readonly ignored = new Map<string, number>();

  constructor(private readonly deps: AutoNamerDependencies) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  private key(accountId: string, threadId: string): string {
    return `${accountId}:${threadId}`;
  }

  private rest(token: string) {
    return this.deps.rest?.(token) ?? new DiscordRest(token);
  }

  private prune(): void {
    const now = this.now();
    for (const [key, expiresAt] of this.ignored) {
      if (expiresAt <= now) {
        this.ignored.delete(key);
      }
    }
    while (this.threads.size > MAX_TRACKED_THREADS) {
      this.threads.delete(this.threads.keys().next().value!);
    }
    while (this.ignored.size > MAX_TRACKED_THREADS) {
      this.ignored.delete(this.ignored.keys().next().value!);
    }
  }

  private async load(
    accountId: string,
    threadId: string,
    sessionKey?: string,
  ): Promise<ThreadState | null> {
    const key = this.key(accountId, threadId);
    this.prune();
    const existing = this.threads.get(key);
    if (existing) {
      return existing;
    }
    if (this.ignored.has(key)) {
      return null;
    }
    const pending = this.loading.get(key);
    if (pending) {
      return await pending;
    }
    const load = this.loadFresh(accountId, threadId, sessionKey);
    this.loading.set(key, load);
    try {
      return await load;
    } finally {
      this.loading.delete(key);
    }
  }

  private async loadFresh(
    accountId: string,
    threadId: string,
    sessionKey?: string,
  ): Promise<ThreadState | null> {
    const key = this.key(accountId, threadId);
    try {
      if (await this.deps.claims.lookup(key)) {
        return null;
      }
      const token = this.deps.tokenForAccount(accountId);
      if (!token) {
        return null;
      }
      const policyVersion = this.deps.policyVersion();
      const thread = await this.rest(token).getThread(threadId);
      if (!thread || this.now() < thread.createdAtMs) {
        this.ignored.set(key, this.now() + 10 * 60_000);
        return null;
      }
      if (this.deps.policyVersion() !== policyVersion) {
        return null;
      }
      const history =
        sessionKey && this.deps.readHistory ? await this.deps.readHistory(sessionKey) : [];
      const state: ThreadState = {
        thread,
        originalName: thread.name,
        policyVersion,
        tokenHash: digest(token),
        count: history.length,
        seen: new Set(),
        transcript: history.map((message) => transcriptLine(message.role, message.content)),
        done: false,
      };
      this.threads.set(key, state);
      this.prune();
      return state;
    } catch {
      // A transient API or state-store failure must not interrupt message delivery.
      return null;
    }
  }

  async onInbound(message: InboundMessage): Promise<void> {
    if (
      thresholdForAccount(this.deps.settings, message.accountId) <= 0 ||
      (!message.content.trim() && !message.hasMedia)
    ) {
      return;
    }
    const state = await this.load(message.accountId, message.threadId, message.sessionKey);
    if (state) {
      await this.record(message, state, "User");
    }
  }

  async onSent(message: SentMessage): Promise<void> {
    if (!message.success || !message.content.trim()) {
      return;
    }
    const key = this.key(message.accountId, message.threadId);
    const state = this.threads.get(key) ?? (await this.loading.get(key));
    if (state) {
      await this.record(message, state, "Agent");
    }
  }

  private async record(
    message: InboundMessage | SentMessage,
    state: ThreadState,
    role: "User" | "Agent",
  ): Promise<void> {
    const key = this.key(message.accountId, message.threadId);
    if (
      state.done ||
      this.threads.get(key) !== state ||
      this.deps.policyVersion() !== state.policyVersion
    ) {
      this.threads.delete(key);
      return;
    }
    if (message.messageId && state.seen.has(message.messageId)) {
      return;
    }
    if (message.messageId) {
      state.seen.add(message.messageId);
      if (state.seen.size > MAX_SEEN_IDS) {
        state.seen.delete(state.seen.values().next().value!);
      }
    }
    state.count += 1;
    state.transcript.push(transcriptLine(role, message.content));
    if (state.count < thresholdForAccount(this.deps.settings, message.accountId)) {
      return;
    }
    state.done = true;
    let claimed = false;
    try {
      if (!(await this.hasRateCapacity(message.accountId, state.thread.parentId))) {
        state.done = false;
        return;
      }
      if (!(await this.deps.claims.registerIfAbsent(key, { claimedAt: this.now() }))) {
        return;
      }
      claimed = true;
      if ((await this.nameThread(message.accountId, state)) === "rate-limited") {
        if (this.deps.claims.update) {
          await this.deps.claims.update(key, () => undefined);
          claimed = false;
          state.done = false;
        }
      }
    } catch {
      // Fail closed if the bounded claim store is unavailable or full.
    } finally {
      if (claimed || state.done) {
        this.threads.delete(key);
      }
    }
  }

  private async reserveRateSlot(accountId: string, parentId: string): Promise<boolean> {
    const now = this.now();
    let allowed = false;
    const stored = await this.deps.rates.update?.(
      this.key(accountId, parentId),
      (current) => {
        const recent = (current ?? []).filter((at) => now - at < RENAME_WINDOW_MS);
        if (recent.length >= 2) {
          return current;
        }
        allowed = true;
        return [...recent, now];
      },
      { ttlMs: RENAME_WINDOW_MS },
    );
    return stored === true && allowed;
  }

  private async hasRateCapacity(accountId: string, parentId: string): Promise<boolean> {
    const recent = await this.deps.rates.lookup(this.key(accountId, parentId));
    return (recent ?? []).filter((at) => this.now() - at < RENAME_WINDOW_MS).length < 2;
  }

  private async nameThread(accountId: string, state: ThreadState): Promise<NameThreadResult> {
    const token = this.deps.tokenForAccount(accountId);
    if (!token || digest(token) !== state.tokenHash || !this.stillAuthorized(state)) {
      return "skipped";
    }
    const rest = this.rest(token);
    if (!(await rest.canManageThreads(state.thread))) {
      return "skipped";
    }
    if (!(await this.hasRateCapacity(accountId, state.thread.parentId))) {
      return "rate-limited";
    }
    const summarize = this.deps.summarize;
    const titleInput = await prepareTitleInput(
      state.transcript,
      summarize ? (chunk) => summarize(chunk, accountId) : undefined,
    );
    if (!titleInput) {
      return "skipped";
    }
    const generated = await this.deps.complete(titleInput, accountId);
    const title = generated && sanitizeTitle(generated);
    if (!title || title === state.originalName || !this.stillAuthorized(state)) {
      return "skipped";
    }
    if (!(await rest.canManageThreads(state.thread))) {
      return "skipped";
    }
    const current = await rest.getThread(state.thread.id);
    if (
      !current ||
      current.name !== state.originalName ||
      current.parentId !== state.thread.parentId ||
      current.guildId !== state.thread.guildId ||
      !this.stillAuthorized(state)
    ) {
      return "skipped";
    }
    if (!(await this.reserveRateSlot(accountId, state.thread.parentId))) {
      return "rate-limited";
    }
    await rest.renameThread(state.thread.id, title);
    return "complete";
  }

  private stillAuthorized(state: ThreadState): boolean {
    return this.deps.policyVersion() === state.policyVersion;
  }
}
