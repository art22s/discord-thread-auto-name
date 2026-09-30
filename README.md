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

## Quick start

Requires OpenClaw 2026.9.6 or newer, the official Discord channel plugin, a configured model that supports isolated completions, and the bot’s **Manage Threads** permission in the parent channel.

Add this entry to `openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "discord-thread-auto-name": {
        "enabled": true,
        "config": { "autoName": 5 }
      }
    }
  }
}
```

Reload the plugin to apply the configuration:

```sh
openclaw plugins reload discord-thread-auto-name
```

Auto-naming is disabled by default. `true` uses five messages; a positive integer sets the threshold. Existing threads are considered on their next accepted message using their OpenClaw session history.

## Documentation

- [Configuration](docs/configuration.md): thresholds, naming models, account overrides, and bot tokens.
- [How it works](docs/how-it-works.md): triggers, conversation history, permissions, rate limits, and state.
- [Troubleshooting](docs/troubleshooting.md): reasons a title may be skipped and checks to make.
- [Development](docs/development.md): project layout, local checks, and release packaging.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, test conventions, and pull request guidance. This project is a companion to OpenClaw’s official Discord plugin.

Licensed under the [MIT license](LICENSE).
