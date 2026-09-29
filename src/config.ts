export type AccountSettings = {
  autoName?: number | boolean;
  tokenEnv?: string;
};

export type Settings = AccountSettings & {
  accounts: Record<string, AccountSettings>;
};

const ENV_NAME = /^[A-Z][A-Z0-9_]{0,127}$/;
const DEFAULT_THRESHOLD = 5;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseAutoName(value: unknown): number | boolean | undefined {
  if (value === undefined || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  throw new Error("autoName must be a nonnegative integer or boolean");
}

function parseTokenEnv(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string" && ENV_NAME.test(value)) {
    return value;
  }
  throw new Error("tokenEnv must be an uppercase environment variable name");
}

function parseAccount(value: unknown): AccountSettings {
  const input = record(value);
  if (!input) {
    throw new Error("account settings must be an object");
  }
  return {
    autoName: parseAutoName(input.autoName),
    tokenEnv: parseTokenEnv(input.tokenEnv),
  };
}

export function parseSettings(value: unknown): Settings {
  const input = record(value) ?? {};
  const accounts: Record<string, AccountSettings> = {};
  const rawAccounts = input.accounts === undefined ? {} : record(input.accounts);
  if (!rawAccounts) {
    throw new Error("accounts must be an object");
  }
  for (const [id, account] of Object.entries(rawAccounts)) {
    accounts[id] = parseAccount(account);
  }
  return {
    autoName: parseAutoName(input.autoName),
    tokenEnv: parseTokenEnv(input.tokenEnv),
    accounts,
  };
}

export function thresholdForAccount(settings: Settings, accountId: string): number {
  const value = settings.accounts[accountId]?.autoName ?? settings.autoName ?? false;
  return value === true ? DEFAULT_THRESHOLD : value === false ? 0 : value;
}

export function tokenEnvForAccount(settings: Settings, accountId: string): string | undefined {
  return (
    settings.accounts[accountId]?.tokenEnv ??
    (accountId === "default" ? (settings.tokenEnv ?? "DISCORD_BOT_TOKEN") : undefined)
  );
}
