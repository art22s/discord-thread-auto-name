# Configuration

[Documentation](README.md) · [Plugin overview](../README.md)

## Enable thread naming

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

## Naming threshold

`autoName` controls the number of user and assistant messages in a thread session required to generate a title:

| Value            | Behavior                       |
| ---------------- | ------------------------------ |
| `false` or `0`   | Disabled (default)             |
| `true`           | Use the default threshold of 5 |
| Positive integer | Use that message threshold     |

An account-specific `accounts.<id>.autoName` overrides the common setting. The plugin reads a thread’s existing session history when the next accepted message arrives, then counts successfully delivered agent replies while it is running. It ignores failed deliveries and duplicate message IDs.

## Choose the naming model

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

## Bot token access

The plugin can reuse the same bot token as the official Discord account. If the token is configured through a SecretRef, provide it to this plugin with an environment variable:

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
