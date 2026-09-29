import { createHash } from "node:crypto";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { resolveSecretInputString } from "openclaw/plugin-sdk/secret-input";
import { DiscordThreadAutoNamer } from "./auto-name.js";
import { parseSettings, thresholdForAccount, tokenEnvForAccount } from "./config.js";

const PLUGIN_ID = "discord-thread-auto-name";
const SNOWFLAKE = /^\d{17,20}$/;
const TITLE_PROMPT =
  "Write a concise Discord thread title of 3 to 6 words in sentence case. Summarize the topic, not the people. Return only the title, without quotes or markdown.";

function channelId(value: string | number | undefined): string | null {
  const id = String(value ?? "").replace(/^channel:/, "");
  return SNOWFLAKE.test(id) ? id : null;
}

export default definePluginEntry({
  id: PLUGIN_ID,
  name: "Discord Thread Auto Name",
  description: "Names authorized Discord threads after a message threshold.",
  register(api) {
    const settings = parseSettings(api.pluginConfig);
    if (
      thresholdForAccount(settings, "default") === 0 &&
      Object.keys(settings.accounts).every((id) => thresholdForAccount(settings, id) === 0)
    ) {
      return;
    }
    const policyVersion = () => {
      const cfg = api.runtime.config.current();
      const relevant = {
        discord: cfg.channels?.discord,
        plugin: cfg.plugins?.entries?.[PLUGIN_ID],
      };
      return createHash("sha256").update(JSON.stringify(relevant)).digest("hex");
    };
    const tokenForAccount = (accountId: string): string | null => {
      const cfg = api.runtime.config.current();
      const accountToken = cfg.channels?.discord?.accounts?.[accountId]?.token;
      const rootToken = cfg.channels?.discord?.token;
      const configuredToken = accountToken === undefined ? rootToken : accountToken;
      const resolution = resolveSecretInputString({
        value: configuredToken,
        defaults: cfg.secrets?.defaults,
        path:
          accountToken === undefined
            ? "channels.discord.token"
            : `channels.discord.accounts.${accountId}.token`,
        mode: "inspect",
      });
      if (resolution.status === "available") {
        return resolution.value.replace(/^Bot\s+/i, "").trim() || null;
      }
      const envName = tokenEnvForAccount(settings, accountId);
      return envName ? process.env[envName]?.replace(/^Bot\s+/i, "").trim() || null : null;
    };
    let namer: DiscordThreadAutoNamer | undefined;
    let stateUnavailable = false;
    const getNamer = (): DiscordThreadAutoNamer | null => {
      if (stateUnavailable) {
        return null;
      }
      try {
        namer ??= new DiscordThreadAutoNamer({
          settings,
          claims: api.runtime.state.openKeyedStore({
            namespace: "thread-claims-v1",
            maxEntries: 10_000,
            overflowPolicy: "reject-new",
            defaultTtlMs: 48 * 60 * 60_000,
          }),
          rates: api.runtime.state.openKeyedStore({
            namespace: "parent-rename-rates-v1",
            maxEntries: 10_000,
            overflowPolicy: "reject-new",
            defaultTtlMs: 10 * 60_000,
          }),
          tokenForAccount,
          policyVersion,
          complete: async (transcript) => {
            const result = await api.runtime.llm.complete({
              messages: [{ role: "user", content: transcript }],
              systemPrompt: TITLE_PROMPT,
              purpose: PLUGIN_ID,
              maxTokens: 64,
              temperature: 0.2,
              execution: { mode: "isolated-agent-runtime", timeoutMs: 15_000 },
            });
            return result.text;
          },
        });
        return namer;
      } catch {
        stateUnavailable = true;
        return null;
      }
    };

    api.on("message_received", (event, ctx) => {
      if (ctx.channelId !== "discord") {
        return;
      }
      const threadId = channelId(event.threadId);
      if (!threadId) {
        return;
      }
      return getNamer()?.onInbound({
        accountId: ctx.accountId ?? "default",
        threadId,
        messageId: event.messageId,
        content: event.content,
        hasMedia: Boolean(event.media?.length || event.originalMedia?.length),
      });
    });

    api.on("message_sent", (event, ctx) => {
      if (ctx.channelId !== "discord") {
        return;
      }
      const threadId = channelId(ctx.conversationId ?? event.to);
      if (!threadId) {
        return;
      }
      return getNamer()?.onSent({
        accountId: ctx.accountId ?? "default",
        threadId,
        messageId: event.messageId,
        content: event.content,
        success: event.success,
      });
    });
  },
});
