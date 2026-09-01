#!/usr/bin/env bash
# Diff a fresh Phase-0 capture against the frozen baseline.
#
# PASS   = nothing that used to work is now broken:
#            - no HTTP path whose status regressed (2xx/3xx -> 4xx/5xx)
#            - no interface that was OSGi-resolved is now unresolvable
#              (unless it is listed in de-osgi-classic-interfaces.txt on purpose)
#            - require-init.js module-id set unchanged
# New paths / new interfaces appearing is fine.
#
# Usage:  ./gate-check.sh <baseline-dir> <new-dir>
set -euo pipefail
BASE="${1:?baseline dir}"; NEW="${2:?new capture dir}"
RC=0
CLASSIC_LIST="$(dirname "$0")/../../core/src/main/resources/org/pentaho/platform/engine/core/system/objfac/de-osgi-classic-interfaces.txt"

say(){ printf '%s\n' "$*"; }
fail(){ printf 'FAIL  %s\n' "$*"; RC=1; }
ok(){   printf 'ok    %s\n' "$*"; }

########## 1. HTTP status regressions ##########
if [ -f "$BASE/http/manifest.csv" ] && [ -f "$NEW/http/manifest.csv" ]; then
  while IFS=, read -r path ostat _ _; do
    [ "$path" = path ] && continue
    nstat=$(awk -F, -v p="$path" '$1==p{print $2}' "$NEW/http/manifest.csv")
    [ -z "$nstat" ] && { fail "path vanished from capture: $path (was $ostat)"; continue; }
    case "$ostat" in 2??|3??)
      case "$nstat" in 2??|3??) : ;; *) fail "HTTP regressed: $path  $ostat -> $nstat" ;; esac ;;
    esac
  done < "$BASE/http/manifest.csv"
  [ $RC -eq 0 ] && ok "HTTP surface: no status regressions"
fi

########## 2. require-init.js module set ##########
mods(){ grep -oE '"[a-zA-Z0-9/_.-]+"\s*:' "$1" 2>/dev/null | tr -d '" :' | sort -u; }
if [ -f "$BASE/http/require-init.js" ] && [ -f "$NEW/http/require-init.js" ]; then
  missing=$(comm -23 <(mods "$BASE/http/require-init.js") <(mods "$NEW/http/require-init.js"))
  if [ -n "$missing" ]; then
    fail "require-init.js lost module ids:"; printf '        %s\n' $missing
  else
    ok "require-init.js: no module ids lost"
  fi
fi

########## 3. OSGi resolution contract ##########
if [ -f "$BASE/trace/osgi-resolutions.csv" ]; then
  # interfaces intentionally moved to classic resolution — allowed to disappear
  allow=$(grep -vE '^\s*#|^\s*$' "$CLASSIC_LIST" 2>/dev/null | tr -d ' ' | sort -u || true)
  new_ifaces=$( [ -f "$NEW/trace/osgi-resolutions.csv" ] && cut -d, -f1 "$NEW/trace/osgi-resolutions.csv" | sort -u || true)
  while read -r iface; do
    [ -z "$iface" ] && continue
    grep -qxF "$iface" <<<"$new_ifaces" && continue
    grep -qxF "$iface" <<<"$allow" && { ok "classic now (expected): $iface"; continue; }
    fail "interface no longer resolvable and not on the classic list: $iface"
  done < <(cut -d, -f1 "$BASE/trace/osgi-resolutions.csv" | sort -u)
  [ $RC -eq 0 ] && ok "OSGi resolution contract: intact (modulo the classic list)"
else
  say "note: no trace baseline — run capture with -Dpentaho.osgi.phase0.trace=true to gate the object bridge too"
fi

echo
[ $RC -eq 0 ] && echo "GATE: PASS" || echo "GATE: FAIL"
exit $RC
