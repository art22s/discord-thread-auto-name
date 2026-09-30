# Changelog

## Unreleased

- Organize tests under `test/` and add configuration, behavior, troubleshooting, development, and contribution guides.
- Include the documentation in package artifacts and update build, test, and formatting configuration for the new layout.
- Add a package check to verify compiled runtime and documentation are included without development files.

## 0.1.6

- Include the compiled runtime in the published artifact. Supersedes the incomplete 0.1.5 package.

## 0.1.5

- Generate broader, lasting thread titles from the opening subject and recurring conversation themes instead of centering the latest question.
- Add a `model` setting, including `accounts.<id>.model` overrides, for isolated title generation and long-history summaries.

## 0.1.4

- Refresh the ClawHub listing and README with a clearer feature overview, setup guide, and conversation-handling details.

## 0.1.3

- Leave rate-limited threads eligible for a later accepted message instead of permanently claiming them before a rename slot is available.

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
