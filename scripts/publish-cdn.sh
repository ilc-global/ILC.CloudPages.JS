#!/usr/bin/env bash
# Publish cloudpages.js to the CDN storage account (ilcreportscdn / $web).
#
#   ./scripts/publish-cdn.sh 2.2.1                 # upload v2.2.1 (immutable) + move `latest`
#   ./scripts/publish-cdn.sh --promote-stable 2.2.1  # point `stable` at an ALREADY-published version
#
# Channels:
#   /cloudpages/vX.Y.Z/  immutable pins (max-age 1y immutable) — never re-published
#   /cloudpages/latest/  moves on every publish (max-age 300)
#   /cloudpages/stable/  moves only on --promote-stable, after soaking on latest (max-age 600)
# versions.json tracks {latest, stable, versions[]}.
set -euo pipefail
cd "$(dirname "$0")/.."

ACCT=(--account-name ilcreportscdn --subscription "Y-ILC_Internal" --auth-mode key)
WEB='$web'
BASE="https://ilcreportscdn.z5.web.core.windows.net/cloudpages"

up() { az storage blob upload "${ACCT[@]}" -c "$WEB" -f "$1" -n "$2" \
        --content-type "$3" --content-cache-control "$4" --overwrite --only-show-errors -o none
       echo "  up: $2"; }

manifest() { # $1=latest $2=stable
    local versions
    versions=$(az storage blob list "${ACCT[@]}" -c "$WEB" --prefix cloudpages/v --query "[].name" -o tsv \
        | sed -E 's#cloudpages/v([^/]+)/.*#\1#' | sort -uV | sed 's/.*/"&"/' | paste -sd, -)
    printf '{\n  "latest": "%s",\n  "stable": "%s",\n  "versions": [%s]\n}\n' "$1" "$2" "$versions" > /tmp/cp-versions.json
    up /tmp/cp-versions.json "cloudpages/versions.json" "application/json" "public, max-age=300"
}

current() { curl -sf "$BASE/versions.json" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('$1',''))"; }

publish_channel() { # $1=channel $2=cache-control
    up js/cloudpages.js  "cloudpages/$1/cloudpages.js"  "application/javascript; charset=utf-8" "$2"
    up js/fb.js          "cloudpages/$1/fb.js"          "application/javascript; charset=utf-8" "$2"
    up css/cloudpages.css "cloudpages/$1/cloudpages.css" "text/css; charset=utf-8" "$2"
}

if [ "${1:-}" = "--promote-stable" ]; then
    VER="${2:?usage: publish-cdn.sh --promote-stable X.Y.Z}"
    echo "Promoting stable -> v$VER (copying the immutable pin)"
    for f in cloudpages.js fb.js cloudpages.css; do
        ct="application/javascript; charset=utf-8"; [ "$f" = cloudpages.css ] && ct="text/css; charset=utf-8"
        curl -sf "$BASE/v$VER/$f" -o "/tmp/cp-$f"   # promote exactly what's pinned, not the working tree
        up "/tmp/cp-$f" "cloudpages/stable/$f" "$ct" "public, max-age=600"
    done
    manifest "$(current latest)" "$VER"
    echo "stable = $VER"
    exit 0
fi

VER="${1:?usage: publish-cdn.sh X.Y.Z  (or --promote-stable X.Y.Z)}"
grep -q "@version $VER" js/cloudpages.js || { echo "js/cloudpages.js is not @version $VER — bump it first."; exit 1; }
echo "Publishing v$VER (immutable) + latest"
publish_channel "v$VER" "public, max-age=31536000, immutable"
publish_channel "latest" "public, max-age=300"
manifest "$VER" "$(current stable)"
echo "latest = $VER ; stable unchanged ($(current stable)). Soak, then: publish-cdn.sh --promote-stable $VER"
