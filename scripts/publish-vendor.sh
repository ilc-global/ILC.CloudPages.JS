#!/usr/bin/env bash
# Publish third-party vendor libraries to the CDN from scripts/vendor-manifest.json.
# Immutable pins only (/vendor/<lib>/<version>/<file>, max-age 1y immutable):
# existing version paths are NEVER overwritten — bump the version in the
# manifest to ship a new upstream release. Rebuilds /vendor/manifest.json with
# per-file SRI (sha384) so pages can use integrity= attributes.
set -euo pipefail
cd "$(dirname "$0")/.."

# --- CDN target -------------------------------------------------------------
# The storage account, subscription and resource group are not committed.
# Copy scripts/cdn.env.example to scripts/cdn.env and fill it in, or export
# these in your shell. The script refuses to run without them.
[ -f "$(dirname "$0")/cdn.env" ] && . "$(dirname "$0")/cdn.env"
: "${CDN_ACCOUNT:?set CDN_ACCOUNT (see scripts/cdn.env.example)}"
: "${CDN_SUBSCRIPTION:?set CDN_SUBSCRIPTION (see scripts/cdn.env.example)}"
: "${CDN_BASE_URL:?set CDN_BASE_URL (see scripts/cdn.env.example)}"
ACCT=(--account-name "$CDN_ACCOUNT" --subscription "$CDN_SUBSCRIPTION" --auth-mode "${CDN_AUTH_MODE:-login}")
WEB='$web'
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

exists() { az storage blob exists "${ACCT[@]}" -c "$WEB" -n "$1" --query exists -o tsv; }

python3 - "$TMP" <<'PY' > "$TMP/joblist"
import json, sys
m = json.load(open('scripts/vendor-manifest.json'))
for lib in m['libs']:
    for f in lib['files']:
        print('\t'.join([lib['lib'], lib['version'], f['name'], f['url']]))
PY

MANIFEST="$TMP/out.json"
echo '{ "libs": {' > "$MANIFEST"
first_lib=1
current_lib=""
while IFS=$'\t' read -r lib ver name url; do
    blob="vendor/$lib/$ver/$name"
    local_f="$TMP/$lib-$ver-$name"
    curl -sfL "$url" -o "$local_f" || { echo "DOWNLOAD FAILED: $url"; exit 1; }
    sri="sha384-$(openssl dgst -sha384 -binary "$local_f" | base64 -w0)"
    case "$name" in
        *.css) ct="text/css; charset=utf-8" ;;
        *.js)  ct="application/javascript; charset=utf-8" ;;
        *)     ct="application/octet-stream" ;;
    esac
    if [ "$(exists "$blob")" = "true" ]; then
        echo "  skip (immutable, already published): $blob"
    else
        az storage blob upload "${ACCT[@]}" -c "$WEB" -f "$local_f" -n "$blob" \
            --content-type "$ct" --content-cache-control "public, max-age=31536000, immutable" \
            --only-show-errors -o none
        echo "  up: $blob"
    fi
    key="$lib/$ver"
    if [ "$key" != "$current_lib" ]; then
        [ -n "$current_lib" ] && printf ' },\n' >> "$MANIFEST" && first_lib=0
        [ "$first_lib" = 0 ] || true
        printf '  "%s": { "version": "%s"' "$lib" "$ver" >> "$MANIFEST"
        current_lib="$key"
    fi
    printf ',\n    "%s": { "sri": "%s" }' "$name" "$sri" >> "$MANIFEST"
done < "$TMP/joblist"
printf ' }\n} }\n' >> "$MANIFEST"
python3 -m json.tool "$MANIFEST" > "$TMP/manifest.json"   # validate + pretty
az storage blob upload "${ACCT[@]}" -c "$WEB" -f "$TMP/manifest.json" -n "vendor/manifest.json" \
    --content-type "application/json" --content-cache-control "public, max-age=300" \
    --overwrite --only-show-errors -o none
echo "  up: vendor/manifest.json"
echo "Done."
