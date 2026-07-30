#!/usr/bin/env bash
set -euo pipefail

readonly root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)"
readonly temporary="$(mktemp -d "${TMPDIR:-/tmp}/gicc-test-driver.XXXXXX")"
trap 'rm -rf "$temporary"' EXIT

mkdir -p "$temporary/tests" "$temporary/bin"
cp "$root/test.sh" "$temporary/test.sh"
chmod +x "$temporary/test.sh"

cat > "$temporary/bin/bash" <<'EOF'
#!/bin/sh
printf '%s\n' "$1" >> "$GICC_TEST_DRIVER_LOG"
exit 37
EOF
cat > "$temporary/bin/node" <<'EOF'
#!/bin/sh
printf '%s\n' "node:$1" >> "$GICC_TEST_DRIVER_LOG"
exit 0
EOF
cat > "$temporary/test.zsh" <<'EOF'
#!/bin/sh
printf '%s\n' test.zsh >> "$GICC_TEST_DRIVER_LOG"
exit 0
EOF
chmod +x "$temporary/bin/bash" "$temporary/bin/node" "$temporary/test.zsh"

driver_log="$temporary/driver.log"
set +e
GICC_TEST_DRIVER_LOG="$driver_log" PATH="$temporary/bin:$PATH" "$temporary/test.sh"
driver_status=$?
set -e

[[ "$driver_status" == 37 ]]
[[ "$(wc -l < "$driver_log" | tr -d ' ')" == 1 ]]
grep -E '/tests/background-watcher-regressions\.sh$' "$driver_log" >/dev/null
