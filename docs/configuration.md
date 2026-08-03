# Configuration

The installer writes private runtime configuration to
`~/.config/gpt-in-claude-code/env` on every platform. Edit that file to persist supported
overrides, then start a new GICC session. The repository's `env.example`
shows the most common values.

Do not commit the installed `env` file. It contains a generated local proxy
key.

## Core runtime

| Variable | Default | Accepted values or purpose |
| --- | --- | --- |
| `GICC_CONFIG_DIR` | `~/.config/gpt-in-claude-code` | Private config and state root |
| `GICC_SETTINGS_FILE` | `<config>/settings.json` | Alternate Claude settings file |
| `GICC_MODEL` | `gpt-5.6-sol` | Default model ID |
| `GICC_PERMISSION_MODE` | `auto` | `manual`, `auto`, `acceptEdits`, `dontAsk`, or `plan` |
| `GICC_AUTO_MODE_MODEL` | `gpt-5.6-terra` | Auto mode classifier model; restricted to managed Codex GPT models |
| `GICC_BACKGROUND_MODEL` | `gpt-5.6-luna` | Background classifier model |
| `GICC_MAX_RETRIES` | `4` | Integer from 0 through 15 |
| `GICC_MAX_OUTPUT_TOKENS` | `128000` | Claude Code visible output budget; the bridge continues reasoning only incomplete Responses internally |
| `GICC_CONTEXT_WINDOW` | `272000` | GPT-5.6 Sol model visible context window; integer from 100000 through 1000000 |
| `GICC_AUTO_COMPACT_WINDOW` | `244800` | Proactive Codex visible compaction boundary; integer from 100000 through the context window |
| `GICC_PLAN_MODE_POLICY` | `conservative` | `conservative` or `normal` |
| `GICC_MOUSE_POINTER_SHAPE` | `pointer` | `pointer`, `default`, or `off` |
| `GICC_CHROME_CONFIG_DIR` | normal Claude profile | Optional dedicated first party Claude profile |
| `GICC_SKILL_BRIDGE` | `on` | `on` discovers existing Claude and Codex skills; `off` disables the compatibility overlay |
| `GICC_INSTRUCTION_BRIDGE` | `on` | `on` snapshots Codex `AGENTS.md` instruction chains into the isolated Claude compatibility overlay; `off` disables only instruction translation |
| `GICC_SKILL_PLUGINS` | `on` | Include enabled Claude and Codex plugin skills in discovery |
| `GICC_SKILL_DOLLAR_REFERENCES` | `on` | Resolve Codex style `$skill` references through the isolated compatibility hook |
| `GICC_CLAUDE_CONFIG_DIR` | `~/.claude` | Normal Claude profile whose personal skills and legacy commands should be shared |
| `GICC_SKILL_EXTRA_DIRS` | unset | OS path list of additional Agent Skills roots |
| `GICC_CODEX_ADMIN_SKILLS_DIR` | platform admin root | Override Codex's admin skill directory |
| `GICC_NODE_BIN` | managed automatically | Private verified Node.js runtime path on legacy Linux distributions |

The concurrency values are GICC safeguards, not promises that an upstream
account will always accept that many simultaneous requests. Lower them when an
account or provider has tighter capacity.

## Provider and model routing

`GICC_MODEL`, `GICC_AUTO_MODE_MODEL`, and `GICC_BACKGROUND_MODEL`
configure the managed Codex backed route only. They must remain managed Codex
GPT model IDs. Native Claude selection is intentionally command scoped:

```text
gicc --fable
gicc --opus
gicc --sonnet
gicc --haiku
gicc --claude-model MODEL
gicc claude --model MODEL
```

The four short selectors pass their alias to the installed Claude Code CLI.
`--claude-model` and the explicit native route accept any alias or full model
ID that CLI and the caller's Anthropic account support. There is no GICC
environment variable that stores a Claude credential or silently changes the
native profile's default model.

Managed GPT and native Claude sessions may run at the same time as separate
processes. GICC scrubs its managed proxy URL, local proxy key, Codex bridge
state, and model routing before every native Claude launch. The managed process
does not receive the native Claude process's authentication state. Do not copy
provider variables or credentials between these routes.

`--fableplan` also preserves this boundary. Its native Fable planner and
managed Terra implementer use different process environments and configuration
roots. GICC transfers the bounded plan through a private temporary file and
removes it when the workflow ends. The one mebibyte plan limit and validation
rules are security controls, not public configuration settings.

For proxied sessions, GICC hides Claude Code's Anthropic only 1M model
variant and uses `GICC_CONTEXT_WINDOW` plus the managed compaction boundary
instead. Direct `--claude-chrome` and maintenance commands do not inherit that
override.

## Usage limit display

| Variable | Default | Accepted values or purpose |
| --- | --- | --- |
| `GICC_USAGE_DISPLAY` | `on` | `on` or `off` |
| `GICC_USAGE_REFRESH_SECONDS` | `300` | 60 through 3600 |
| `GICC_USAGE_TIMEOUT_SECONDS` | `8` | 1 through 30 |
| `GICC_USAGE_MAX_STALE_SECONDS` | `86400` | Refresh interval through 604800 |
| `GICC_USAGE_ALERT_PERCENT` | `20` | 0 through 100; 0 disables warnings |
| `GICC_USAGE_SOURCE` | `auto` | `auto`, `web`, or `app-server` |
| `GICC_USAGE_URL` | ChatGPT usage endpoint | Must remain the official HTTPS ChatGPT usage endpoint |

`auto` first reads the authenticated web usage endpoint and falls back to
Codex app server's `account/rateLimits/read` interface. The app server fallback
is disabled while a specific bridge account is selected because that process
may represent a different account.

Automated tests that supply a fake usage service may set
`GICC_INSECURE_TEST_ALLOW_USAGE_URL=1`; even then, `GICC_USAGE_URL` is
restricted to an HTTP(S) loopback address. This test only escape hatch must not
be enabled in production.

The status line detects the available terminal width and removes the usage,
effort, and finally excess model detail as space becomes tight. This keeps the
footer on one row while preserving the model and context percentage whenever
they fit.

## Authentication and local proxy

| Variable | Default | Purpose |
| --- | --- | --- |
| `GICC_PROXY_URL` | `http://127.0.0.1:8318` | Local compatibility endpoint |
| `GICC_ALLOW_REMOTE_PROXY` | `0` | Set to `1` only to allow an explicitly configured HTTPS remote proxy |
| `GICC_PROXY_TOKEN` | generated during install | Local service authentication key |
| `GICC_PROXY_CONFIG` | `<config>/cliproxyapi.yaml` | Generated service config |
| `GICC_PROXY_BIN` | installed managed binary | Compatibility executable path |
| `GICC_CODEX_AUTH_DIR` | `<config>/codex-accounts` | Private bridge credential directory |
| `GICC_CODEX_SOURCE_AUTH_FILE` | `$CODEX_HOME/auth.json` | Standard Codex source credential |
| `GICC_CODEX_AUTH_FILE` | automatic | Explicit credential for advanced usage selection |
| `GICC_DISABLE_INTERACTIVE_LOGIN` | `0` | Set to `1` to keep foreground startup browser free and require an explicit `gicc --login` |

GICC rejects non loopback proxy URLs before sending credentials. A reviewed
remote deployment requires both an HTTPS URL and
`GICC_ALLOW_REMOTE_PROXY=1`; automatic local process recovery is disabled
for remote endpoints. Never share or commit `GICC_PROXY_TOKEN` or any Codex credential.
The generated config performs three bounded retries for transient upstream 5xx
responses plus two pre stream bootstrap retries, with short cooldowns so a
recovered blip does not flash as a user facing API error.

## Updates

| Variable | Default | Accepted values or purpose |
| --- | --- | --- |
| `GICC_AUTO_UPDATE` | `on` | `on` applies stable GICC releases, `notify` only checks, `off` disables checks |
| `GICC_UPDATE_INTERVAL_SECONDS` | `86400` | 3600 through 2592000 |
| `GICC_CLAUDE_AUTO_UPDATE` | `on` | `on` or `off` |
| `GICC_CLAUDE_UPDATE_INTERVAL_SECONDS` | `86400` | 3600 through 2592000 |
| `GICC_SKIP_CLAUDE_UPDATE` | unset | Set to `1` to skip the install time Claude update |

GICC and Claude Code use separate non blocking update state and stale lock
recovery guards. Failed or offline GICC checks stay quiet in the background
and use bounded exponential backoff. Inspect or control the stable channel with
`gicc self-update --status`, `--check`, or `--apply`. Package installations
delegate updates to their recorded package manager without `sudo`; archive and
source installations accept only checksum matched stable GitHub release assets.
An explicit `gicc update` remains Claude Code's native update command.

## Installer only overrides

These are primarily for packaging, CI, and advanced installations:

| Variable | Purpose |
| --- | --- |
| `GICC_BIN_DIR` | Alternate launcher installation directory |
| `GICC_PROXY_PORT` | Alternate generated loopback port |
| `GICC_SKIP_DEPENDENCY_INSTALL=1` | Skip dependency download and installation |
| `GICC_SKIP_SERVICE_START=1` | Install files without starting or verifying the service |

`GICC_SKIP_DEPENDENCY_INSTALL` and `GICC_SKIP_SERVICE_START` are intended
for controlled test or packaging environments. Ordinary users should not set
them.

Variables containing `GICC_TEST_`, `GICC_SESSION_MODE`,
`GICC_MODEL_MODE`, and helper binary overrides are internal implementation
details and are not a stable public interface.

## Installed files

| Path | Contents |
| --- | --- |
| `~/.local/bin/gicc` | Unix launcher |
| `~/.local/bin/gicc.ps1` and `gicc.cmd` | Windows launchers |
| `~/.config/gpt-in-claude-code/env` | Private environment config and generated key |
| `~/.config/gpt-in-claude-code/settings.json` | Isolated Claude Code settings |
| `~/.config/gpt-in-claude-code/skill-bridge.cjs` | Cross platform skill discovery and compatibility helper |
| `~/.config/gpt-in-claude-code/skill-bridge` | Content addressed, rebuildable views of existing Claude and Codex skills |
| `~/.config/gpt-in-claude-code/skills/usage-limit` | Bundled platform native `/usage-limit` skill |
| `~/.config/gpt-in-claude-code/codex-accounts` | Mode restricted local credential bridge |
| `~/.config/gpt-in-claude-code/usage-cache` | Sanitized usage values only |
| `~/.config/gpt-in-claude-code/statusline-cache` | Per session context percentages |
| `~/.config/gpt-in-claude-code/backups` | Private transaction generations containing previous managed files, including env and proxy config, from successful reinstalls |

Run `gicc --doctor` after changing configuration. Invalid values fail fast
with the accepted range or enum.
