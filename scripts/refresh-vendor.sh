#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPSTREAM_REPO="${UPSTREAM_REPO:-https://github.com/ondata/ckan-mcp-server}"

WORK_DIR="$(mktemp -d)"
BUILD_DIR="$ROOT_DIR/.vendor-refresh-src"
SRC_DIR="$BUILD_DIR/src"
OUT_DIR="$WORK_DIR/out"

cleanup() {
  rm -rf "$WORK_DIR"
  rm -rf "$BUILD_DIR"
}
trap cleanup EXIT

echo "Cloning upstream: $UPSTREAM_REPO"
git clone --depth 1 "$UPSTREAM_REPO" "$WORK_DIR/repo" >/dev/null

UPSTREAM_SHA="$(git -C "$WORK_DIR/repo" rev-parse HEAD)"
UPSTREAM_DATE="$(git -C "$WORK_DIR/repo" show -s --format=%ci HEAD)"
UPSTREAM_VERSION="$(node --input-type=module -e "import fs from 'node:fs'; const pkg = JSON.parse(fs.readFileSync('$WORK_DIR/repo/package.json', 'utf8')); console.log(pkg.version);")"

echo "Upstream commit: $UPSTREAM_SHA"
echo "Upstream version: $UPSTREAM_VERSION"

mkdir -p "$SRC_DIR"/{tools,resources,prompts,utils}

cp "$WORK_DIR/repo/src/server.ts" "$SRC_DIR/"
cp "$WORK_DIR/repo/src/types.ts" "$SRC_DIR/"
cp "$WORK_DIR/repo/src/portals.json" "$SRC_DIR/"
cp "$WORK_DIR/repo/src/tools/"*.ts "$SRC_DIR/tools/"
cp "$WORK_DIR/repo/src/resources/"*.ts "$SRC_DIR/resources/"
cp "$WORK_DIR/repo/src/prompts/"*.ts "$SRC_DIR/prompts/"
cp "$WORK_DIR/repo/src/utils/"*.ts "$SRC_DIR/utils/"

echo "Transpiling vendored source"
cd "$ROOT_DIR"
if ! npx -y -p typescript@5.6.3 tsc \
  --module nodenext \
  --moduleResolution nodenext \
  --target es2022 \
  --lib es2022,dom \
  --resolveJsonModule \
  --skipLibCheck \
  --declaration false \
  --sourceMap false \
  --outDir "$OUT_DIR" \
  --rootDir "$SRC_DIR" \
  $(find "$SRC_DIR" -name '*.ts' | tr '\n' ' '); then
  echo "TypeScript reported type errors; continuing with emitted JS."
fi

if [[ ! -f "$OUT_DIR/server.js" ]]; then
  echo "Transpile failed: missing $OUT_DIR/server.js" >&2
  exit 1
fi

mkdir -p "$ROOT_DIR/vendor/ckan-mcp"
rsync -a --delete "$OUT_DIR/" "$ROOT_DIR/vendor/ckan-mcp/"

# Prefer modern JSON import syntax for Node 20+.
sed -i "s/assert { type: 'json' }/with { type: \"json\" }/g" \
  "$ROOT_DIR/vendor/ckan-mcp/utils/portal-config.js" \
  "$ROOT_DIR/vendor/ckan-mcp/utils/url-generator.js" || true

cat > "$ROOT_DIR/vendor/ckan-mcp/.upstream.json" <<EOF
{
  "repo": "$UPSTREAM_REPO",
  "commit": "$UPSTREAM_SHA",
  "date": "$UPSTREAM_DATE",
  "version": "$UPSTREAM_VERSION"
}
EOF

echo "Vendor refresh complete."
