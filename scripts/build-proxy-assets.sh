#!/usr/bin/env bash
set -euo pipefail

readonly root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)"
readonly upstream_version='7.2.91'
readonly upstream_commit='fde40c5a0a2f8f6808bcde498bc6079f32c355ef'
readonly upstream_sha256='e6e79f109c0a9f1cdc9aa1761ea413befaadf5970b35bfb64b38b060cc079e0e'
readonly bridge_version='7.2.91-gicc.1'
readonly source_url="https://github.com/router-for-me/CLIProxyAPI/archive/refs/tags/v${upstream_version}.zip"
readonly build_root="$root/dist/proxy-build"
readonly output_root="$root/dist/proxy-assets"

case "$build_root" in "$root"/dist/*) ;; *) printf 'unsafe build directory: %s\n' "$build_root" >&2; exit 1 ;; esac
rm -rf "$build_root" "$output_root"
mkdir -p "$build_root" "$output_root"

command -v curl >/dev/null 2>&1 || { printf '%s\n' 'curl is required' >&2; exit 1; }
command -v git >/dev/null 2>&1 || { printf '%s\n' 'git is required' >&2; exit 1; }
command -v go >/dev/null 2>&1 || { printf '%s\n' 'Go 1.26.0 is required' >&2; exit 1; }
command -v node >/dev/null 2>&1 || { printf '%s\n' 'Node.js is required' >&2; exit 1; }
command -v unzip >/dev/null 2>&1 || { printf '%s\n' 'unzip is required' >&2; exit 1; }
[[ "$(go version)" == 'go version go1.26.0 '* ]] || { printf '%s\n' 'Go 1.26.0 is required for reproducible proxy assets' >&2; exit 1; }

archive="$build_root/upstream.zip"
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  --retry 3 --retry-delay 1 --retry-connrefused --output "$archive" "$source_url"
actual=$(sha256sum "$archive" | awk '{print tolower($1)}')
[[ "$actual" == "$upstream_sha256" ]] || { printf '%s\n' 'CLIProxyAPI source archive checksum mismatch' >&2; exit 1; }
unzip -q "$archive" -d "$build_root"
source_root="$build_root/CLIProxyAPI-$upstream_version"
[[ -f "$source_root/go.mod" ]] || { printf '%s\n' 'CLIProxyAPI source archive has an unexpected layout' >&2; exit 1; }
git -C "$source_root" apply "$root/patches/0001-fix-continue-Codex-reasoning-only-incomplete-respons.patch"

(
  cd "$source_root"
  go test ./internal/runtime/executor -run 'TestCodexExecutorExecute(Stream)?ContinuesReasoningOnlyIncomplete|TestDoCodexRequestWithTransportRetry' -count=1
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
node "$root/scripts/check-proxy-assets.mjs" "$output_root"
