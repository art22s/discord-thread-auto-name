# Discord Thread Auto Name

An independent OpenClaw companion plugin for the official Discord channel. It gives a new Discord thread one concise AI title after a configurable number of **OpenClaw-accepted user messages and successfully delivered agent messages**.

The plugin uses OpenClaw's public message hooks. It does not subscribe to raw Discord gateway events. Only messages admitted by the official Discord channel's access policy enter the title transcript. The title call uses a fresh, tool-free isolated agent runtime context.

## Requirements

- OpenClaw 2026.9.6 or newer, with the official Discord channel enabled.
- A configured model that supports `isolated-agent-runtime` completions.
- The Discord bot's **Manage Threads** permission in the thread's parent channel.
- The same bot token used by the official Discord account. A literal `channels.discord.token` or `channels.discord.accounts.<id>.token` is reused when available. If the official account uses a SecretRef, expose that same token through an environment variable for this plugin.

## Install

Once published to ClawHub:

```sh
openclaw plugins install clawhub:@art22s/discord-thread-auto-name
openclaw plugins enable discord-thread-auto-name
```

For local development, build and link the directory:

```sh
pnpm install
pnpm build
openclaw plugins install --link . --force
openclaw plugins enable discord-thread-auto-name
```

## Configure

Add this entry to your `openclaw.json` and restart the Gateway:

```json
{
  "plugins": {
    "entries": {
      "discord-thread-auto-name": {
        "enabled": true,
        "config": {
          "autoName": 5,
          "accounts": {
            "work": {
              "autoName": 8,
              "tokenEnv": "WORK_DISCORD_BOT_TOKEN"
            }
          }
        }
      }
    }
  }
}
```

`autoName` is disabled by default. `false` or `0` disables it, `true` means 5 messages, and a positive integer sets the threshold. `accounts.<id>.autoName` overrides the common value. For the default Discord account, the plugin checks `DISCORD_BOT_TOKEN` when it cannot reuse a literal token from the Discord channel config. Other accounts can set `accounts.<id>.tokenEnv` to the name of an environment variable containing that account's bot token. The bot token must belong to the **same bot** that received the messages through OpenClaw. The plugin never writes tokens or message text to its logs or persistent state.

The first eligible accepted message discovers a thread. Only threads created within the past 24 hours qualify; the counter starts when the plugin first observes one. During Gateway downtime or before installation, messages are not backfilled. The plugin counts delivered agent replies only after an accepted inbound message in that thread. It ignores failed deliveries and duplicate message IDs. A title is generated from at most 20 recent message lines and 1,800 characters.

Once the threshold is reached, the plugin claims the thread in its SQLite-backed plugin state before starting the model call. Claims expire after 48 hours; a thread is already ineligible after 24 hours, so it cannot be renamed again after claim expiry. The plugin skips a thread if its name changes before the rename. It checks Manage Threads before the model call and again before the Discord API request. It also abandons the rename if the Discord configuration changes during generation.

The plugin reserves at most two rename attempts per parent channel in any ten-minute window, with the counters persisted across Gateway restarts. A Discord `403` or `429` ends that thread's single attempt without a retry. If the bounded state store is unavailable or full, naming is skipped while ordinary Discord message delivery continues.

## Development and proof

```sh
pnpm check
pnpm lint
pnpm test
pnpm build
```

The tests use mocked Discord REST and model responses. For a live smoke check, enable the plugin in a test guild, create a fresh thread in an allowed channel, send the configured number of accepted user and agent messages, and verify that Discord shows one new title. Repeat in a channel blocked by OpenClaw's Discord access policy and verify that no title call or rename occurs. Use a bot without Manage Threads to verify the permission skip.

Before publishing, run `clawhub package validate .` and `clawhub package publish . --family code-plugin --dry-run` against the built package. Publishing requires access to the `art22s` owner on ClawHub.
