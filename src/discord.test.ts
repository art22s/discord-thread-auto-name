import { describe, expect, it, vi } from "vitest";
import { canManageThreadsFromPermissions, DiscordRest, snowflakeCreatedAtMs } from "./discord.js";

const MANAGE_THREADS = (1n << 34n).toString();
const GUILD = {
  id: "guild",
  owner_id: "owner",
  roles: [
    { id: "guild", permissions: "0" },
    { id: "moderator", permissions: MANAGE_THREADS },
  ],
};
const MEMBER = { roles: ["moderator"] };
const PARENT = {
  id: "parent",
  type: 0,
  guild_id: "guild",
  permission_overwrites: [] as Array<{ id: string; allow?: string; deny?: string }>,
};

describe("Discord REST permission checks", () => {
  it("uses guild roles and parent channel overwrites", () => {
    expect(
      canManageThreadsFromPermissions({
        guild: GUILD,
        member: MEMBER,
        parent: PARENT,
        botUserId: "bot",
      }),
    ).toBe(true);
    expect(
      canManageThreadsFromPermissions({
        guild: GUILD,
        member: MEMBER,
        parent: {
          ...PARENT,
          permission_overwrites: [{ id: "bot", deny: MANAGE_THREADS }],
        },
        botUserId: "bot",
      }),
    ).toBe(false);
  });

  it("skips when a REST permission call is denied and makes no PATCH", async () => {
    const request = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      if (path === "/api/v10/users/@me") {
        return new Response(null, { status: 403 });
      }
      const data = path === "/api/v10/channels/parent" ? PARENT : GUILD;
      return new Response(JSON.stringify(data), { status: 200 });
    });
    const rest = new DiscordRest("test-token", request as typeof fetch);
    expect(
      await rest.canManageThreads({
        id: "thread",
        guildId: "guild",
        parentId: "parent",
        name: "Original",
        createdAtMs: Date.now(),
      }),
    ).toBe(false);
    expect(request.mock.calls.every(([, init]) => !init || init.method !== "PATCH")).toBe(true);
  });

  it("treats a Discord 429 as one failed rename attempt", async () => {
    const request = vi.fn(async () => new Response(null, { status: 429 }));
    const rest = new DiscordRest("test-token", request as typeof fetch);
    expect(await rest.renameThread("123456789012345678", "Title")).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("validates Discord snowflakes", () => {
    expect(snowflakeCreatedAtMs("not-an-id")).toBeNull();
    expect(snowflakeCreatedAtMs("123")).toBeNull();
    expect(snowflakeCreatedAtMs("123456789012345678")).toBeTypeOf("number");
  });
});
