# GICC bridge patches

The patches in this directory apply cleanly, in filename order, to CLIProxyAPI
v7.2.91 at commit `fde40c5a0a2f8f6808bcde498bc6079f32c355ef`.

They make these bounded changes:

1. If the Codex Responses API ends with `response.incomplete` because the
   output budget was consumed by encrypted reasoning and no visible answer was
   produced, the bridge carries that encrypted reasoning into a follow up
   request. Claude Code receives one logical response instead of a false
   `max_tokens` failure.
2. If an HTTP transport fails before any response begins, the bridge retries a
   recreated request body with a short bounded delay. It never replays a stream
   that has already emitted output.
3. Claude Code requests get a per session, agent, and model model visible context
   checkpoint. The remote `/responses/compact` endpoint is preferred, semantic
   and deterministic local fallbacks are bounded, and Claude's raw transcript
   remains authoritative. New reasoning replay can arm compaction again after a
   previous checkpoint, while an emergency local fallback remains one time for
   an irreducible raw request.

The patches add focused tests for normal and streaming continuation, early EOF
retry, non transport failures, context cancellation, model visible context
accounting, compaction recovery, repeated threshold crossings, bounded remote
responses, portable paths, and UTF-8-safe summaries. Hidden reasoning
continuation is bounded by an internal segment limit; it is not charged against
Claude Code's visible `max_tokens` budget as a cumulative ceiling.

Rebuild and verification inputs are in [`proxy/manifest.json`](../proxy/manifest.json)
and [`scripts/build-proxy-assets.sh`](../scripts/build-proxy-assets.sh). Canonical
release binaries are built on Linux/amd64 with the exact Go version recorded in
the manifest; builds on another host are intentionally rejected because Go
cross platform build output is not guaranteed to be byte identical across host
systems.
