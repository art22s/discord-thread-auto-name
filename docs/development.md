# Development

[Documentation](README.md) · [Contributing](../CONTRIBUTING.md)

## Prerequisites

- Node.js compatible with the installed OpenClaw SDK and development dependencies.
- The pnpm version declared in `package.json`.

The development OpenClaw SDK version is pinned in `package.json`. Plugin compatibility and build metadata are declared there and in `openclaw.plugin.json`.

## Repository layout

```text
src/                       Runtime implementation and SDK type declarations
test/                      Vitest tests with mocked Discord and model calls
docs/                      Configuration, behavior, troubleshooting, and development guides
scripts/                   Maintainer checks for release package contents
CONTRIBUTING.md            Contribution and pull request guidelines
README.md                  Feature overview, installation, and quick start
CHANGELOG.md               Unreleased changes and release history
openclaw.plugin.json       Plugin identity, activation, and configuration schema
vitest.config.ts           Test discovery under test/
tsconfig.json              Type checking for source, tests, and test configuration
tsconfig.build.json        Runtime build from src/ into dist/
```

`dist/`, `node_modules/`, `coverage/`, and inspection `reports/` are generated and ignored by Git.

## Local checks

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm lint
pnpm test
pnpm build
pnpm check:package
```

Run `pnpm format` to apply formatting. The lint and format scripts include runtime code, tests, documentation, and project configuration.

Tests live in `test/*.test.ts` and import runtime modules from `../src/`. Vitest only discovers tests under `test/`. Type checking covers both directories, while the build includes only `src/` and emits the existing `dist/index.js` plugin entrypoint.

For a focused test run:

```sh
pnpm exec vitest run test/auto-name.test.ts
```

## Implementation map

| Module                   | Responsibility                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| `src/index.ts`           | Plugin registration, accepted message hooks, configuration access, and isolated model calls. |
| `src/config.ts`          | Settings validation and shared/account override resolution.                                  |
| `src/auto-name.ts`       | Message counting, claims, rename pacing, title sanitization, and authorization checks.       |
| `src/discord.ts`         | Discord REST requests, thread metadata, and permission calculation.                          |
| `src/session-history.ts` | Paged reads of visible user and assistant session text.                                      |
| `src/title-input.ts`     | Bounded chunk summaries for long conversations.                                              |
| `src/memory-store.ts`    | Bounded process-memory state when persistent storage is unavailable.                         |

## Tests

Tests mock Discord REST and model responses and make no network requests. They cover configuration, account overrides, title sanitization, isolated model routing, transcript pagination, long-history summaries, claims, rate limits, permission changes, and fallback state.

Use mocked data for regression cases. Do not add real conversation content, bot tokens, provider credentials, or session files to fixtures.

## Release packaging

Update the version and changelog, run the local checks, and commit and push the release source on a feature branch before publishing. Build the runtime before packing:

```sh
pnpm build
pnpm check:package
pnpm pack --out /tmp/discord-thread-auto-name-release.tgz
tar -tzf /tmp/discord-thread-auto-name-release.tgz
```

`pnpm check:package` checks the same package allowlist using an npm pack dry run and fails if runtime files or documentation are missing, or if development files are included.

Verify the archive includes `package/dist/index.js`, the other compiled runtime modules, `openclaw.plugin.json`, and the documentation. Source tests and development dependencies should be absent.

The package allowlist includes `dist/`, `docs/`, `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, the manifest, and the license. `dist/` is intentionally ignored by Git. Publish from the built local folder so those files are included:

```sh
clawhub package publish . --dry-run --json
clawhub package publish . --wait
```

A GitHub source checkout does not include ignored build output. The ClawHub CLI packs with scripts disabled, so publishing directly from a source repository does not build `dist/`. Check the published file list and scan status before updating an installed plugin:

```sh
clawhub package inspect @art22s/discord-thread-auto-name --files --json
```
