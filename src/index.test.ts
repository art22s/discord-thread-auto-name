import { afterEach, describe, expect, it, vi } from "vitest";
import plugin from "./index.js";

const EPOCH = 1_420_070_400_000;
const MANAGE_THREADS = (1n << 34n).toString();

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("plugin hook wiring", () => {
  it("does not register message observers while disabled", () => {
    const on = vi.fn();
    plugin.register({ pluginConfig: {}, on } as unknown as Parameters<typeof plugin.register>[0]);
    expect(on).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "uses accepted Discord hooks and an isolated model call with persistent state: %s",
    async (persistentState) => {
      const threadId = ((BigInt(Date.now() - 60_000 - EPOCH) << 22n) | 1n).toString();
      const parentId = "123456789012345679";
      const hookHandlers = new Map<string, (event: never, ctx: never) => Promise<void> | void>();
      const claims = new Map<string, unknown>();
      const rates = new Map<string, unknown>();
      const model = vi.fn(async () => ({ text: "**Planning release**" }));
      const request = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const path = new URL(String(url)).pathname;
        let body: unknown;
        if (path === `/api/v10/channels/${threadId}`) {
          body = { id: threadId, type: 11, guild_id: "guild", parent_id: parentId, name: "Old" };
        } else if (path === `/api/v10/channels/${parentId}`) {
          body = { id: parentId, type: 0, guild_id: "guild", permission_overwrites: [] };
        } else if (path === "/api/v10/guilds/guild") {
          body = {
            id: "guild",
            owner_id: "owner",
            roles: [{ id: "guild", permissions: MANAGE_THREADS }],
          };
        } else if (path === "/api/v10/users/@me") {
          body = { id: "bot" };
        } else if (path === "/api/v10/guilds/guild/members/bot") {
          body = { roles: [] };
        } else {
          throw new Error(`Unexpected request path: ${path}`);
        }
        if (init?.method === "PATCH") {
          expect(JSON.parse(String(init.body))).toEqual({ name: "Planning release" });
        }
        return new Response(JSON.stringify(body), { status: 200 });
      });
      vi.stubGlobal("fetch", request);
      const config = {
        channels: { discord: { token: "bot-token" } },
        plugins: { entries: { "discord-thread-auto-name": { config: { autoName: 1 } } } },
      };
      const openKeyedStore = vi.fn(({ namespace }: { namespace: string }) => {
        if (!persistentState) {
          throw new Error("persistent state denied");
        }
        const values = namespace.startsWith("thread-") ? claims : rates;
        return {
          lookup: async (key: string) => values.get(key),
          registerIfAbsent: async (key: string, value: unknown) => {
            if (values.has(key)) {
              return false;
            }
            values.set(key, value);
            return true;
          },
          update: async (key: string, update: (current: unknown) => unknown) => {
            values.set(key, update(values.get(key)));
            return true;
          },
        };
      });
      const warn = vi.fn();
      plugin.register({
        pluginConfig: { autoName: 1 },
        logger: { warn },
        runtime: {
          config: { current: () => config },
          state: { openKeyedStore },
          llm: { complete: model },
        },
        on: (name: string, handler: (event: never, ctx: never) => Promise<void> | void) => {
          hookHandlers.set(name, handler);
        },
      } as unknown as Parameters<typeof plugin.register>[0]);
      expect(openKeyedStore).not.toHaveBeenCalled();

      const received = hookHandlers.get("message_received");
      expect(received).toBeDefined();
      await received?.(
        { threadId, messageId: "message-1", content: "Plan the release" } as never,
        { channelId: "discord", accountId: "default" } as never,
      );
      expect(openKeyedStore).toHaveBeenCalledTimes(persistentState ? 2 : 1);
      expect(warn).toHaveBeenCalledTimes(persistentState ? 0 : 1);
      expect(model).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: "user", content: "User: Plan the release" }],
          execution: { mode: "isolated-agent-runtime", timeoutMs: 15_000 },
        }),
      );
      expect(request.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);

      await received?.(
        { threadId, messageId: "message-2", content: "More" } as never,
        { channelId: "discord", accountId: "default" } as never,
      );
      expect(request.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);
    },
  );
});
