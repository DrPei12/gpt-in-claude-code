# GPT in Claude Code (`gicc`)

[![CI](https://github.com/DrPei12/gpt-in-claude-code/actions/workflows/test.yml/badge.svg)](https://github.com/DrPei12/gpt-in-claude-code/actions/workflows/test.yml)
[![CodeQL](https://github.com/DrPei12/gpt-in-claude-code/actions/workflows/codeql.yml/badge.svg)](https://github.com/DrPei12/gpt-in-claude-code/actions/workflows/codeql.yml)
[![Latest release](https://img.shields.io/github/v/release/DrPei12/gpt-in-claude-code)](https://github.com/DrPei12/gpt-in-claude-code/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platforms](https://img.shields.io/badge/platforms-macOS%20%7C%20Linux%20%7C%20Windows-informational.svg)](docs/installation.md)

GPT in Claude Code is an open source harness that runs GPT-5.6 Codex models
inside the Claude Code interface. The installed command is `gicc`. It detects
the official command line tools, guides or installs missing prerequisites,
opens the official Codex browser login when needed, and keeps all managed state
separate from normal `claude` and `codex` sessions.

> [!IMPORTANT]
> GICC is an independent community project. It is not affiliated with, endorsed by, or supported by OpenAI or Anthropic. Its installer uses the official [Codex CLI](https://developers.openai.com/codex/cli/) npm package and [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) installer when either prerequisite is missing. You remain responsible for the terms and usage limits of those services.

## Quick start

Install GICC, then complete the official Codex browser sign in when prompted.

### One command installer

macOS, Linux, or WSL:

```bash
curl -fsSL --proto '=https' --tlsv1.2 https://raw.githubusercontent.com/DrPei12/gpt-in-claude-code/main/bootstrap.sh | bash
```

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/DrPei12/gpt-in-claude-code/main/bootstrap.ps1 | iex
```

These small GitHub bootstraps resolve the latest stable release,
validate its published SHA-256 digest and archive paths, and only then run the
native installer. Use the longer download commands below if you want to inspect
the bootstrap before running it.

During setup, the installer:

1. Checks Node.js, Claude Code, Codex CLI, and the platform tools used by the
   harness.
2. Uses the official Claude Code and Codex installers when a supported
   prerequisite is missing. If automatic setup is unavailable, it prints the
   exact missing requirement instead of changing another tool.
3. Reuses a valid Codex login or opens the official Codex browser authorization
   flow in an interactive terminal.
4. Installs the checksum verified GICC reasoning bridge and runs `gicc --doctor`.

### macOS, Linux, or WSL

```bash
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  --output /tmp/gicc-bootstrap.sh \
  https://raw.githubusercontent.com/DrPei12/gpt-in-claude-code/main/bootstrap.sh
bash /tmp/gicc-bootstrap.sh
gicc
```

The bootstrap verifies the latest release archive before running it. The installer
opens Codex's official browser login only when authentication is needed and the
terminal is interactive. If `~/.local/bin` is not on your `PATH`, follow the
instruction printed by the installer.

### Windows

```powershell
Invoke-WebRequest -UseBasicParsing https://raw.githubusercontent.com/DrPei12/gpt-in-claude-code/main/bootstrap.ps1 -OutFile "$env:TEMP\gicc-bootstrap.ps1"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\gicc-bootstrap.ps1"
gicc
```

The installer adds the GICC launcher directory to your user `PATH`. Open a new terminal if the `gicc` command is not immediately available.

For release downloads, system requirements, updating, and removal, see the [installation guide](docs/installation.md).

## What GICC adds

- Automatic authentication through the existing Codex desktop or CLI session,
  including live account switch detection and clear login/logout recovery.
- Friendly model choices for GPT-5.6 Sol, Terra, Luna, and Solplan.
- Solplan planning with Sol and implementation with Terra.
- Native Fable, Opus, Sonnet, and Haiku shortcuts plus direct access to every
  model ID accepted by the installed Claude Code CLI.
- Fableplan planning with native Fable and isolated implementation with managed
  Terra. Only bounded plan text crosses between the two processes.
- Concurrent Claude and GPT sessions with separate provider environments and
  no shared credential process.
- One way, model free transfer of a validated GICC Claude transcript into a
  persistent Codex thread, using Codex's native `externalAgentConfig/import`
  session importer.
- Auto, max effort, and Ultracode modes with explicit and separate behavior.
- Transparent continuation when Codex consumes one output segment with
  encrypted reasoning before it can produce a visible answer. This fixes the
  repeated 32000, 64000, and 128000 `max_tokens` failures that a larger Claude
  Code environment value alone cannot fix.
- Dynamic Workflow, Ultrareview, Agent delegation, nested delegation, and
  native Agent Teams remain available. GICC sets no fixed Tool or Agent
  concurrency cap; the model chooses useful fanout and Claude Code's native
  scheduler enforces runtime capacity.
- Codex aware context accounting and automatic compaction near 244800
  model visible tokens for the GPT-5.6 Sol catalog window.
- Codex usage limit reporting in the status line and through `/usage-limit`.
- Automatic, non destructive discovery of already installed Claude Code and
  Codex skills, including Codex bundled/system skills, project skills, legacy
  Claude commands, and enabled plugin skills, with native `/skill` execution
  and Codex style `$skill` references inside GICC.
- The detected ChatGPT subscription tier in the startup banner instead of
  Claude Code's misleading API billing label.
- Native agent activity labels that include model, reasoning effort, and task,
  such as `Terra (high) - Audit JSON parser bugs`.
- Supported launchers and installers for macOS, Linux, Windows, and WSL, with
  the narrower hosted CI coverage shown below.
- Explicit native Codex and clean native Claude routes for harness specific
  features that should not be translated.
- Claude Code argument pass through, resume command rewriting, task cleanup, bounded retries, and compatibility detection.
- Validated Claude option and auto mode defaults caches avoid repeated startup
  probes and rebuild automatically after expiry, corruption, or a Claude Code
  executable change.
- A clean full screen terminal experience without exposing launch commands or internal tool traffic unnecessarily.
- An optional direct Claude profile for the officially supported Claude in Chrome path.

GICC keeps its generated configuration under `~/.config/gpt-in-claude-code` and does not replace your normal Claude Code settings. It never commits or bundles your Codex tokens, Claude sessions, prompts, history, or usage data.

## Common commands

```text
gicc                    Start with Sol and auto mode
gicc --terra            Start with Terra
gicc --luna             Start with Luna
gicc --solplan          Use Sol for planning and Terra for implementation
gicc --fable            Start native Claude Code with Fable
gicc --opus             Start native Claude Code with Opus
gicc --sonnet           Start native Claude Code with Sonnet
gicc --haiku            Start native Claude Code with Haiku
gicc --claude-model ID  Start native Claude Code with an alias or full model ID
gicc --fableplan "TASK"  Let Fable plan read only, then let Terra implement
gicc --max-effort       Use Claude Code's maximum reasoning effort
gicc --ultracode        Enable the session-scoped Ultracode workflow
gicc --manual           Disable automatic permissions for this launch
gicc --usage-limit      Refresh and display Codex plan limits
gicc skills             List Claude and Codex skills available in this project
gicc --accounts         List locally available Codex usage accounts
gicc --doctor           Check installation, authentication, and models
gicc --doctor --json    Print live diagnostics as sanitized JSON
gicc version --json     Print the GICC version contract as JSON
gicc setup status --json  Check prerequisites and managed runtime files
gicc support bundle     Write a sanitized support bundle for review
gicc --login            Sign in through Codex and synchronize the session
gicc --logout           Sign out and clear the managed bridge session
gicc session list       List resumable sessions for the current directory
gicc session status     Inspect the latest session and its context checkpoints
gicc session doctor     Validate the latest native transcript and context state
gicc session resume ID  Resume one validated session through Claude Code
gicc transfer [ID]      Import a validated GICC session into a resumable Codex thread
gicc context status     Inspect persisted model context checkpoints
gicc context repair     Quarantine damaged checkpoints and restore safe backups
gicc self-update --status  Inspect automatic update state
gicc self-update --apply   Apply the latest stable release now
gicc codex ...             Use the native Codex harness
gicc claude ...            Use the native Claude harness
gicc --remote-control      Use Claude Remote Control with the direct Anthropic profile
gicc ultrareview ...       Use Claude Ultrareview with the direct Anthropic profile
gicc --claude-chrome    Use the direct Claude profile with Chrome support
```

Direct and archive installs also provide `claudex` when that command name is
free. It is only a compatibility alias for `gicc`: both commands use the same
configuration, sessions, arguments, and update channel. `gicc` remains the
canonical command. The installer never replaces an unrelated existing
`claudex` command automatically.

Inside GICC, `/model solplan` selects Solplan and `/usage-limit` prints the detailed quota report. Existing Claude and Codex skills can be referenced with `/skill-name` or `$skill-name`; see the [skills guide](docs/skills.md) for discovery and collision behavior. Unknown options and supported Claude Code subcommands are passed through unchanged. See the [usage guide](docs/usage.md) for the complete command reference.

The GPT model picker belongs to a managed Codex backed process. Native Claude
selectors launch a separate first party Claude process and preserve the caller
owned profile. For complete native argument control, use
`gicc claude --model MODEL ...`. Open a Claude process and a GPT process in
separate terminals to use both providers concurrently. GICC never places
both providers' credentials or routing variables in one process.

Use `gicc codex ...` for complete native Codex harness access and
`gicc claude ...` for complete native Claude harness access, subject to the
installed CLI, caller owned provider configuration, account, platform, and
service entitlements. The
default GPT backed mode translates only the portable semantics documented in
the compatibility matrix; it does not emulate Codex only tools or activate the
non skill components of Codex plugins inside Claude Code.

## Supported platforms

| Platform | Status | Hosted CI evidence | Installer |
| --- | --- | --- | --- |
| macOS 13+ on Apple silicon or Intel | Supported | `macos-latest`; hosted CI does not exercise both CPU architectures | `install.sh` |
| Ubuntu 20.04+, Debian 10+, and compatible Linux on x64 or ARM64 | Supported | `ubuntu-latest` plus an Ubuntu 20.04 container on x64; no hosted ARM64 job | `install.sh` |
| Windows 10 1809+, Windows 11, and Windows Server 2019+ on x64 or ARM64 | Supported | `windows-latest` on x64; no hosted ARM64 job | `install.ps1` |
| WSL 1 or WSL 2 | Supported as a Linux environment | No dedicated hosted WSL job | `install.sh` |

"Supported" means the installer and launcher contain an explicit platform path;
it does not mean every operating system and CPU combination runs in hosted CI.
Claude Code's own platform limitations still apply. In particular, native
Windows does not provide the same sandbox implementation as macOS, Linux, and
WSL2, and Claude in Chrome follows Anthropic's browser, plan, and environment
requirements.

## Documentation

| Guide | Purpose |
| --- | --- |
| [Documentation index](docs/README.md) | Find the right guide quickly |
| [Installation](docs/installation.md) | Requirements, setup, updates, and removal |
| [Package channels](docs/package-managers.md) | Current and planned distribution channels |
| [Usage](docs/usage.md) | Commands, model modes, Chrome, and pass through behavior |
| [Configuration](docs/configuration.md) | Supported environment variables and settings |
| [Skills](docs/skills.md) | Existing Claude Code and Codex skill discovery, aliases, and compatibility |
| [Architecture](docs/architecture.md) | Components, data flow, authentication, and trust boundaries |
| [Troubleshooting](docs/troubleshooting.md) | Diagnose common installation and runtime problems |
| [Development](docs/development.md) | Repository layout, tests, and release workflow |
| [Claude Code and Codex compatibility](docs/claude-code-compatibility.md) | Capability classifications, tested adaptations, and non portable boundaries |
| [Roadmap](ROADMAP.md) | Current priorities, contribution ideas, and non goals |

Project policies and history are in [CONTRIBUTING.md](CONTRIBUTING.md), [GOVERNANCE.md](GOVERNANCE.md), [MAINTAINERS.md](MAINTAINERS.md), [SECURITY.md](SECURITY.md), [SUPPORT.md](SUPPORT.md), and [CHANGELOG.md](CHANGELOG.md).

## How it works

```text
gicc command
    -> managed GPT route: validates Codex, refreshes the loopback bridge,
       and launches an isolated Claude Code profile
    -> native Claude route: removes managed routing and launches the normal
       Claude profile with the requested model
    -> Fableplan route: captures a private native Fable plan, then launches
       an isolated managed Terra implementer
    -> preserves supported Claude Code commands and options on each route
```

The installer downloads a GICC release asset built from pinned
[CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) source plus the
public reasoning continuation and Claude context patches. It verifies the
SHA-256 digest and binds
the service to `127.0.0.1` on a dedicated port with a generated local key. The
source reference, patch, build inputs, licenses, and asset digests are public in
the [upstream record](UPSTREAM.md), [patch directory](patches), and
[bridge manifest](proxy/manifest.json). Read the [architecture guide](docs/architecture.md)
and [third party notice](NOTICE.md) before changing authentication or proxy behavior.

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), which covers local setup, testing, cross platform expectations, pull requests, and the project's no CLA contribution terms. By participating, you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

- Ask usage questions in [GitHub Discussions](https://github.com/DrPei12/gpt-in-claude-code/discussions).
- Report reproducible bugs or propose features with the [issue templates](https://github.com/DrPei12/gpt-in-claude-code/issues/new/choose).
- Find approachable work under [`good first issue`](https://github.com/DrPei12/gpt-in-claude-code/labels/good%20first%20issue) and maintainer supported work under [`help wanted`](https://github.com/DrPei12/gpt-in-claude-code/labels/help%20wanted).
- Review the [roadmap](ROADMAP.md) before proposing a large change.
- Report security vulnerabilities privately through [GitHub Security Advisories](https://github.com/DrPei12/gpt-in-claude-code/security/advisories/new).

Run the complete local test suite before opening a pull request:

```bash
./test.sh
```

On Windows, run `./test.ps1` from PowerShell. GitHub Actions repeats the suite on macOS, Ubuntu, and Windows.

## License

GICC is available under the [MIT License](LICENSE). See [NOTICE.md](NOTICE.md) for project independence, trademark, and third party dependency notices.
