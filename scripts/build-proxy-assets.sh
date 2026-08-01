#!/usr/bin/env bash
set -euo pipefail

readonly root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)"
readonly upstream_version='7.2.91'
readonly upstream_commit='fde40c5a0a2f8f6808bcde498bc6079f32c355ef'
readonly upstream_sha256='e6e79f109c0a9f1cdc9aa1761ea413befaadf5970b35bfb64b38b060cc079e0e'
readonly bridge_version='7.2.91-gicc.2'
readonly source_url="https://github.com/router-for-me/CLIProxyAPI/archive/refs/tags/v${upstream_version}.zip"
readonly build_root="$root/dist/proxy-build"
readonly output_root="$root/dist/proxy-assets"

[[ "$(uname -s)" == Linux && "$(uname -m)" =~ ^(x86_64|amd64)$ ]] || {
  printf '%s\n' 'Reproducible proxy assets must be built on Linux/amd64' >&2
  exit 1
}

case "$build_root" in "$root"/dist/*) ;; *) printf 'unsafe build directory: %s\n' "$build_root" >&2; exit 1 ;; esac
rm -rf "$build_root" "$output_root"
mkdir -p "$build_root" "$output_root"

command -v curl >/dev/null 2>&1 || { printf '%s\n' 'curl is required' >&2; exit 1; }
command -v git >/dev/null 2>&1 || { printf '%s\n' 'git is required' >&2; exit 1; }
command -v go >/dev/null 2>&1 || { printf '%s\n' 'Go 1.26.0 is required' >&2; exit 1; }
command -v node >/dev/null 2>&1 || { printf '%s\n' 'Node.js is required' >&2; exit 1; }
if ! command -v unzip >/dev/null 2>&1 && ! command -v python3 >/dev/null 2>&1; then
  printf '%s\n' 'unzip or Python 3 is required' >&2
  exit 1
fi
[[ "$(go version)" == 'go version go1.26.0 '* ]] || { printf '%s\n' 'Go 1.26.0 is required for reproducible proxy assets' >&2; exit 1; }

archive="$build_root/upstream.zip"
if [[ -n "${GICC_PROXY_SOURCE_ARCHIVE:-}" ]]; then
  [[ -f "$GICC_PROXY_SOURCE_ARCHIVE" ]] || {
    printf 'GICC_PROXY_SOURCE_ARCHIVE is not a file: %s\n' "$GICC_PROXY_SOURCE_ARCHIVE" >&2
    exit 1
  }
  cp "$GICC_PROXY_SOURCE_ARCHIVE" "$archive"
else
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
    --retry 3 --retry-delay 1 --retry-connrefused --output "$archive" "$source_url"
fi
actual=$(sha256sum "$archive" | awk '{print tolower($1)}')
[[ "$actual" == "$upstream_sha256" ]] || { printf '%s\n' 'CLIProxyAPI source archive checksum mismatch' >&2; exit 1; }
if command -v unzip >/dev/null 2>&1; then
  unzip -q "$archive" -d "$build_root"
else
  python3 - "$archive" "$build_root" <<'PY'
import sys
from zipfile import ZipFile

with ZipFile(sys.argv[1]) as archive_file:
    archive_file.extractall(sys.argv[2])
PY
fi
source_root="$build_root/CLIProxyAPI-$upstream_version"
[[ -f "$source_root/go.mod" ]] || { printf '%s\n' 'CLIProxyAPI source archive has an unexpected layout' >&2; exit 1; }
patch_directory="dist/proxy-build/CLIProxyAPI-$upstream_version"
patch_files=(
  "$root/patches/0001-fix-continue-Codex-reasoning-only-incomplete-respons.patch"
  "$root/patches/0002-fix-manage-Claude-context-with-Codex-compaction.patch"
)
for patch_file in "${patch_files[@]}"; do
  git -C "$root" apply --check --directory="$patch_directory" "$patch_file"
  git -C "$root" apply --directory="$patch_directory" "$patch_file"
done
[[ -f "$source_root/internal/runtime/executor/codex_executor_reasoning_continuation_test.go" &&
   -f "$source_root/internal/runtime/executor/codex_transport_retry_test.go" &&
   -f "$source_root/internal/runtime/executor/helps/claude_code_context.go" &&
   -f "$source_root/internal/runtime/executor/codex_claude_context.go" ]] || {
  printf '%s\n' 'GICC bridge patches did not materialize their runtime and regression files' >&2
  exit 1
}

(
  cd "$source_root"
  continuation_tests=(
    TestCodexExecutorExecuteContinuesReasoningOnlyIncompleteForClaude
    TestCodexExecutorExecuteStreamContinuesReasoningOnlyIncompleteWithinOneClaudeMessage
    TestDoCodexRequestWithTransportRetry_ReplaysBodyAfterEOF
    TestDoCodexRequestWithTransportRetry_DoesNotRetryNonTransportError
    TestDoCodexRequestWithTransportRetry_StopsWhenContextCanceled
  )
  printf -v continuation_pattern '%s|' "${continuation_tests[@]}"
  continuation_pattern="^(${continuation_pattern%|})$"
  test_output=$(go test -v ./internal/runtime/executor -run "$continuation_pattern" -count=1)
  printf '%s\n' "$test_output"
  for test_name in "${continuation_tests[@]}"; do
    grep -Fq "=== RUN   $test_name" <<<"$test_output" || {
      printf 'required regression test did not run: %s\n' "$test_name" >&2
      exit 1
    }
  done
  context_tests=(
    TestClaudeCodeContextCheckpointReplacesMatchingRawPrefix
    TestClaudeCodeContextRearmsAfterNewRequestCrossesThreshold
    TestSummarizeContextItemsPreservesUTF8
    TestCodexClaudeContextProactivelyUsesRemoteCompaction
    TestCodexClaudeContextRecoversOnceFromUnexpectedContext400
    TestCodexClaudeContextUsesSemanticFallbackWhenCompactEndpointFails
  )
  printf -v context_pattern '%s|' "${context_tests[@]}"
  context_pattern="^(${context_pattern%|})$"
  context_output=$(go test -v ./internal/runtime/executor/helps ./internal/runtime/executor -run "$context_pattern" -count=1)
  printf '%s\n' "$context_output"
  for test_name in "${context_tests[@]}"; do
    grep -Fq "=== RUN   $test_name" <<<"$context_output" || {
      printf 'required context regression test did not run: %s\n' "$test_name" >&2
      exit 1
    }
  done
  config_output=$(go test -v ./internal/config -run '^TestParseConfigBytesClaudeCodeContext$' -count=1)
  printf '%s\n' "$config_output"
  grep -Fq '=== RUN   TestParseConfigBytesClaudeCodeContext' <<<"$config_output" || {
    printf '%s\n' 'required context configuration regression test did not run' >&2
    exit 1
  }
  export CGO_ENABLED=0
  ldflags="-s -w -X main.Version=$bridge_version -X main.Commit=${upstream_commit:0:7}+gicc-r1 -X main.BuildDate=2026-07-29T00:00:00Z"
  for target in windows/amd64 windows/arm64 linux/amd64 linux/arm64 darwin/amd64 darwin/arm64; do
    os=${target%/*}
    goarch=${target#*/}
    asset_arch=$goarch
    [[ "$asset_arch" != arm64 ]] || asset_arch=aarch64
    extension=''
    [[ "$os" != windows ]] || extension='.exe'
    output="$output_root/gicc-proxy_${bridge_version}_${os}_${asset_arch}${extension}"
    GOOS="$os" GOARCH="$goarch" go build -trimpath -buildvcs=false -ldflags "$ldflags" -o "$output" ./cmd/server/
  done
)

for os in linux darwin; do
  for arch in amd64 aarch64; do
    node "$root/scripts/create-proxy-archive.mjs" tar.gz \
      "$output_root/gicc-proxy_${bridge_version}_${os}_${arch}" \
      "$output_root/gicc-proxy_${bridge_version}_${os}_${arch}.tar.gz"
  done
done
for arch in amd64 aarch64; do
  node "$root/scripts/create-proxy-archive.mjs" zip \
    "$output_root/gicc-proxy_${bridge_version}_windows_${arch}.exe" \
    "$output_root/gicc-proxy_${bridge_version}_windows_${arch}.zip"
done

for os in linux darwin; do
  for arch in amd64 aarch64; do
    rm "$output_root/gicc-proxy_${bridge_version}_${os}_${arch}"
  done
done
rm "$output_root"/gicc-proxy_*.exe
(cd "$output_root" && sha256sum gicc-proxy_*.tar.gz gicc-proxy_*.zip | sort -k2 > SHA256SUMS.proxy)
if [[ "${GICC_SKIP_PROXY_MANIFEST_CHECK:-0}" != 1 ]]; then
  node "$root/scripts/check-proxy-assets.mjs" "$output_root"
fi
