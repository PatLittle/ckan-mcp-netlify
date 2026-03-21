#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPSTREAM_REPO="${UPSTREAM_REPO:-https://github.com/ondata/ckan-mcp-server}"

WORK_DIR="$(mktemp -d)"
BUILD_DIR="$ROOT_DIR/.vendor-refresh-src"
SRC_DIR="$BUILD_DIR/src"
OUT_DIR="$WORK_DIR/out"
CUSTOM_SNAPSHOT_DIR="$WORK_DIR/custom-overrides"

SCHEMING_TOOL_PATH="vendor/ckan-mcp/tools/scheming.js"
SERVER_PATH="vendor/ckan-mcp/server.js"
CORS_PROXY_PATH="netlify/functions/cors-proxy.mjs"
CONSTANTS_SHIM_PATH="vendor/ckan-mcp/utils/constants.js"

snapshot_custom_overrides() {
  mkdir -p "$CUSTOM_SNAPSHOT_DIR"

  if [[ -f "$ROOT_DIR/$SCHEMING_TOOL_PATH" ]]; then
    cp "$ROOT_DIR/$SCHEMING_TOOL_PATH" "$CUSTOM_SNAPSHOT_DIR/scheming.js"
    echo "Captured custom scheming endpoint overrides."
  fi

  # This file is outside the vendor directory, but snapshot it in case future
  # refresh steps start touching function files.
  if [[ -f "$ROOT_DIR/$CORS_PROXY_PATH" ]]; then
    cp "$ROOT_DIR/$CORS_PROXY_PATH" "$CUSTOM_SNAPSHOT_DIR/cors-proxy.mjs"
    echo "Captured custom CORS proxy function."
  fi
}

ensure_scheming_registration() {
  local server_file="$ROOT_DIR/$SERVER_PATH"
  if [[ ! -f "$server_file" ]]; then
    echo "Skipping scheming registration patch: missing $SERVER_PATH"
    return 0
  fi

  SERVER_FILE="$server_file" node --input-type=module <<'EOF'
import fs from "node:fs";

const serverFile = process.env.SERVER_FILE;
let source = fs.readFileSync(serverFile, "utf8");
let changed = false;

const importLine = 'import { registerSchemingTools } from "./tools/scheming.js";';
if (!source.includes(importLine)) {
  const lines = source.split("\n");
  const datastoreImportIndex = lines.findIndex((line) => line.includes("registerDatastoreTools"));
  const importIndexes = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.startsWith("import "))
    .map(({ index }) => index);
  const lastImportIndex = importIndexes.length ? importIndexes[importIndexes.length - 1] : -1;
  const insertIndex = datastoreImportIndex >= 0 ? datastoreImportIndex + 1 : lastImportIndex + 1;
  lines.splice(insertIndex, 0, importLine);
  source = lines.join("\n");
  changed = true;
}

if (!source.includes("registerSchemingTools(server);")) {
  const lines = source.split("\n");
  const datastoreCallIndex = lines.findIndex((line) => line.includes("registerDatastoreTools(server);"));
  const statusCallIndex = lines.findIndex((line) => line.includes("registerStatusTools(server);"));

  if (datastoreCallIndex >= 0) {
    const indent = (lines[datastoreCallIndex].match(/^(\s*)/) || ["", ""])[1];
    lines.splice(datastoreCallIndex + 1, 0, `${indent}registerSchemingTools(server);`);
    source = lines.join("\n");
    changed = true;
  } else if (statusCallIndex >= 0) {
    const indent = (lines[statusCallIndex].match(/^(\s*)/) || ["", ""])[1];
    lines.splice(statusCallIndex, 0, `${indent}registerSchemingTools(server);`);
    source = lines.join("\n");
    changed = true;
  } else {
    const registerAllIndex = lines.findIndex((line) => line.includes("export function registerAll("));
    if (registerAllIndex >= 0) {
      let insertIndex = registerAllIndex + 1;
      while (insertIndex < lines.length && lines[insertIndex].trim() === "") {
        insertIndex += 1;
      }
      lines.splice(insertIndex, 0, "  registerSchemingTools(server);");
      source = lines.join("\n");
      changed = true;
    }
  }
}

if (changed) {
  fs.writeFileSync(serverFile, source);
  console.log("Applied custom scheming registration to vendor/ckan-mcp/server.js");
}
EOF
}

restore_custom_overrides() {
  if [[ -f "$CUSTOM_SNAPSHOT_DIR/scheming.js" ]]; then
    mkdir -p "$(dirname "$ROOT_DIR/$SCHEMING_TOOL_PATH")"
    cp "$CUSTOM_SNAPSHOT_DIR/scheming.js" "$ROOT_DIR/$SCHEMING_TOOL_PATH"
    echo "Restored custom scheming endpoint file."

    if [[ ! -f "$ROOT_DIR/$CONSTANTS_SHIM_PATH" ]]; then
      mkdir -p "$(dirname "$ROOT_DIR/$CONSTANTS_SHIM_PATH")"
      cat > "$ROOT_DIR/$CONSTANTS_SHIM_PATH" <<'EOF'
export const DEFAULT_CKAN_SERVER_URL = "https://open.canada.ca/data";
EOF
      echo "Restored constants compatibility shim for custom scheming tool."
    fi

    ensure_scheming_registration
  fi

  if [[ -f "$CUSTOM_SNAPSHOT_DIR/cors-proxy.mjs" ]]; then
    mkdir -p "$(dirname "$ROOT_DIR/$CORS_PROXY_PATH")"
    cp "$CUSTOM_SNAPSHOT_DIR/cors-proxy.mjs" "$ROOT_DIR/$CORS_PROXY_PATH"
    echo "Restored custom CORS proxy function."
  fi
}

cleanup() {
  rm -rf "$WORK_DIR"
  rm -rf "$BUILD_DIR"
}
trap cleanup EXIT

snapshot_custom_overrides

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
  --noCheck \
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

restore_custom_overrides

cat > "$ROOT_DIR/vendor/ckan-mcp/.upstream.json" <<EOF
{
  "repo": "$UPSTREAM_REPO",
  "commit": "$UPSTREAM_SHA",
  "date": "$UPSTREAM_DATE",
  "version": "$UPSTREAM_VERSION"
}
EOF

echo "Vendor refresh complete."
