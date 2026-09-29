const DISCORD_API = "https://discord.com/api/v10";
const MANAGE_THREADS = 1n << 34n;
const ADMINISTRATOR = 1n << 3n;
const DISCORD_EPOCH_MS = 1_420_070_400_000n;
const THREAD_TYPES = new Set([10, 11, 12]);

type DiscordChannel = {
  id: string;
  type: number;
  name?: string;
  guild_id?: string;
  parent_id?: string | null;
  permission_overwrites?: Array<{ id: string; allow?: string; deny?: string }>;
};

type DiscordGuild = {
  id: string;
  owner_id: string;
  roles: Array<{ id: string; permissions: string }>;
};

type DiscordMember = { roles: string[] };
type DiscordUser = { id: string };

export type DiscordThread = {
  id: string;
  guildId: string;
  parentId: string;
  name: string;
  createdAtMs: number;
};

export function snowflakeCreatedAtMs(id: string): number | null {
  if (!/^\d{17,20}$/.test(id)) {
    return null;
  }
  try {
    const timestamp = Number((BigInt(id) >> 22n) + DISCORD_EPOCH_MS);
    return Number.isSafeInteger(timestamp) ? timestamp : null;
  } catch {
    return null;
  }
}

function bits(value: string | undefined): bigint {
  return /^\d+$/.test(value ?? "") ? BigInt(value!) : 0n;
}

export function canManageThreadsFromPermissions(params: {
  guild: DiscordGuild;
  member: DiscordMember;
  parent: DiscordChannel;
  botUserId: string;
}): boolean {
  const { guild, member, parent, botUserId } = params;
  if (guild.id !== parent.guild_id) {
    return false;
  }
  if (guild.owner_id === botUserId) {
    return true;
  }
  const roles = new Map(guild.roles.map((role) => [role.id, role.permissions]));
  let permissions = bits(roles.get(guild.id));
  for (const roleId of member.roles) {
    permissions |= bits(roles.get(roleId));
  }
  if ((permissions & ADMINISTRATOR) !== 0n) {
    return true;
  }

  const overwrites = parent.permission_overwrites ?? [];
  const everyone = overwrites.find((entry) => entry.id === guild.id);
  if (everyone) {
    permissions = (permissions & ~bits(everyone.deny)) | bits(everyone.allow);
  }
  let roleDeny = 0n;
  let roleAllow = 0n;
  for (const overwrite of overwrites) {
    if (member.roles.includes(overwrite.id)) {
      roleDeny |= bits(overwrite.deny);
      roleAllow |= bits(overwrite.allow);
    }
  }
  permissions = (permissions & ~roleDeny) | roleAllow;
  const memberOverwrite = overwrites.find((entry) => entry.id === botUserId);
  if (memberOverwrite) {
    permissions = (permissions & ~bits(memberOverwrite.deny)) | bits(memberOverwrite.allow);
  }
  return (permissions & MANAGE_THREADS) !== 0n;
}

export class DiscordRest {
  private botUserId?: string;

  constructor(
    private readonly token: string,
    private readonly request: typeof fetch = fetch,
  ) {}

  private async call<T>(
    path: string,
    method: "GET" | "PATCH" = "GET",
    body?: unknown,
  ): Promise<T | null> {
    const response = await this.request(`${DISCORD_API}${path}`, {
      method,
      headers: {
        Authorization: `Bot ${this.token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  }

  async getThread(id: string): Promise<DiscordThread | null> {
    const channel = await this.call<DiscordChannel>(`/channels/${id}`);
    const createdAtMs = snowflakeCreatedAtMs(id);
    if (
      !channel ||
      channel.id !== id ||
      !THREAD_TYPES.has(channel.type) ||
      !channel.guild_id ||
      !channel.parent_id ||
      !channel.name ||
      createdAtMs === null
    ) {
      return null;
    }
    return {
      id,
      guildId: channel.guild_id,
      parentId: channel.parent_id,
      name: channel.name,
      createdAtMs,
    };
  }

  async canManageThreads(thread: DiscordThread): Promise<boolean> {
    const [parent, guild, bot] = await Promise.all([
      this.call<DiscordChannel>(`/channels/${thread.parentId}`),
      this.call<DiscordGuild>(`/guilds/${thread.guildId}`),
      this.botUserId
        ? Promise.resolve({ id: this.botUserId })
        : this.call<DiscordUser>("/users/@me"),
    ]);
    if (!parent || !guild || !bot || parent.id !== thread.parentId) {
      return false;
    }
    this.botUserId = bot.id;
    const member = await this.call<DiscordMember>(`/guilds/${thread.guildId}/members/${bot.id}`);
    return member
      ? canManageThreadsFromPermissions({ guild, member, parent, botUserId: bot.id })
      : false;
  }

  async renameThread(id: string, name: string): Promise<boolean> {
    return Boolean(await this.call<DiscordChannel>(`/channels/${id}`, "PATCH", { name }));
  }
}
