import { afterEach, describe, expect, it, vi } from "vitest";
import plugin from "../src/index.js";
import { readSessionConversation } from "../src/session-history.js";

vi.mock("../src/session-history.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/session-history.js")>()),
  readSessionConversation: vi.fn(),
}));

const EPOCH = 1_420_070_400_000;
const MANAGE_THREADS = (1n << 34n).toString();

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("plugin hook wiring", () => {
  it("does not register message observers while disabled", () => {
    const on = vi.fn();
    plugin.register({ pluginConfig: {}, on } as unknown as Parameters<typeof plugin.register>[0]);
    expect(on).not.toHaveBeenCalled();
  });

  it.each([
    {
      persistentState: true,
      accountId: "default",
      sharedModel: undefined,
      accountModel: undefined,
      longHistory: false,
    },
    {
      persistentState: false,
      accountId: "default",
      sharedModel: "provider/shared",
      accountModel: undefined,
      longHistory: false,
    },
    {
      persistentState: true,
      accountId: "work",
      sharedModel: "provider/shared",
      accountModel: "provider/work",
      longHistory: true,
    },
    {
      persistentState: true,
      accountId: "other",
      sharedModel: "provider/shared",
      accountModel: undefined,
      longHistory: true,
    },
  ])(
    "uses isolated calls with the selected naming model: $accountId, $accountModel, $sharedModel",
    async ({ persistentState, accountId, sharedModel, accountModel, longHistory }) => {
      const threadId = ((BigInt(Date.now() - 60_000 - EPOCH) << 22n) | 1n).toString();
      const parentId = "123456789012345679";
      const hookHandlers = new Map<string, (event: never, ctx: never) => Promise<void> | void>();
      const claims = new Map<string, unknown>();
      const rates = new Map<string, unknown>();
      const model = vi.fn(async () => ({ text: "**Planning release**" }));
      const history = [
        { role: "User" as const, content: "How do AI models play games?" },
        {
          role: "Agent" as const,
          content: longHistory
            ? "Game simulation details. ".repeat(600)
            : "They use game simulations.",
        },
      ];
      vi.mocked(readSessionConversation).mockResolvedValue(history);
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
      const pluginConfig = {
        autoName: 1,
        ...(sharedModel ? { model: sharedModel } : {}),
        accounts: { work: accountModel ? { model: accountModel } : {} },
      };
      const config = {
        channels: { discord: { token: "bot-token" } },
        plugins: { entries: { "discord-thread-auto-name": { config: pluginConfig } } },
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
        pluginConfig,
        logger: { warn },
        runtime: {
          config: { current: () => config },
          state: { openKeyedStore },
          agent: { session: { getSessionEntry: () => ({ sessionId: "session-1" }) } },
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
        { threadId, messageId: "message-1", content: "Are the YouTube videos sped up?" } as never,
        { channelId: "discord", accountId, sessionKey: "agent:main:discord:channel:test" } as never,
      );
      expect(openKeyedStore).toHaveBeenCalledTimes(persistentState ? 2 : 1);
      expect(warn).toHaveBeenCalledTimes(persistentState ? 0 : 1);
      expect(readSessionConversation).toHaveBeenCalledWith(
        "agent:main:discord:channel:test",
        "session-1",
      );
      const selectedModel = accountModel ?? sharedModel;
      for (const [call] of model.mock.calls as unknown as [Record<string, unknown>][]) {
        expect(call.execution).toEqual({ mode: "isolated-agent-runtime", timeoutMs: 15_000 });
        if (selectedModel) {
          expect(call.model).toBe(selectedModel);
        } else {
          expect(call).not.toHaveProperty("model");
        }
      }
      if (longHistory) {
        expect(model.mock.calls.length).toBeGreaterThan(1);
      } else {
        expect(model).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({
            messages: [
              {
                role: "user",
                content:
                  "User: How do AI models play games?\nAgent: They use game simulations.\nUser: Are the YouTube videos sped up?",
              },
            ],
          }),
        );
      }
      expect(request.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);

      await received?.(
        { threadId, messageId: "message-2", content: "More" } as never,
        { channelId: "discord", accountId } as never,
      );
      expect(request.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);
    },
  );
});
