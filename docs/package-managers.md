# Package channels

The current stable version is distributed through verified GitHub release
archives and the source repository. Homebrew, Scoop, WinGet, and npm packages
are not published yet. Do not use an unrelated package with the same `gicc`
command name.

Use the commands in the [installation guide](installation.md). Both platform
bootstraps download the latest stable GitHub release, verify its SHA-256 entry
and archive layout, then run the native installer.

Future package channels must meet the same requirements before this guide lists
them:

1. The public shim must invoke the isolated `gicc` launcher and must not replace
   `claude` or `codex`.
2. Setup must detect the official Claude Code and Codex CLI tools, and must give
   a clear installation path when either one is absent.
3. Every reasoning bridge asset must match the digest in
   [`proxy/manifest.json`](../proxy/manifest.json).
4. Package removal must leave private session state in
   `~/.config/gpt-in-claude-code` unless the user explicitly removes it.

The repository still contains a package bootstrap boundary so contributors can
add a reviewed channel later. That code is not evidence that a package is
currently available.
