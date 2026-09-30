# Troubleshooting

[Documentation](README.md) · [Configuration](configuration.md)

## A thread is not being renamed

Check these in order:

1. Confirm the plugin is installed and enabled with `openclaw plugins info discord-thread-auto-name`.
2. Check that `config.autoName` is `true` or a positive integer. It is disabled by default. An account override can disable naming for that account.
3. Confirm the thread has reached the threshold. Existing session history counts when the plugin first observes an accepted message in that thread. Inactive threads are not scanned.
4. Confirm the official Discord channel accepts the message under its access policy, and that it is in a Discord thread rather than a regular channel.
5. Check that the bot has **Manage Threads** in the parent channel and that the plugin can resolve the same bot’s token. See [bot token access](configuration.md#bot-token-access).
6. If another thread in the same parent has recently been renamed, check the rate limit. The plugin allows two renames per parent in ten minutes. A thread skipped because capacity is full can retry on its next accepted message.
7. Check the one-time attempt and history limits described in [How it works](how-it-works.md). A thread that has already been claimed, an unavailable transcript, or a history over the budget can be skipped.

Permission failures and rename API failures are handled without interrupting Discord message delivery. The plugin avoids logging conversation content, so not every skipped thread has a detailed log entry.

## A naming model override does not work

Set `llm.allowModelOverride: true` on the plugin entry alongside `config.model`; `llm` is outside `config`. Use a model reference or alias configured in your OpenClaw installation.

If `llm.allowedModels` is configured, include the resolved `provider/model` reference for every shared or account-specific naming model. Provider credentials and OpenClaw model policies also apply to the isolated naming calls.

See the complete [naming model example](configuration.md#choose-the-naming-model).

## A thread is named again after a restart

Community installs can fall back to process memory when the persistent state store is unavailable. Claims and parent-channel rate counters reset on plugin reload or Gateway restart. The plugin logs a warning when it falls back to memory. See [state handling](how-it-works.md#rename-checks-and-state).

## A title reflects an earlier discussion

Titles are generated from the history available when the naming threshold is reached. They are intended to describe the broad subject and are not continuously revised as the conversation evolves.

If the conversation later changes subject, you can edit the thread name in Discord. The plugin checks for a name change before applying a pending generated title.
