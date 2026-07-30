# Changelog

All notable changes to this independent distribution are documented here.

## [Unreleased]

## [0.1.0] - 2026-07-29

### Added

- The `gicc` command for GPT-5.6 Sol, Terra, and Luna inside Claude Code.
- Automatic prerequisite detection for Claude Code, Codex CLI, Node.js, and
  required platform tools.
- Official Codex browser authorization when no reusable login is available.
- Isolated configuration, credentials, sessions, history, skills, usage data,
  and local bridge state under `~/.config/gpt-in-claude-code`.
- Persistent Claude Code history and resume behavior inside the isolated
  profile.
- Ultracode, model shortcuts, skill discovery, doctor, usage, update, native
  Claude, and native Codex routes inherited and adapted from Claudex v1.6.2.
- A public CLIProxyAPI v7.2.91 patch that continues encrypted reasoning when a
  `response.incomplete` event consumes one output segment before any visible
  answer.
- Bounded retry for transport failures that occur before a response begins.
- Reproducible bridge build inputs, six platform assets, fixed SHA-256 digests,
  third party notices, and public tree secret scanning.

### Changed

- The public command, environment namespace, config path, release repository,
  and update channel are independent from Claudex.
- Tool and Agent concurrency default to one, with four API retries and a 128000
  token Claude output budget.
- Package manager channels are not advertised until real packages exist.

### Security

- Managed services bind to loopback by default and use a generated local key.
- Installers verify release and bridge assets before extraction or execution.
- Normal `claude` and `codex` profiles are not modified.

[Unreleased]: https://github.com/DrPei12/gpt-in-claude-code/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/DrPei12/gpt-in-claude-code/releases/tag/v0.1.0
