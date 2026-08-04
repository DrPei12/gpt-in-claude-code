# Changelog

All notable changes to this independent distribution are documented here.

## [Unreleased]

### Added

- `gicc session list`, `status`, `doctor`, and `resume` provide one management
  surface over Claude Code's native isolated transcripts.
- `gicc context status` reports checkpoint health, while scoped
  `gicc context repair` quarantines invalid active state and restores a valid
  previous checkpoint without editing raw history.
- Direct and archive installers can add a collision safe `claudex`
  compatibility alias that forwards to the canonical `gicc` launcher without
  creating separate configuration or session state.
- `gicc version`, `gicc setup status`, and `gicc --doctor --json` provide
  stable machine readable installation and live health contracts.
- `gicc support bundle` writes approved configuration metadata and aggregate
  runtime health counts for support requests.
- A checked JSON compatibility manifest keeps harness classifications, pass
  through arguments, and native uncapped workflow ownership synchronized with
  the public documentation and both launchers.

### Changed

- Dynamic Workflow, Ultrareview, Agent delegation, nested subagent delegation,
  and native Agent Teams now use Claude Code's native scheduling, directed by
  the model.
  GICC no longer sets fixed Tool or Agent concurrency limits.
- Install receipts record optional alias ownership so reinstall and archive
  rollback touch only GICC managed command files.
- Normal launches cache validated Claude option and auto mode default probes by
  resolved executable identity. Expiry, corruption, executable changes, and
  doctor checks refresh the data automatically.

### Security

- Session inspection omits prompt and response content, and scoped context
  repair leaves checkpoints with unknown session ownership untouched.
- Support bundles exclude credential content, proxy tokens, account details,
  prompts, responses, raw logs, raw update errors, local paths, and session IDs.
  Arbitrary values in otherwise approved configuration fields are discarded.

## [0.1.2] - 2026-08-01

### Fixed

- Claude Code sessions now keep Claude's raw transcript as the source of truth
  while the Codex bridge persists and reapplies a model visible checkpoint per
  session, agent, and model.
- New reasoning replay and tool output can trigger another proactive compaction
  after a prior checkpoint; an emergency local fallback remains one time for an
  irreducible request.
- Reasoning only incomplete Responses continue without treating the Claude
  `max_tokens` value as a cumulative hidden reasoning ceiling.
- Remote compaction responses are bounded when read, and deterministic summary
  truncation preserves valid UTF-8 for CJK and other multibyte text.

### Changed

- The v7.2.91 bridge is rebuilt as `7.2.91-gicc.2` from the public upstream
  archive plus both public GICC patches, with six platform assets and pinned
  SHA-256 digests.
- Context defaults follow the GPT-5.6 Sol catalog: a 272000-token model window
  and automatic compaction near 244800 model visible tokens.

### Security

- Public tree scanning recognizes both slash styles in Windows paths, and the
  published bridge examples use portable home directory placeholders rather
  than a developer machine path.

## [0.1.1] - 2026-07-30

### Fixed

- The Windows public bootstrap now resolves the latest stable release through
  the repository scoped GitHub redirect. It no longer depends on the
  unauthenticated REST API limit shared by a public runner or network.

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

[Unreleased]: https://github.com/DrPei12/gpt-in-claude-code/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/DrPei12/gpt-in-claude-code/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/DrPei12/gpt-in-claude-code/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/DrPei12/gpt-in-claude-code/releases/tag/v0.1.0
