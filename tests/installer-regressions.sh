#!/usr/bin/env bash
set -euo pipefail

readonly root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)"
temporary="$(mktemp -d "${TMPDIR:-/tmp}/gicc-installer-test.XXXXXX")"
temporary=$(CDPATH= cd -- "$temporary" && pwd -P)
readonly temporary
trap 'rm -rf "$temporary"' EXIT
readonly home="$temporary/home"
readonly config="$home/.config/gpt-in-claude-code"
readonly fake_bin="$temporary/bin"
readonly real_stat="$(command -v stat)"
mkdir -p "$config/bin" "$home/.codex" "$fake_bin"
mkdir -p "$home/.local/bin"
chmod 0777 "$home/.local/bin"
if [[ "$(uname -s)" == Darwin ]]; then
  chmod +a 'everyone allow delete_child' "$home/.local/bin"
fi

cat > "$home/.codex/auth.json" <<'EOF'
{"auth_mode":"chatgpt","tokens":{"access_token":"test-access","refresh_token":"test-refresh","account_id":"test-account"}}
EOF
cat > "$fake_bin/codex" <<'EOF'
#!/usr/bin/env bash
if [[ "${1:-}" == -c && "${2:-}" == 'cli_auth_credentials_store="file"' && "${3:-}" == login && "${4:-}" == status ]]; then exit 0; fi
if [[ "${1:-}" == -c && "${2:-}" == 'cli_auth_credentials_store="file"' && "${3:-}" == login ]]; then
  [[ -z "${FAKE_CODEX_LOGIN_LOG:-}" ]] || printf '%s\n' login >> "$FAKE_CODEX_LOGIN_LOG"
  exit 0
fi
exit 2
EOF
cat > "$fake_bin/claude" <<'EOF'
#!/usr/bin/env bash
[[ "${1:-}" != update ]] || exit 0
exit 0
EOF
cat > "$fake_bin/stat" <<'EOF'
#!/usr/bin/env bash
if [[ "${1:-}" == -f && "${2:-}" == '%Lp' ]]; then
  # GNU stat accepts this BSD-shaped invocation as a filesystem report and
  # exits zero. The installer must reject the multiline output rather than
  # treating command success as proof that it received a permission mode.
  printf '%s\n' '  File: "/fixture"' '    ID: fixture Namelen: 255 Type: overlayfs' '700'
  exit 0
fi
if [[ "${1:-}" == -c && "${2:-}" == '%a' ]]; then
  mode=$("$GICC_TEST_REAL_STAT" -c '%a' "$3" 2>/dev/null || \
    "$GICC_TEST_REAL_STAT" -f '%Lp' "$3" 2>/dev/null || true)
  [[ "$mode" =~ ^[0-7]{3,4}$ ]] || exit 1
  printf '%s\n' "$mode"
  exit 0
fi
exec "$GICC_TEST_REAL_STAT" "$@"
EOF
cat > "$config/bin/gicc-proxy" <<'EOF'
#!/usr/bin/env bash
[[ "${1:-}" == -version ]] && { printf '%s\n' 'Version: 7.2.91-gicc.2'; exit 0; }
exit 0
EOF
chmod +x "$fake_bin/codex" "$fake_bin/claude" "$fake_bin/stat" "$config/bin/gicc-proxy"

directory_mode() {
  local directory="$1" mode
  mode=$(stat -c '%a' "$directory" 2>/dev/null || true)
  if [[ ! "$mode" =~ ^[0-7]{3,4}$ ]]; then mode=$(stat -f '%Lp' "$directory" 2>/dev/null || true); fi
  [[ "$mode" =~ ^[0-7]{3,4}$ ]]
  printf '%s\n' "$mode"
}

installer_env=(
  HOME="$home"
  PATH="$fake_bin:$PATH"
  GICC_CLAUDEX_SHIM=force
  GICC_SKIP_DEPENDENCY_INSTALL=1
  GICC_SKIP_SERVICE_START=1
  GICC_TEST_REAL_STAT="$real_stat"
)
misleading_bsd_probe=$(env PATH="$fake_bin:$PATH" GICC_TEST_REAL_STAT="$real_stat" \
  stat -f '%Lp' "$home/.local/bin")
[[ "$misleading_bsd_probe" == *'Type: overlayfs'* && "$misleading_bsd_probe" == *$'\n700' ]]
env "${installer_env[@]}" GICC_PROXY_TOKEN=stable-installer-token "$root/install.sh" >/dev/null
[[ -x "$home/.local/bin/claudex" ]]
grep -F 'GICC compatibility shim for gpt-in-claude-code' "$home/.local/bin/claudex" >/dev/null
jq -e '.claudexShim == true' "$config/install.json" >/dev/null
direct_bin_mode=$(directory_mode "$home/.local/bin")
[[ "$direct_bin_mode" == 700 ]]
if [[ "$(uname -s)" == Darwin ]]; then
  ! ls -lde "$home/.local/bin" | grep -F 'everyone:allow:delete_child' >/dev/null
fi

# A previously managed target remains managed when another claudex command is
# also present earlier on PATH. Updates must not lose rollback ownership.
printf '%s\n' '#!/usr/bin/env bash' 'printf external-path-claudex' > "$fake_bin/claudex"
chmod +x "$fake_bin/claudex"
env "${installer_env[@]}" GICC_CLAUDEX_SHIM=auto GICC_PROXY_TOKEN=stable-installer-token \
  "$root/install.sh" >/dev/null
grep -F 'GICC compatibility shim for gpt-in-claude-code' "$home/.local/bin/claudex" >/dev/null
[[ "$("$fake_bin/claudex")" == external-path-claudex ]]
jq -e '.claudexShim == true' "$config/install.json" >/dev/null
rm -f "$fake_bin/claudex"

# Auto mode never replaces a caller owned command at the requested target.
# Force remains an explicit recovery path after the caller reviews it.
printf '%s\n' '#!/usr/bin/env bash' 'printf external-claudex' > "$home/.local/bin/claudex"
chmod +x "$home/.local/bin/claudex"
env "${installer_env[@]}" GICC_CLAUDEX_SHIM=auto GICC_PROXY_TOKEN=stable-installer-token \
  "$root/install.sh" >"$temporary/claudex-collision.out" 2>"$temporary/claudex-collision.err"
[[ "$("$home/.local/bin/claudex")" == external-claudex ]]
grep -F 'existing non-GICC claudex command detected' "$temporary/claudex-collision.err" >/dev/null
jq -e '.claudexShim == false' "$config/install.json" >/dev/null
env "${installer_env[@]}" GICC_CLAUDEX_SHIM=off GICC_PROXY_TOKEN=stable-installer-token "$root/install.sh" >/dev/null
[[ "$("$home/.local/bin/claudex")" == external-claudex ]]
env "${installer_env[@]}" GICC_PROXY_TOKEN=stable-installer-token "$root/install.sh" >/dev/null
grep -F 'GICC compatibility shim for gpt-in-claude-code' "$home/.local/bin/claudex" >/dev/null
jq -e '.claudexShim == true' "$config/install.json" >/dev/null
env "${installer_env[@]}" GICC_CLAUDEX_SHIM=off GICC_PROXY_TOKEN=stable-installer-token "$root/install.sh" >/dev/null
[[ ! -e "$home/.local/bin/claudex" ]]
jq -e '.claudexShim == false' "$config/install.json" >/dev/null
env "${installer_env[@]}" GICC_PROXY_TOKEN=stable-installer-token "$root/install.sh" >/dev/null

# Reinstalling must replace every shell-valid spelling of a managed assignment,
# not leave an exported/indented duplicate that wins when the env file is
# sourced later. The explicit repair token must remain identical in both the
# shell env and the generated proxy YAML.
cat >> "$config/env" <<EOF
  export GICC_PROXY_TOKEN=stale-export-token
	export GICC_PROXY_URL=http://127.0.0.1:8318
 export GICC_PROXY_CONFIG=$config/cliproxyapi.yaml
    GICC_PROXY_BIN=$config/bin/gicc-proxy
	GICC_CODEX_AUTH_DIR=$config/codex-accounts
 export GICC_NODE_BIN=$temporary/stale-node
PRESERVE_UNMANAGED_SETTING=yes
EOF
env "${installer_env[@]}" GICC_PROXY_TOKEN=stable-installer-token "$root/install.sh" >/dev/null
for managed_name in GICC_PROXY_TOKEN GICC_PROXY_URL GICC_PROXY_CONFIG GICC_PROXY_BIN GICC_CODEX_AUTH_DIR; do
  assignment_count=$(awk -v name="$managed_name" '
    $0 ~ "^[[:space:]]*(export[[:space:]]+)?" name "[[:space:]]*=" { count++ }
    END { print count + 0 }
  ' "$config/env")
  [[ "$assignment_count" == 1 ]]
done
! grep -Eq '^[[:space:]]*(export[[:space:]]+)?GICC_NODE_BIN[[:space:]]*=' "$config/env"
grep -Fx 'PRESERVE_UNMANAGED_SETTING=yes' "$config/env" >/dev/null
env_token=$(HOME="$home" bash -c 'source "$1"; printf %s "$GICC_PROXY_TOKEN"' bash "$config/env")
yaml_token=$(awk '/^api-keys:$/ { getline; sub(/^[[:space:]]*-[[:space:]]*/, ""); gsub(/^"|"$/, ""); print; exit }' "$config/cliproxyapi.yaml")
[[ "$env_token" == stable-installer-token && "$yaml_token" == "$env_token" ]]
! grep -F 'stale-export-token' "$config/env" "$config/cliproxyapi.yaml" >/dev/null

# A second reinstall without caller overrides must remain idempotent and retain
# the same single effective assignment and proxy credential.
env "${installer_env[@]}" "$root/install.sh" >/dev/null
[[ "$(awk '/^[[:space:]]*(export[[:space:]]+)?GICC_PROXY_TOKEN[[:space:]]*=/ { count++ } END { print count + 0 }' "$config/env")" == 1 ]]
env_token=$(HOME="$home" bash -c 'source "$1"; printf %s "$GICC_PROXY_TOKEN"' bash "$config/env")
yaml_token=$(awk '/^api-keys:$/ { getline; sub(/^[[:space:]]*-[[:space:]]*/, ""); gsub(/^"|"$/, ""); print; exit }' "$config/cliproxyapi.yaml")
[[ "$env_token" == stable-installer-token && "$yaml_token" == "$env_token" ]]

login_log="$temporary/login.log"
env "${installer_env[@]}" FAKE_CODEX_LOGIN_LOG="$login_log" "$root/install.sh" --login >/dev/null
[[ "$(wc -l < "$login_log" | tr -d ' ')" == 1 ]]

env_before=$(<"$config/env")
proxy_before=$(<"$config/cliproxyapi.yaml")
printf '%s\n' prior-statusline > "$config/statusline"
if env "${installer_env[@]}" GICC_PROXY_TOKEN=must-not-survive GICC_INSTALL_METHOD=invalid \
    "$root/install.sh" >"$temporary/rollback.out" 2>"$temporary/rollback.err"; then
  printf '%s\n' 'expected late direct-installer failure' >&2
  exit 1
fi
grep -F 'restored the previous managed installation' "$temporary/rollback.err" >/dev/null
[[ "$(<"$config/env")" == "$env_before" ]]
[[ "$(<"$config/cliproxyapi.yaml")" == "$proxy_before" ]]
[[ "$(<"$config/statusline")" == prior-statusline ]]

# POSIX launcher paths may contain tabs and newlines. A late failure must
# restore them byte for byte through the versioned transaction journal.
newline_bin="$temporary/newline"$'\t'"launcher-bin"$'\n'
env "${installer_env[@]}" GICC_BIN_DIR="$newline_bin" GICC_PROXY_TOKEN=stable-installer-token \
  "$root/install.sh" >/dev/null
printf '%s\n' newline-launcher-sentinel > "$newline_bin/gicc"
cp -p "$newline_bin/gicc" "$temporary/newline-launcher.expected"
if env "${installer_env[@]}" GICC_BIN_DIR="$newline_bin" GICC_PROXY_TOKEN=must-not-survive \
    GICC_INSTALL_METHOD=invalid "$root/install.sh" \
    >"$temporary/newline-rollback.out" 2>"$temporary/newline-rollback.err"; then
  printf '%s\n' 'expected late installer failure for newline launcher directory' >&2
  exit 1
fi
grep -F 'restored the previous managed installation' "$temporary/newline-rollback.err" >/dev/null
cmp -s "$temporary/newline-launcher.expected" "$newline_bin/gicc"
[[ -z "$(find "$config" -maxdepth 1 -name '.install-transaction.*' -print -quit)" ]]

# Return the shared fixture to its default launcher target before exercising
# durable recovery from a legacy tab-delimited journal below.
env "${installer_env[@]}" GICC_PROXY_TOKEN=stable-installer-token "$root/install.sh" >/dev/null

transaction="$config/.install-transaction.crash-test"
mkdir -p "$transaction/backup"
targets=(
  "$home/.local/bin/gicc" "$config/env" "$config/cliproxyapi.yaml" "$config/bin/gicc-proxy"
  "$config/settings.json" "$config/statusline" "$config/usage-limit" "$config/codex-session"
  "$config/preload.cjs" "$config/skill-bridge.cjs" "$config/gicc-runtime.mjs" "$config/self-update"
  "$config/skills/usage-limit/SKILL.md" "$config/install.json" "$home/.local/bin/claudex"
)
: > "$transaction/manifest"
for index in "${!targets[@]}"; do
  target=${targets[$index]}
  if [[ -f "$target" ]]; then
    cp -p "$target" "$transaction/backup/$index"
    printf '1\t%s\n' "$target" >> "$transaction/manifest"
  else
    printf '0\t%s\n' "$target" >> "$transaction/manifest"
  fi
done
printf '%s\n' committing > "$transaction/state"
printf '%s\n' 'GICC_PROXY_TOKEN=crash-corruption' > "$config/env"
printf '%s\n' '#!/usr/bin/env bash' 'printf interrupted-claudex' > "$home/.local/bin/claudex"
chmod +x "$home/.local/bin/claudex"
recovery_output=$(env "${installer_env[@]}" GICC_CLAUDEX_SHIM=auto "$root/install.sh")
[[ "$recovery_output" == *'Recovered the previous interrupted GICC installation'* ]]
grep -F 'GICC_PROXY_TOKEN=stable-installer-token' "$config/env" >/dev/null
grep -F 'GICC compatibility shim for gpt-in-claude-code' "$home/.local/bin/claudex" >/dev/null
jq -e '.claudexShim == true' "$config/install.json" >/dev/null
[[ ! -e "$transaction" ]]

managed_home="$temporary/managed-home"
managed_config="$managed_home/.config/gpt-in-claude-code"
managed_bin="$temporary/managed-bin"
node_fixture="$temporary/node-fixture"
mkdir -p "$managed_config/bin" "$managed_home/.codex" "$managed_bin" "$node_fixture/bin"
cp "$home/.codex/auth.json" "$managed_home/.codex/auth.json"
ln -s "$fake_bin/codex" "$managed_bin/codex"
ln -s "$fake_bin/claude" "$managed_bin/claude"
ln -s "$(command -v jq)" "$managed_bin/jq"
cat > "$managed_bin/node" <<'EOF'
#!/usr/bin/env bash
[[ "${1:-}" == --version ]] && { printf '%s\n' v16.20.2; exit 0; }
exit 1
EOF
cat > "$node_fixture/bin/node" <<EOF
#!/usr/bin/env bash
exec "$(command -v node)" "\$@"
EOF
cat > "$node_fixture/bin/npm" <<EOF
#!/usr/bin/env bash
exec "$(command -v npm)" "\$@"
EOF
cat > "$managed_config/bin/gicc-proxy" <<'EOF'
#!/usr/bin/env bash
[[ "${1:-}" == -version ]] && { printf '%s\n' 'Version: 7.2.91-gicc.2'; exit 0; }
exit 0
EOF
cat > "$managed_config/install.json" <<EOF
{"schema":1,"version":"1.4.4","method":"archive","binDir":"$managed_home/.local/bin","repository":"DrPei12/gpt-in-claude-code"}
EOF
chmod +x "$managed_bin/node" "$node_fixture/bin/node" "$node_fixture/bin/npm" "$managed_config/bin/gicc-proxy"
HOME="$managed_home" PATH="$managed_bin:/usr/bin:/bin" GICC_CONFIG_DIR="$managed_config" \
  GICC_INSTALL_METHOD=archive GICC_PROXY_TOKEN=managed-node-token \
  GICC_SKIP_DEPENDENCY_INSTALL=1 GICC_SKIP_SERVICE_START=1 \
  GICC_TEST_MODE=1 GICC_TEST_MANAGED_NODE_DIR="$node_fixture" "$root/install.sh" >/dev/null
[[ -x "$managed_config/node/bin/node" ]]
grep -F "GICC_NODE_BIN=$managed_config/node/bin" "$managed_config/env" >/dev/null

grep -F -- '--retry-connrefused' "$root/install.sh" >/dev/null
grep -F 'download_with_retry "$claude_installer"' "$root/install.sh" >/dev/null
grep -F 'download_with_retry "$archive" "$url"' "$root/install.sh" >/dev/null

# An explicitly selected direct/archive launcher directory is protected before
# publication, including removal of inherited macOS ACL entries.
custom_direct_bin="$temporary/custom-direct-bin"
mkdir -p "$custom_direct_bin"
chmod 0777 "$custom_direct_bin"
if [[ "$(uname -s)" == Darwin ]]; then
  chmod +a 'everyone allow delete_child' "$custom_direct_bin"
fi
env "${installer_env[@]}" GICC_BIN_DIR="$custom_direct_bin" GICC_INSTALL_METHOD=archive \
  "$root/install.sh" >/dev/null
custom_direct_mode=$(directory_mode "$custom_direct_bin")
[[ "$custom_direct_mode" == 700 ]]
if [[ "$(uname -s)" == Darwin ]]; then
  ! ls -lde "$custom_direct_bin" | grep -F 'everyone:allow:delete_child' >/dev/null
fi

# Package-manager bin directories are owned by the package manager and must
# retain their existing policy instead of being made private by GICC.
package_bin="$temporary/package-bin"
mkdir -p "$package_bin"
chmod 0755 "$package_bin"
env "${installer_env[@]}" GICC_BIN_DIR="$package_bin" GICC_INSTALL_METHOD=homebrew \
  GICC_PACKAGE_ROOT="$root" GICC_CLAUDEX_SHIM=auto "$root/install.sh" >/dev/null
package_bin_mode=$(directory_mode "$package_bin")
[[ "$package_bin_mode" == 755 ]]
[[ ! -e "$package_bin/claudex" ]]

# Relative installer roots are anchored to the invocation directory before
# locks, receipts, or managed files are created. The resulting installation
# remains usable after the caller changes directories.
relative_cwd="$temporary/relative-install-cwd"
mkdir -p "$relative_cwd/relative-config/bin" "$relative_cwd/elsewhere" "$relative_cwd/irrelevant"
relative_cwd=$(CDPATH= cd -- "$relative_cwd" && pwd -P)
relative_config="$relative_cwd/relative-config"
relative_bin="$relative_cwd/relative-bin"
cp "$config/bin/gicc-proxy" "$relative_config/bin/gicc-proxy"
(
  cd "$relative_cwd"
  env "${installer_env[@]}" GICC_CONFIG_DIR='irrelevant/../relative-config///' \
    GICC_BIN_DIR='irrelevant/../relative-bin///' \
    GICC_PROXY_TOKEN=relative-installer-token "$root/install.sh" >/dev/null
)
jq -e --arg bin "$relative_bin" '.binDir == $bin' "$relative_config/install.json" >/dev/null
grep -F "GICC_PROXY_CONFIG=$relative_config/cliproxyapi.yaml" "$relative_config/env" >/dev/null
rmdir "$relative_cwd/irrelevant"
printf '%s\n' relative-dot-segment-sentinel > "$relative_bin/gicc"
cp -p "$relative_bin/gicc" "$temporary/relative-dot-segment.expected"
if (
  cd "$relative_cwd"
  env "${installer_env[@]}" GICC_CONFIG_DIR='./relative-config/.' \
    GICC_BIN_DIR='relative-bin/../relative-bin//' GICC_INSTALL_METHOD=invalid \
    GICC_PROXY_TOKEN=must-not-survive "$root/install.sh" \
    >"$temporary/relative-dot-segment.out" 2>"$temporary/relative-dot-segment.err"
); then
  printf '%s\n' 'expected late installer failure through equivalent normalized roots' >&2
  exit 1
fi
grep -F 'restored the previous managed installation' "$temporary/relative-dot-segment.err" >/dev/null
cmp -s "$temporary/relative-dot-segment.expected" "$relative_bin/gicc"
[[ -z "$(find "$relative_config" -maxdepth 1 -name '.install-transaction.*' -print -quit)" ]]
(
  cd "$relative_cwd"
  env "${installer_env[@]}" GICC_CONFIG_DIR='./relative-config/.' \
    GICC_BIN_DIR='relative-bin/../relative-bin//' GICC_PROXY_TOKEN=relative-installer-token \
    "$root/install.sh" >/dev/null
)
relative_status=$(
  cd "$relative_cwd/elsewhere"
  env "${installer_env[@]}" GICC_CONFIG_DIR="$relative_config" \
    "$relative_bin/gicc" self-update --status
)
[[ "$relative_status" == *'Install method: git'* ]]

# A deleted invocation directory cannot safely anchor relative install roots.
# Fail before deriving a root-relative launcher or config path.
deleted_cwd="$temporary/deleted-install-cwd"
mkdir -p "$deleted_cwd"
if (
  cd "$deleted_cwd"
  rmdir "$deleted_cwd"
  env "${installer_env[@]}" GICC_CONFIG_DIR='deleted-relative-config' \
    GICC_BIN_DIR='deleted-relative-bin' GICC_PROXY_TOKEN=must-not-survive \
    "$root/install.sh" >"$temporary/deleted-cwd.out" 2>"$temporary/deleted-cwd.err"
); then
  printf '%s\n' 'expected installer to reject relative roots from a deleted working directory' >&2
  exit 1
fi
grep -F 'install.sh: could not determine the absolute installer invocation directory' \
  "$temporary/deleted-cwd.err" >/dev/null

# Cross-platform source checks enforce the Windows installer ACL policy even on
# Unix CI: direct/archive bin directories are private, while package-manager
# shim directories retain their package-owned ACLs.
node "$root/tests/windows-installer-private-state.test.cjs"

printf '%s\n' 'installer regressions passed'
