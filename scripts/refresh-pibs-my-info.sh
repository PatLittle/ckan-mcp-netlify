#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPSTREAM_REPO="${UPSTREAM_REPO:-https://github.com/PatLittle/pibs.git}"
UPSTREAM_REF="${UPSTREAM_REF:-main}"
WORK_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

echo "Cloning My Info source from $UPSTREAM_REPO at $UPSTREAM_REF"
git clone --depth 1 --branch "$UPSTREAM_REF" "$UPSTREAM_REPO" "$WORK_DIR/pibs" >/dev/null

python3 "$WORK_DIR/pibs/scripts/export_my_info_netlify_bundle.py" \
  --output "$WORK_DIR/export"

test -f "$WORK_DIR/export/server.mjs"
test -f "$WORK_DIR/export/data/runtime.json"
test -f "$WORK_DIR/export/data/evidence.json"

mkdir -p "$ROOT_DIR/vendor/pibs-my-info"
rsync -a --delete "$WORK_DIR/export/" "$ROOT_DIR/vendor/pibs-my-info/"

echo "My Info vendor refresh complete."
