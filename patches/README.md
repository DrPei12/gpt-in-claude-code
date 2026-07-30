# Reasoning bridge patch

The patch in this directory applies cleanly to CLIProxyAPI v7.2.91 at commit
`fde40c5a0a2f8f6808bcde498bc6079f32c355ef`.

It makes two bounded changes:

1. If the Codex Responses API ends with `response.incomplete` because the
   output budget was consumed by encrypted reasoning and no visible answer was
   produced, the bridge carries that encrypted reasoning into a follow up
   request. Claude Code receives one logical response instead of a false
   `max_tokens` failure.
2. If an HTTP transport fails before any response begins, the bridge retries a
   recreated request body with a short bounded delay. It never replays a stream
   that has already emitted output.

The patch adds focused tests for normal and streaming continuation, early EOF
retry, non transport failures, and context cancellation. The continuation is
also bounded by the caller output budget and an internal segment limit.

Rebuild and verification inputs are in [`proxy/manifest.json`](../proxy/manifest.json)
and [`scripts/build-proxy-assets.sh`](../scripts/build-proxy-assets.sh). Canonical
release binaries are built on Linux/amd64 with the exact Go version recorded in
the manifest; builds on another host are intentionally rejected because Go
cross platform build output is not guaranteed to be byte identical across host
systems.
