# Contributing

Thanks for contributing to AI Discord Thread Titles. This repository contains a companion plugin for OpenClaw’s official Discord channel plugin.

## Getting started

Fork or clone the repository, create a feature branch, and follow the setup and check commands in [the development guide](docs/development.md#local-checks).

Keep runtime code in `src/`, tests in `test/`, and detailed documentation in `docs/`. The README should give users the feature overview and quick start, with links to detailed guides.

## Making changes

- Keep each change focused and follow the style of neighboring files.
- Add or update regression tests for behavior changes. Mock Discord and model responses; tests must not use the network.
- When changing settings, update `src/config.ts`, `openclaw.plugin.json`, the configuration tests, and [the configuration guide](docs/configuration.md).
- When changing behavior or limits, update the relevant documentation and add an entry under `Unreleased` in `CHANGELOG.md`.
- Keep credentials and real conversation content out of code, logs, examples, fixtures, and pull requests.

## Before opening a pull request

Run `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm build`, and `pnpm check:package`. Use `pnpm format` to resolve formatting issues. See [release packaging](docs/development.md#release-packaging) if changing package contents or preparing a release.

Use a conventional commit and pull request title, such as `feat(discord): add a naming option`, `fix(discord): preserve rate-limit eligibility`, or `docs: clarify setup`.

Describe the concrete problem, resulting behavior, configuration changes, and checks you ran. Include any relevant limitations. Submit work from a feature branch rather than pushing directly to `main`.

## Reporting an issue

Include the OpenClaw and plugin versions, relevant configuration with secrets removed, the expected behavior, and what happened. Describe whether the parent channel has Manage Threads permission and whether the naming threshold was reached. Share only the minimum log excerpt needed, with credentials and private conversation text removed.
