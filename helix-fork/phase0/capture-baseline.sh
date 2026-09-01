#!/usr/bin/env bash
# Phase-0 baseline capture for the Karaf Exit Plan, Helix edition.
#
# Captures everything a running helix-server (built from helix-main) exposes about
# its OSGi surface, so every later phase (rebrand, security-web, Karaf) can diff
# against it. Non-invasive except for the resolution trace, which needs
#   -Dpentaho.osgi.phase0.trace=true  and the log4j2 fragment installed
# (see log4j2-phase0-trace.xml). Run it AFTER the functional smoke test (README).
#
# Usage:
#   ./capture-baseline.sh \
#       --server-dir /path/to/pentaho-server \
#       --url        http://localhost:8080/pentaho \
#       --user       admin --password password \
#       --out        ./baseline/$(date +%Y%m%d) \
#       [--karaf-ssh-port 8102] [--karaf-user karaf] [--karaf-pass karaf]
#
set -euo pipefail

SERVER_DIR=""; URL="http://localhost:8080/pentaho"; USER="admin"; PASS="password"
OUT="./baseline/$(date +%Y%m%d)"; KPORT=8102; KUSER=karaf; KPASS=karaf
while [ $# -gt 0 ]; do case "$1" in
  --server-dir) SERVER_DIR="$2"; shift 2;;
  --url) URL="$2"; shift 2;;
  --user) USER="$2"; shift 2;;
  --password) PASS="$2"; shift 2;;
  --out) OUT="$2"; shift 2;;
  --karaf-ssh-port) KPORT="$2"; shift 2;;
  --karaf-user) KUSER="$2"; shift 2;;
  --karaf-pass) KPASS="$2"; shift 2;;
  *) echo "unknown arg: $1" >&2; exit 2;;
esac; done

mkdir -p "$OUT"/{http,karaf,config,trace}
echo "capture → $OUT"
JAR="$OUT/cookies.txt"; trap 'rm -f "$JAR"' EXIT

log(){ printf '  %s\n' "$*"; }
hash_body(){ shasum -a 256 | cut -d' ' -f1; }

########################################
# 1. auth
########################################
curl -sS -c "$JAR" -d "j_username=$USER&j_password=$PASS" \
  "$URL/j_spring_security_check" -o /dev/null || true

########################################
# 2. HTTP surface — /osgi/* and a REST sweep
########################################
log "HTTP surface"
: > "$OUT/http/manifest.csv"
echo "path,status,sha256,bytes" >> "$OUT/http/manifest.csv"

OSGI_PATHS=(
  /osgi/requirejs-manager/js/require-init.js
  /osgi/cxf/i18n/messages
  /osgi/cxf
  /osgi
  /api/repos/require-js-cfg.js
  /api/version/show
  /api/system/authentication-provider
  /api/mantle/isAuthenticated
  /api/repo/files/:public/children
  /api/plugin-manager/ids
  /api/plugin-manager/settings/home-perspective
  /api/scheduler/jobs
  /webcontext.js
)
for p in "${OSGI_PATHS[@]}"; do
  full="$URL$p"
  code=$(curl -sS -b "$JAR" -o "$OUT/http/body$(echo "$p" | tr '/:?&=' '_')" -w '%{http_code}' "$full" || echo 000)
  f="$OUT/http/body$(echo "$p" | tr '/:?&=' '_')"
  sha=$( [ -f "$f" ] && hash_body < "$f" || echo -)
  sz=$(  [ -f "$f" ] && wc -c < "$f" | tr -d ' ' || echo 0)
  echo "$p,$code,$sha,$sz" >> "$OUT/http/manifest.csv"
done
# keep require-init.js verbatim — it is the client module graph
cp "$OUT/http/body_osgi_requirejs-manager_js_require-init.js" "$OUT/http/require-init.js" 2>/dev/null || true

########################################
# 3. Karaf console — features + services
########################################
CLIENT=""
[ -n "$SERVER_DIR" ] && for c in "$SERVER_DIR"/pentaho-solutions/system/karaf/bin/client \
                                 "$SERVER_DIR"/*/system/karaf/bin/client; do
  [ -x "$c" ] && CLIENT="$c" && break
done
if [ -n "$CLIENT" ]; then
  log "Karaf console via $CLIENT (:$KPORT)"
  kc(){ "$CLIENT" -a "$KPORT" -h localhost -u "$KUSER" -p "$KPASS" "$1" 2>/dev/null || true; }
  kc 'feature:list -i'         > "$OUT/karaf/features-installed.txt"
  kc 'feature:list'            > "$OUT/karaf/features-all.txt"
  kc 'bundle:list -s'          > "$OUT/karaf/bundles.txt"
  kc 'service:list'            > "$OUT/karaf/services.txt"
  kc 'http:list'               > "$OUT/karaf/http-endpoints.txt"
else
  log "Karaf client not found — pass --server-dir to capture feature/service lists"
fi

########################################
# 4. Config — boot feature set + hardcoded /osgi refs
########################################
if [ -n "$SERVER_DIR" ]; then
  log "config"
  KETC="$SERVER_DIR/pentaho-solutions/system/karaf/etc"
  [ -d "$KETC" ] || KETC=$(dirname "$(find "$SERVER_DIR" -name org.apache.karaf.features.cfg -path '*karaf/etc/*' | head -1)")
  cp "$KETC/org.apache.karaf.features.cfg" "$OUT/config/" 2>/dev/null || true
  grep -E '^\s*featuresBoot' "$KETC/org.apache.karaf.features.cfg" 2>/dev/null \
    > "$OUT/config/featuresBoot.txt" || true

  SOL="$SERVER_DIR/pentaho-solutions"
  grep -rIl --include='*.xml' --include='*.properties' --include='*.js' \
    -e '/osgi/' -e 'KarafFeatureWatcher' -e 'karaf\.' "$SOL/system" 2>/dev/null \
    | sed "s#$SERVER_DIR/##" | sort > "$OUT/config/files-referencing-osgi.txt" || true
  grep -rIn --include='*.xml' -e '/osgi/cxf/' "$SOL/system" 2>/dev/null \
    | sed "s#$SERVER_DIR/##" > "$OUT/config/hardcoded-osgi-cxf-paths.txt" || true

  du -sh "$SOL/system/karaf" 2>/dev/null > "$OUT/config/karaf-dir-size.txt" || true
  find "$SOL/system/karaf/system" -name '*.jar' 2>/dev/null | sed "s#.*/system/karaf/system/##" \
    | sort > "$OUT/config/karaf-bundle-inventory.txt" || true
fi

########################################
# 5. Resolution trace (if it was enabled)
########################################
if [ -n "$SERVER_DIR" ]; then
  T=$(find "$SERVER_DIR" -name 'osgi-resolutions.log' 2>/dev/null | head -1)
  if [ -n "$T" ]; then
    log "resolution trace → csv"
    cp "$T" "$OUT/trace/osgi-resolutions.raw.log"
    grep -oE 'OSGI-RESOLVE iface=[^ ]+ bundle=[^ ]+' "$T" \
      | sed -E 's/OSGI-RESOLVE iface=([^ ]+) bundle=(.*)/\1,\2/' | sort -u \
      > "$OUT/trace/osgi-resolutions.csv"
    cut -d, -f2 "$OUT/trace/osgi-resolutions.csv" | sort | uniq -c | sort -rn \
      > "$OUT/trace/by-bundle.txt"
    echo "  $(wc -l < "$OUT/trace/osgi-resolutions.csv") distinct (interface,bundle) resolutions"
  else
    log "no osgi-resolutions.log — enable -Dpentaho.osgi.phase0.trace=true + the log4j2 fragment, restart, re-exercise, re-run"
  fi
fi

echo
echo "baseline written to $OUT"
echo "commit it:  git add $OUT && git commit -m 'phase-0 baseline: <config> <date>'"
