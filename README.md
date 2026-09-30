# AI Discord Thread Titles for OpenClaw

When enabled, give Discord threads titles that reflect the conversation. **AI Discord Thread Titles** reads each thread’s OpenClaw session, then creates a short, clear title with an isolated AI call.

Install it alongside OpenClaw’s official Discord channel plugin. Choose how many messages should trigger a title, and the plugin takes care of the rest.

```sh
openclaw plugins install clawhub:@art22s/discord-thread-auto-name
openclaw plugins enable discord-thread-auto-name
```

## What it does

- **Broad titles that use the conversation.** Names the overarching subject using the opening topic and recurring themes. A follow-up about video editing in a discussion of AI playing Among Us and Minecraft stays under a title such as “AI models playing games.”
- **Works with older threads.** When an existing thread gets its next accepted message, its prior OpenClaw session history is included. No background scan is needed.
- **Configurable message threshold.** Set a threshold for each Discord account, or use the default of five messages.
- **Handles long discussions.** Summarizes large histories in bounded chunks before asking for the final title. Tool calls and tool results stay out of the title prompt.
- **Fits Discord.** Removes markdown and control-character noise and limits titles to Discord’s 100-character maximum.
- **Uses your Discord access rules.** Listens to OpenClaw’s accepted message hooks, so messages rejected by the official channel’s access policy do not enter the title flow.
- **Checks rename permission and pacing.** Requires Manage Threads and limits renames to two per parent channel in ten minutes. If the channel is at capacity, the thread can retry on its next accepted message.
- **Keeps the title call separate.** Uses a fresh isolated model context and does not log conversation text.
- **Choose a naming model.** Use a model reference or configured alias for titles and history summaries, with optional per-account overrides.

## Configure

Add the plugin entry to `openclaw.json`, then reload or restart the Gateway:

```json
{
  "plugins": {
    "entries": {
      "discord-thread-auto-name": {
        "enabled": true,
        "config": {
          "autoName": 5,
          "accounts": {
            "work": { "autoName": 8 }
          }
        }
      }
    }
  }
}
```

`autoName` controls the number of user and assistant messages in a thread session required to generate a title:

| Value            | Behavior                       |
| ---------------- | ------------------------------ |
| `false` or `0`   | Disabled (default)             |
| `true`           | Use the default threshold of 5 |
| Positive integer | Use that message threshold     |

An account-specific `accounts.<id>.autoName` overrides the common setting. The plugin reads a thread’s existing session history when the next accepted message arrives, then counts successfully delivered agent replies while it is running. It ignores failed deliveries and duplicate message IDs.

### Choose the naming model

Set `model` inside the plugin config to use a different model for both title generation and long-history summaries. OpenClaw also requires `llm.allowModelOverride: true` on the plugin entry to permit this override. Accepts an OpenClaw `provider/model` reference or configured model alias. If omitted, OpenClaw uses the agent’s configured model. `accounts.<id>.model` overrides the shared naming model for that Discord account:

```json
{
  "plugins": {
    "entries": {
      "discord-thread-auto-name": {
        "enabled": true,
        "llm": { "allowModelOverride": true },
        "config": {
          "autoName": 5,
          "model": "your-summary-model-alias",
          "accounts": {
            "work": { "model": "your-work-summary-model-alias" }
          }
        }
      }
    }
  }
}
```

Replace the example aliases with models configured in your OpenClaw installation. The selected model uses OpenClaw’s existing provider credentials and model policies. If you set `llm.allowedModels`, it must include every selected model’s full `provider/model` reference, even when `config.model` uses an alias. Naming still runs in a fresh isolated context; it does not change the model or context used for regular Discord replies.

## Requirements

- OpenClaw 2026.9.6 or newer.
- OpenClaw’s official Discord channel plugin enabled.
- A configured model that supports isolated runtime completions.
- The Discord bot has **Manage Threads** permission in the parent channel.
- The plugin can reuse the same bot token as the official Discord account. If the token is configured through a SecretRef, provide it to this plugin with an environment variable:

```json
{
  "plugins": {
    "entries": {
      "discord-thread-auto-name": {
        "config": { "tokenEnv": "DISCORD_BOT_TOKEN" }
      }
    }
  }
}
```

For another account, set `accounts.<id>.tokenEnv`. The token must belong to the same bot that receives the messages through OpenClaw. A literal `channels.discord.token` or `channels.discord.accounts.<id>.token` is reused automatically when available.

## Conversation handling

The final title call runs in a fresh isolated context. For long histories, the plugin first makes separate isolated calls to summarize successive chunks. It only sends user and assistant text; tool calls, tool results, and other session events are excluded. Conversation text is never written to plugin logs or claim state.

The plugin can process up to 160,000 characters of session conversation text. Larger histories are skipped instead of silently dropping earlier context. Discord messages that never made it into the OpenClaw session cannot be recovered. Inactive threads are not scanned; an older thread is considered only after its next accepted message.

Each thread gets at most one title attempt after the threshold is reached. The plugin checks Manage Threads before generation and again before renaming, and abandons a rename if the Discord configuration or thread name changes during generation. A Discord `403` or `429` ends that thread’s attempt without retrying.

Official trusted installs use OpenClaw’s persistent state store. ClawHub community installs use bounded process memory for claims and rate counters. Those records reset on plugin reload or Gateway restart, so a thread could be considered again after a restart. If the memory store fills, naming is skipped and regular Discord message delivery continues.

## Local development

```sh
pnpm install
pnpm check
pnpm lint
pnpm test
pnpm build
```

Tests use mocked Discord REST and model responses; they do not make network requests. For a live check, use a test guild, send a message in an older thread with an OpenClaw session, and verify that Discord receives one descriptive title.
