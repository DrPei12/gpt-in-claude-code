#!/usr/bin/env bash
set -euo pipefail

readonly root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)"
readonly temporary="$(mktemp -d "${TMPDIR:-/tmp}/gicc-self-update-test.XXXXXX")"
trap 'rm -rf "$temporary"' EXIT
readonly home="$temporary/home"
readonly config="$home/.config/gpt-in-claude-code"
readonly fixtures="$temporary/fixtures"
readonly fake_bin="$temporary/bin"
mkdir -p "$config" "$fixtures" "$fake_bin"

cat > "$config/install.json" <<'EOF'
{"schema":1,"version":"1.3.1","method":"homebrew","binDir":"/tmp/unused","repository":"DrPei12/gpt-in-claude-code"}
EOF
cat > "$fixtures/release.json" <<'EOF'
{"tag_name":"v1.3.2","draft":false,"prerelease":false}
EOF

cat > "$fake_bin/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
output="" url=""
while (( $# > 0 )); do
  case "$1" in --output) output="$2"; shift ;; http*) url="$1" ;; esac
  shift
done
[[ -n "$output" && -n "$url" ]]
if [[ "${FAKE_CURL_FAIL:-0}" == 1 ]]; then exit 7; fi
[[ -z "${FAKE_CURL_CALL_LOG:-}" ]] || printf '%s\n' "$url" >> "$FAKE_CURL_CALL_LOG"
case "$url" in
  */releases/latest) cp "$FAKE_FIXTURES/release.json" "$output" ;;
  */SHA256SUMS) cp "$FAKE_FIXTURES/SHA256SUMS" "$output" ;;
  *.tar.gz) cp "$FAKE_FIXTURES/release.tar.gz" "$output" ;;
  *) exit 22 ;;
esac
printf '%s' "$url"
EOF
cat > "$fake_bin/brew" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$FAKE_BREW_LOG"
EOF
cat > "$fake_bin/gicc" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
case "${1:-}" in
  --package-version) printf '%s\n' 1.3.2 ;;
  --package-setup)
    temporary="$GICC_CONFIG_DIR/.install.json.$$"
    jq '.version = "1.3.2"' "$GICC_CONFIG_DIR/install.json" > "$temporary"
    mv -f "$temporary" "$GICC_CONFIG_DIR/install.json"
    ;;
  *) exit 2 ;;
esac
EOF
chmod +x "$fake_bin/curl" "$fake_bin/brew" "$fake_bin/gicc"

export HOME="$home" PATH="$fake_bin:$PATH" GICC_CONFIG_DIR="$config" GICC_CURL_BIN="$fake_bin/curl"
export FAKE_FIXTURES="$fixtures" FAKE_BREW_LOG="$temporary/brew.log"

# The updater lock must identify a specific owner generation, not only a PID.
# These source-level assertions fail on the historical PID-only lock before the
# adversarial runtime cases below exercise the complete publication protocol.
grep -F 'generation_nonce=' "$root/self-update" >/dev/null
grep -F 'identity=' "$root/self-update" >/dev/null
grep -F 'publish_lock_file' "$root/self-update" >/dev/null
grep -F 'quarantine' "$root/self-update" >/dev/null
grep -F 'function Publish-UpdateLockFile' "$root/self-update.ps1" >/dev/null
grep -F 'identity=' "$root/self-update.ps1" >/dev/null
grep -F 'generation' "$root/self-update.ps1" >/dev/null
grep -F 'quarantine' "$root/self-update.ps1" >/dev/null
grep -F 'legacy update lock owner appeared during publication' "$root/self-update.ps1" >/dev/null
grep -F 'function Test-LegacyUpdateLockOwnerValid' "$root/self-update.ps1" >/dev/null
grep -F 'function Get-UpdateLockDirectoryIdentity' "$root/self-update.ps1" >/dev/null
grep -F 'update lock directory changed during publication' "$root/self-update.ps1" >/dev/null
grep -F 'function Get-UpdateCompatibilityOwnerToken' "$root/self-update.ps1" >/dev/null
grep -F "Publish-UpdateLockFile \$compatibilityTemporary (Join-Path \$script:LockPath 'owner.json')" "$root/self-update.ps1" >/dev/null

check_output=$("$root/self-update" --check)
[[ "$check_output" == *'GICC 1.3.2 is available'* ]]
jq -e '.currentVersion == "1.3.1" and .availableVersion == "1.3.2" and .failureCount == 0' \
  "$config/update/gicc/state.json" >/dev/null

status_output=$("$root/self-update" --status)
[[ "$status_output" == *'GICC: 1.3.1'* && "$status_output" == *'Install method: homebrew'* && "$status_output" == *'Available: 1.3.2'* ]]

wait_for_file() {
  local path="$1" attempt
  for attempt in {1..500}; do [[ -e "$path" ]] && return 0; sleep 0.02; done
  printf 'timed out waiting for %s\n' "$path" >&2
  return 1
}

lock="$config/update/gicc/lock"
lock_base=(GICC_TEST_MODE=1 GICC_TEST_PROCESS_IDENTITY=self-update-test-identity GICC_TEST_UPDATE_LOCK_ATTEMPTS=12)

# A creator paused after mkdir cannot publish into a replacement B generation.
rm -rf "$lock" "$lock".quarantine.*
env "${lock_base[@]}" \
  GICC_TEST_UPDATE_LOCK_AFTER_MKDIR_READY="$temporary/aba-a-ready" \
  GICC_TEST_UPDATE_LOCK_AFTER_MKDIR_CONTINUE="$temporary/aba-a-continue" \
  "$root/self-update" --check >"$temporary/aba-a.stdout" 2>"$temporary/aba-a.stderr" &
aba_a=$!
wait_for_file "$temporary/aba-a-ready"
touch -t 200001010000 "$lock"
env "${lock_base[@]}" \
  GICC_TEST_UPDATE_LOCK_AFTER_PUBLISH_READY="$temporary/aba-b-ready" \
  GICC_TEST_UPDATE_LOCK_AFTER_PUBLISH_CONTINUE="$temporary/aba-b-continue" \
  "$root/self-update" --check >"$temporary/aba-b.stdout" 2>"$temporary/aba-b.stderr" &
aba_b=$!
wait_for_file "$temporary/aba-b-ready"
aba_b_nonce=$(awk -F= '$1 == "nonce" { print $2; exit }' "$lock/owner")
: > "$temporary/aba-a-continue"
wait "$aba_a"
[[ "$(awk -F= '$1 == "nonce" { print $2; exit }' "$lock/owner")" == "$aba_b_nonce" ]]
: > "$temporary/aba-b-continue"
wait "$aba_b"
[[ ! -e "$lock" ]] && ! compgen -G "$lock.quarantine.*" >/dev/null

# A creator from the new protocol can resume after an old-format B replaced
# its empty directory. Its partial generation must be withdrawn without
# deleting B's plain-PID owner record.
rm -rf "$lock" "$lock".quarantine.* "$temporary/mixed-a-curl"
env "${lock_base[@]}" FAKE_CURL_CALL_LOG="$temporary/mixed-a-curl" \
  GICC_TEST_UPDATE_LOCK_AFTER_MKDIR_READY="$temporary/mixed-a-ready" \
  GICC_TEST_UPDATE_LOCK_AFTER_MKDIR_CONTINUE="$temporary/mixed-a-continue" \
  "$root/self-update" --check >"$temporary/mixed-a.stdout" 2>"$temporary/mixed-a.stderr" &
mixed_a=$!
wait_for_file "$temporary/mixed-a-ready"
mv "$lock" "$config/update/gicc/abandoned-mixed-a"
mkdir "$lock"
printf '%s\n' "$$" > "$lock/owner"
rm -rf "$config/update/gicc/abandoned-mixed-a"
: > "$temporary/mixed-a-continue"
wait "$mixed_a"
[[ "$(<"$lock/owner")" == "$$" ]]
[[ ! -e "$lock/generation" && ! -e "$temporary/mixed-a-curl" ]]
! compgen -G "$lock.quarantine.*" >/dev/null
rm -rf "$lock"

# Directory identity closes the earlier old-B publication window: B can
# replace A's directory and pause before writing its legacy owner record, and A
# still must not publish into or delete B's empty replacement directory.
env "${lock_base[@]}" FAKE_CURL_CALL_LOG="$temporary/empty-b-curl" \
  GICC_TEST_UPDATE_LOCK_AFTER_MKDIR_READY="$temporary/empty-b-ready" \
  GICC_TEST_UPDATE_LOCK_AFTER_MKDIR_CONTINUE="$temporary/empty-b-continue" \
  "$root/self-update" --check >"$temporary/empty-b.stdout" 2>"$temporary/empty-b.stderr" &
empty_b_a=$!
wait_for_file "$temporary/empty-b-ready"
mv "$lock" "$config/update/gicc/abandoned-empty-b-a"
mkdir "$lock"
rm -rf "$config/update/gicc/abandoned-empty-b-a"
: > "$temporary/empty-b-continue"
wait "$empty_b_a"
[[ -d "$lock" && ! -e "$lock/generation" && ! -e "$lock/owner" && ! -e "$temporary/empty-b-curl" ]]
printf '%s\n' "$$" > "$lock/owner"
[[ "$(<"$lock/owner")" == "$$" ]]
rm -rf "$lock"

# Crash recovery must apply the same mixed-version rule. A quarantine left
# with A's generation and a live plain-PID B owner restores B, not deletes it.
mixed_barrier="$lock.quarantine.synthetic-live-legacy"
mkdir "$mixed_barrier"
printf '%s\n' injected-a > "$mixed_barrier/generation"
printf '%s\n' "$$" > "$mixed_barrier/owner"
touch -t 200001010000 "$mixed_barrier"
env "${lock_base[@]}" FAKE_CURL_CALL_LOG="$temporary/mixed-barrier-curl" \
  "$root/self-update" --check >/dev/null
[[ "$(<"$lock/owner")" == "$$" ]]
[[ ! -e "$lock/generation" && ! -e "$temporary/mixed-barrier-curl" ]]
! compgen -G "$lock.quarantine.*" >/dev/null
rm -rf "$lock"

# X may precheck a dead generation, but if Y acquires before X renames then the
# moved Y generation becomes an acquisition barrier. Z cannot enter, and X
# must restore exactly the nonce it actually moved.
rm -rf "$lock" "$lock".quarantine.*
mkdir "$lock"
printf '%s\n' x > "$lock/generation"
printf 'pid=99999999\nidentity=dead\nnonce=x\n' > "$lock/owner"
touch -t 200001010000 "$lock"
env "${lock_base[@]}" \
  GICC_TEST_UPDATE_LOCK_BEFORE_RENAME_READY="$temporary/aba-x-before" \
  GICC_TEST_UPDATE_LOCK_BEFORE_RENAME_CONTINUE="$temporary/aba-x-before-continue" \
  GICC_TEST_UPDATE_LOCK_AFTER_RENAME_READY="$temporary/aba-x-after" \
  GICC_TEST_UPDATE_LOCK_AFTER_RENAME_CONTINUE="$temporary/aba-x-after-continue" \
  "$root/self-update" --check >"$temporary/aba-x.stdout" 2>"$temporary/aba-x.stderr" &
aba_x=$!
wait_for_file "$temporary/aba-x-before"
env "${lock_base[@]}" \
  GICC_TEST_UPDATE_LOCK_AFTER_PUBLISH_READY="$temporary/aba-y-ready" \
  GICC_TEST_UPDATE_LOCK_AFTER_PUBLISH_CONTINUE="$temporary/aba-y-continue" \
  "$root/self-update" --check >"$temporary/aba-y.stdout" 2>"$temporary/aba-y.stderr" &
aba_y=$!
wait_for_file "$temporary/aba-y-ready"
aba_y_nonce=$(awk -F= '$1 == "nonce" { print $2; exit }' "$lock/owner")
: > "$temporary/aba-x-before-continue"
wait_for_file "$temporary/aba-x-after"
env "${lock_base[@]}" FAKE_CURL_CALL_LOG="$temporary/aba-z-curl" \
  "$root/self-update" --check >"$temporary/aba-z.stdout" 2>"$temporary/aba-z.stderr"
[[ ! -e "$temporary/aba-z-curl" ]]
if [[ -r "$lock/owner" ]]; then grep -F "nonce=$aba_y_nonce" "$lock/owner" >/dev/null
else grep -R -F "nonce=$aba_y_nonce" "$lock".quarantine.*/* >/dev/null; fi
: > "$temporary/aba-x-after-continue"
for _ in {1..500}; do
  [[ -r "$lock/owner" ]] && [[ "$(awk -F= '$1 == "nonce" { print $2; exit }' "$lock/owner")" == "$aba_y_nonce" ]] && break
  sleep 0.02
done
[[ "$(awk -F= '$1 == "nonce" { print $2; exit }' "$lock/owner")" == "$aba_y_nonce" ]]
: > "$temporary/aba-y-continue"
wait "$aba_y"
wait "$aba_x"
[[ ! -e "$lock" ]] && ! compgen -G "$lock.quarantine.*" >/dev/null

# If X pauses after moving Y, Y recognizes its exact nonce in quarantine,
# restores itself, finishes, and releases only its own generation.
rm -rf "$lock" "$lock".quarantine.*
mkdir "$lock"
printf '%s\n' x-self > "$lock/generation"
printf 'pid=99999999\nidentity=dead\nnonce=x-self\n' > "$lock/owner"
touch -t 200001010000 "$lock"
env "${lock_base[@]}" \
  GICC_TEST_UPDATE_LOCK_BEFORE_RENAME_READY="$temporary/self-x-before" \
  GICC_TEST_UPDATE_LOCK_BEFORE_RENAME_CONTINUE="$temporary/self-x-before-continue" \
  GICC_TEST_UPDATE_LOCK_AFTER_RENAME_READY="$temporary/self-x-after" \
  GICC_TEST_UPDATE_LOCK_AFTER_RENAME_CONTINUE="$temporary/self-x-after-continue" \
  "$root/self-update" --check >"$temporary/self-x.stdout" 2>"$temporary/self-x.stderr" &
self_x=$!
wait_for_file "$temporary/self-x-before"
env "${lock_base[@]}" \
  GICC_TEST_UPDATE_LOCK_AFTER_PUBLISH_READY="$temporary/self-y-ready" \
  GICC_TEST_UPDATE_LOCK_AFTER_PUBLISH_CONTINUE="$temporary/self-y-continue" \
  GICC_TEST_UPDATE_LOCK_SELF_RECOVERED_FILE="$temporary/self-y-recovered" \
  "$root/self-update" --check >"$temporary/self-y.stdout" 2>"$temporary/self-y.stderr" &
self_y=$!
wait_for_file "$temporary/self-y-ready"
: > "$temporary/self-x-before-continue"
wait_for_file "$temporary/self-x-after"
: > "$temporary/self-y-continue"
wait_for_file "$temporary/self-y-recovered"
wait "$self_y"
: > "$temporary/self-x-after-continue"
wait "$self_x"
[[ ! -e "$lock" ]] && ! compgen -G "$lock.quarantine.*" >/dev/null

# A stale process exit hook cannot remove a replacement generation.
env "${lock_base[@]}" \
  GICC_TEST_UPDATE_LOCK_AFTER_PUBLISH_READY="$temporary/exit-ready" \
  GICC_TEST_UPDATE_LOCK_AFTER_PUBLISH_CONTINUE="$temporary/exit-continue" \
  "$root/self-update" --check >"$temporary/exit.stdout" 2>"$temporary/exit.stderr" &
exit_owner=$!
wait_for_file "$temporary/exit-ready"
mv "$lock" "$config/update/gicc/displaced-lock"
mkdir "$lock"
printf '%s\n' replacement > "$lock/generation"
printf 'pid=%s\nidentity=%s\nnonce=replacement\n' "$$" self-update-test-identity > "$lock/owner"
: > "$temporary/exit-continue"
wait "$exit_owner"
grep -F 'nonce=replacement' "$lock/owner" >/dev/null
rm -rf "$lock" "$config/update/gicc/displaced-lock"

# Dead owners and live reused PIDs with a mismatched start identity are both
# reclaimable. A recent legacy ownerless lock remains conservative until its
# transition threshold expires.
for stale_kind in dead reused; do
  rm -rf "$lock" "$lock".quarantine.* "$temporary/$stale_kind-curl"
  mkdir "$lock"
  printf '%s\n' "$stale_kind" > "$lock/generation"
  if [[ "$stale_kind" == dead ]]; then owner_pid=99999999; owner_identity=dead
  else owner_pid=$$; owner_identity=old-process-start; fi
  printf 'pid=%s\nidentity=%s\nnonce=%s\n' "$owner_pid" "$owner_identity" "$stale_kind" > "$lock/owner"
  touch -t 200001010000 "$lock"
  env "${lock_base[@]}" FAKE_CURL_CALL_LOG="$temporary/$stale_kind-curl" "$root/self-update" --check >/dev/null
  [[ -s "$temporary/$stale_kind-curl" && ! -e "$lock" ]]
done

# Current owners remain recognizable to the previous Bash release even after
# its stale threshold. The legacy model reads the numeric first line, while the
# current contender validates the keyed generation and start identity.
rm -rf "$lock" "$temporary/live-new-curl"
mkdir "$lock"
printf '%s\n' live-new > "$lock/generation"
printf '%s\npid=%s\nidentity=%s\nnonce=live-new\n' "$$" "$$" self-update-test-identity > "$lock/owner"
touch -t 200001010000 "$lock"
legacy_visible_pid=$(head -n 1 "$lock/owner")
[[ "$legacy_visible_pid" == "$$" ]] && kill -0 "$legacy_visible_pid" 2>/dev/null
env "${lock_base[@]}" FAKE_CURL_CALL_LOG="$temporary/live-new-curl" "$root/self-update" --check >/dev/null
[[ ! -e "$temporary/live-new-curl" && -r "$lock/owner" && -r "$lock/generation" ]]
rm -rf "$lock"

rm -rf "$lock" "$temporary/legacy-curl"
mkdir "$lock"
env "${lock_base[@]}" FAKE_CURL_CALL_LOG="$temporary/legacy-curl" "$root/self-update" --check >/dev/null
[[ ! -e "$temporary/legacy-curl" && -d "$lock" ]]
touch -t 200001010000 "$lock"
env "${lock_base[@]}" FAKE_CURL_CALL_LOG="$temporary/legacy-curl" "$root/self-update" --check >/dev/null
[[ -s "$temporary/legacy-curl" && ! -e "$lock" ]]
rm -f "$temporary/legacy-live-curl"
mkdir "$lock"
printf '%s\n' "$$" > "$lock/owner"
touch -t 200001010000 "$lock"
env "${lock_base[@]}" FAKE_CURL_CALL_LOG="$temporary/legacy-live-curl" "$root/self-update" --check >/dev/null
[[ ! -e "$temporary/legacy-live-curl" && -r "$lock/owner" ]]
rm -rf "$lock"

# Hardlink denial uses exclusive creation, while an interrupted publication
# removes only its incomplete directory and never enters the update section.
env "${lock_base[@]}" GICC_TEST_FORCE_HARDLINK_FAILURE=1 \
  FAKE_CURL_CALL_LOG="$temporary/fallback-curl" "$root/self-update" --check >/dev/null
[[ -s "$temporary/fallback-curl" && ! -e "$lock" ]] && ! compgen -G "$lock.quarantine.*" >/dev/null
env "${lock_base[@]}" GICC_TEST_FORCE_PUBLICATION_FAILURE=1 \
  FAKE_CURL_CALL_LOG="$temporary/incomplete-curl" "$root/self-update" --check >/dev/null
[[ ! -e "$temporary/incomplete-curl" && ! -e "$lock" ]] && ! compgen -G "$lock.quarantine.*" >/dev/null

# A contending updater must not fall through and apply cached state without
# owning the update lock.
mkdir -p "$config/update/gicc/lock"
printf '%s\n' "$$" > "$config/update/gicc/lock/owner"
before_manager_calls=0
[[ ! -r "$temporary/brew.log" ]] || before_manager_calls=$(wc -l < "$temporary/brew.log" | tr -d ' ')
"$root/self-update" --apply >/dev/null
after_manager_calls=0
[[ ! -r "$temporary/brew.log" ]] || after_manager_calls=$(wc -l < "$temporary/brew.log" | tr -d ' ')
[[ "$after_manager_calls" == "$before_manager_calls" ]]
rm -rf "$config/update/gicc/lock"

"$root/self-update" --apply >/dev/null
grep -Fx 'upgrade drpei12/tap/gicc' "$temporary/brew.log" >/dev/null

# A prerelease is never accepted on the stable channel.
cat > "$fixtures/release.json" <<'EOF'
{"tag_name":"v2.0.0-beta.1","draft":false,"prerelease":true}
EOF
if "$root/self-update" --check >"$temporary/prerelease.stdout" 2>"$temporary/prerelease.stderr"; then
  printf '%s\n' 'expected prerelease metadata to be rejected' >&2
  exit 1
fi

# Offline background checks are silent and write a bounded retry time instead
# of retrying on every launch.
export FAKE_CURL_FAIL=1 GICC_UPDATE_BACKGROUND=1
"$root/self-update" --check --background >"$temporary/offline.stdout" 2>"$temporary/offline.stderr" || true
[[ ! -s "$temporary/offline.stdout" && ! -s "$temporary/offline.stderr" ]]
jq -e '.failureCount >= 1 and .nextAttemptAt > .lastCheckedAt' "$config/update/gicc/state.json" >/dev/null

# Unsafe archive paths are rejected before the installer can run.
unset FAKE_CURL_FAIL GICC_UPDATE_BACKGROUND
cat > "$config/install.json" <<EOF
{"schema":1,"version":"1.3.1","method":"archive","binDir":"$temporary/install-bin","repository":"DrPei12/gpt-in-claude-code"}
EOF
cat > "$fixtures/release.json" <<'EOF'
{"tag_name":"v1.3.2","draft":false,"prerelease":false}
EOF
mkdir -p "$temporary/archive-source/gicc-1.3.2"
ln -s ../../outside "$temporary/archive-source/gicc-1.3.2/unsafe-link"
tar -czf "$fixtures/release.tar.gz" -C "$temporary/archive-source" gicc-1.3.2
if command -v sha256sum >/dev/null 2>&1; then digest=$(sha256sum "$fixtures/release.tar.gz" | awk '{print $1}')
else digest=$(shasum -a 256 "$fixtures/release.tar.gz" | awk '{print $1}'); fi
printf '%s  %s\n' "$digest" 'gicc-1.3.2.tar.gz' > "$fixtures/SHA256SUMS"
if "$root/self-update" --apply >"$temporary/unsafe.stdout" 2>"$temporary/unsafe.stderr"; then
  printf '%s\n' 'expected unsafe release archive to be rejected' >&2
  exit 1
fi
grep -F 'unsafe paths or file types' "$temporary/unsafe.stderr" >/dev/null
[[ ! -e "$temporary/payload" ]]

# A checksum-valid archive without the now-required bridge is rejected before
# any installer or managed file can run.
rm -rf "$temporary/archive-source"
mkdir -p "$temporary/archive-source/gicc-1.3.2"
printf '%s\n' '{"version":"1.3.2"}' > "$temporary/archive-source/gicc-1.3.2/package.json"
for script in install.sh gicc self-update; do
  printf '%s\n' '#!/usr/bin/env bash' 'exit 0' > "$temporary/archive-source/gicc-1.3.2/$script"
  chmod +x "$temporary/archive-source/gicc-1.3.2/$script"
done
tar -czf "$fixtures/release.tar.gz" -C "$temporary/archive-source" gicc-1.3.2
if command -v sha256sum >/dev/null 2>&1; then digest=$(sha256sum "$fixtures/release.tar.gz" | awk '{print $1}')
else digest=$(shasum -a 256 "$fixtures/release.tar.gz" | awk '{print $1}'); fi
printf '%s  %s\n' "$digest" 'gicc-1.3.2.tar.gz' > "$fixtures/SHA256SUMS"
if "$root/self-update" --apply >"$temporary/missing-bridge.stdout" 2>"$temporary/missing-bridge.stderr"; then
  printf '%s\n' 'expected release without a skill bridge to be rejected' >&2
  exit 1
fi
grep -F 'release archive is missing its skill bridge' "$temporary/missing-bridge.stderr" >/dev/null

# A release with the skill bridge but without the session runtime is rejected
# before the installer can produce a partial upgrade.
printf '%s\n' "'use strict';" > "$temporary/archive-source/gicc-1.3.2/skill-bridge.cjs"
tar -czf "$fixtures/release.tar.gz" -C "$temporary/archive-source" gicc-1.3.2
if command -v sha256sum >/dev/null 2>&1; then digest=$(sha256sum "$fixtures/release.tar.gz" | awk '{print $1}')
else digest=$(shasum -a 256 "$fixtures/release.tar.gz" | awk '{print $1}'); fi
printf '%s  %s\n' "$digest" 'gicc-1.3.2.tar.gz' > "$fixtures/SHA256SUMS"
if "$root/self-update" --apply >"$temporary/missing-runtime.stdout" 2>"$temporary/missing-runtime.stderr"; then
  printf '%s\n' 'expected release without a session runtime to be rejected' >&2
  exit 1
fi
grep -F 'release archive is missing its session runtime' "$temporary/missing-runtime.stderr" >/dev/null

# Every shipped shell entrypoint is syntax-checked as its own script. Passing
# additional paths to one `bash -n` invocation only treats them as arguments
# and previously allowed a broken launcher to be installed.
rm -rf "$temporary/archive-source"
mkdir -p "$temporary/archive-source/gicc-1.3.2"
printf '%s\n' '{"version":"1.3.2"}' > "$temporary/archive-source/gicc-1.3.2/package.json"
for script in bootstrap.sh install.sh codex-session self-update statusline usage-limit; do
  printf '%s\n' '#!/usr/bin/env bash' 'exit 0' > "$temporary/archive-source/gicc-1.3.2/$script"
done
printf '%s\n' '#!/bin/sh' 'exit 0' > "$temporary/archive-source/gicc-1.3.2/install.zsh"
printf '%s\n' '#!/usr/bin/env bash' 'if then' > "$temporary/archive-source/gicc-1.3.2/gicc"
printf '%s\n' "'use strict';" > "$temporary/archive-source/gicc-1.3.2/skill-bridge.cjs"
printf '%s\n' "import 'node:fs';" > "$temporary/archive-source/gicc-1.3.2/gicc-runtime.mjs"
chmod +x "$temporary/archive-source/gicc-1.3.2/"{bootstrap.sh,install.sh,install.zsh,gicc,codex-session,self-update,statusline,usage-limit}
tar -czf "$fixtures/release.tar.gz" -C "$temporary/archive-source" gicc-1.3.2
if command -v sha256sum >/dev/null 2>&1; then digest=$(sha256sum "$fixtures/release.tar.gz" | awk '{print $1}')
else digest=$(shasum -a 256 "$fixtures/release.tar.gz" | awk '{print $1}'); fi
printf '%s  %s\n' "$digest" 'gicc-1.3.2.tar.gz' > "$fixtures/SHA256SUMS"
if "$root/self-update" --apply >"$temporary/syntax.stdout" 2>"$temporary/syntax.stderr"; then
  printf '%s\n' 'expected a syntax-broken launcher to be rejected' >&2
  exit 1
fi
grep -F 'release shell entrypoint failed validation: gicc' "$temporary/syntax.stderr" >/dev/null

# A failed archive installer restores every prior managed file and removes any
# managed file that did not exist before the attempt.
rm -rf "$temporary/archive-source"
mkdir -p "$temporary/archive-source/gicc-1.3.2" "$temporary/install-bin"
printf '%s\n' old-statusline > "$config/statusline"
rm -f "$config/self-update" "$config/skill-bridge.cjs" "$config/gicc-runtime.mjs"
cat > "$temporary/archive-source/gicc-1.3.2/package.json" <<'EOF'
{"version":"1.3.2"}
EOF
cat > "$temporary/archive-source/gicc-1.3.2/install.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' partial-statusline > "$GICC_CONFIG_DIR/statusline"
printf '%s\n' partial-updater > "$GICC_CONFIG_DIR/self-update"
printf '%s\n' partial-skill-bridge > "$GICC_CONFIG_DIR/skill-bridge.cjs"
printf '%s\n' partial-session-runtime > "$GICC_CONFIG_DIR/gicc-runtime.mjs"
exit 23
EOF
cat > "$temporary/archive-source/gicc-1.3.2/gicc" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat > "$temporary/archive-source/gicc-1.3.2/self-update" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
for script in bootstrap.sh codex-session statusline usage-limit; do
  printf '%s\n' '#!/usr/bin/env bash' 'exit 0' > "$temporary/archive-source/gicc-1.3.2/$script"
done
printf '%s\n' '#!/bin/sh' 'exit 0' > "$temporary/archive-source/gicc-1.3.2/install.zsh"
cat > "$temporary/archive-source/gicc-1.3.2/skill-bridge.cjs" <<'EOF'
'use strict';
EOF
printf '%s\n' "import 'node:fs';" > "$temporary/archive-source/gicc-1.3.2/gicc-runtime.mjs"
chmod +x "$temporary/archive-source/gicc-1.3.2/install.sh" \
  "$temporary/archive-source/gicc-1.3.2/gicc" \
  "$temporary/archive-source/gicc-1.3.2/self-update" \
  "$temporary/archive-source/gicc-1.3.2/bootstrap.sh" \
  "$temporary/archive-source/gicc-1.3.2/codex-session" \
  "$temporary/archive-source/gicc-1.3.2/statusline" \
  "$temporary/archive-source/gicc-1.3.2/usage-limit" \
  "$temporary/archive-source/gicc-1.3.2/install.zsh"
tar -czf "$fixtures/release.tar.gz" -C "$temporary/archive-source" gicc-1.3.2
if command -v sha256sum >/dev/null 2>&1; then digest=$(sha256sum "$fixtures/release.tar.gz" | awk '{print $1}')
else digest=$(shasum -a 256 "$fixtures/release.tar.gz" | awk '{print $1}'); fi
printf '%s  %s\n' "$digest" 'gicc-1.3.2.tar.gz' > "$fixtures/SHA256SUMS"
if "$root/self-update" --apply >"$temporary/rollback.stdout" 2>"$temporary/rollback.stderr"; then
  printf '%s\n' 'expected failed archive installer to roll back' >&2
  exit 1
fi
grep -F 'restored the previous managed files' "$temporary/rollback.stderr" >/dev/null
[[ "$(<"$config/statusline")" == old-statusline ]]
[[ ! -e "$config/self-update" ]]
[[ ! -e "$config/skill-bridge.cjs" ]]
[[ ! -e "$config/gicc-runtime.mjs" ]]

printf '%s\n' 'self-update regressions passed'
