# Changelog

## 0.1.2

- Read the existing OpenClaw session conversation when a thread receives its next accepted message, so older threads can be named from their history.
- Summarize long conversations in bounded isolated calls while excluding tool output from title input.
- Keep one-time thread claims without a time expiry.

## 0.1.1

- Fall back to bounded process memory when OpenClaw denies persistent state access to community plugins, so auto-naming can run.
- Warn once when persistence is unavailable and keep rate limits fail closed if state is full.

## 0.1.0

- Add opt-in Discord thread title generation after a configurable message threshold.
- Support per-account thresholds, persisted one-time claims, permission checks, and rename rate limits.
