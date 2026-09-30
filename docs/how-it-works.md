# How thread naming works

[Documentation](README.md) · [Configuration](configuration.md)

## Trigger and title selection

The plugin registers OpenClaw’s `message_received` and `message_sent` hooks alongside the official Discord channel plugin. It runs in response to accepted messages and successfully delivered replies; there is no schedule or background thread scan.

On the first accepted message it observes in a thread, it reads the existing OpenClaw session’s user and assistant messages. That history counts toward `autoName`. New messages and successful replies count toward the same threshold, and duplicate observed message IDs are ignored. Disabled accounts, non-Discord messages, empty messages without media, and failed deliveries do not trigger naming.

Once the threshold is reached, the title prompt asks for a broad, descriptive topic using the opening subject and recurring themes. It avoids centering the latest follow-up question. For example, a discussion of AI agents playing games can keep a title such as “AI models playing games” after a follow-up about edited gameplay videos.

## Conversation and model context

The final title call runs in a fresh isolated context. For long histories, the plugin first makes separate isolated calls to summarize successive chunks. It only sends user and assistant text; tool calls, tool results, and other session events are excluded. Conversation text is never written to plugin logs or claim state.

The plugin can process up to 160,000 characters of session conversation text. Larger histories are skipped instead of silently dropping earlier context. Discord messages that never made it into the OpenClaw session cannot be recovered. Inactive threads are not scanned; an older thread is considered only after its next accepted message.

## Rename checks and state

Each thread gets at most one title attempt after the threshold is reached. The plugin checks Manage Threads before generation and again before renaming, and abandons a rename if the Discord configuration or thread name changes during generation. A Discord `403` or `429` ends that thread’s attempt without retrying.

Official trusted installs use OpenClaw’s persistent state store. ClawHub community installs use bounded process memory for claims and rate counters. Those records reset on plugin reload or Gateway restart, so a thread could be considered again after a restart. If the memory store fills, naming is skipped and regular Discord message delivery continues.

The plugin sanitizes titles by removing Discord mentions, markdown noise, control characters, and excess whitespace. Titles are limited to 100 UTF-16 code units without splitting a surrogate pair. Empty titles are skipped.

Before requesting a title, it checks that the parent channel has room under its limit of two renames in ten minutes. A thread that cannot get a slot stays eligible for its next accepted message. The rate slot is reserved just before the Discord rename request.
