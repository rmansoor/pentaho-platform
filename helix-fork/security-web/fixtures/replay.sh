#!/usr/bin/env bash
# Replays fixtures/SPEC.md against a running Helix server and prints one status line per row.
#
#   replay.sh [BASE_URL] [ALT_HOST]
#     BASE_URL  default http://localhost:8080/pentaho   (must equal fully-qualified-server-url)
#     ALT_HOST  default 127.0.0.1:<port>                (in alternative-fully-qualified-server-urls)
#
# Server config the SPEC assumes (system.properties / pentaho.xml):
#   ssrf-protection-enabled=true  csrf-protection-enabled=true
#   cors-requests-allowed=true    cors-requests-allowed-domains=http://allowed.example.com
#
# With the Helix Security Web plugin installed every row must show the SPEC result.
# Plain Helix CE (no plugin) must show the "off" column: nothing is enforced.
set -u
BASE=${1:-http://localhost:8080/pentaho}
HOSTPORT=$(echo "$BASE" | sed -E 's#^https?://([^/]+).*#\1#')
PORT=${HOSTPORT##*:}
ALT=${2:-127.0.0.1:$PORT}
USER_=${HELIX_USER:-admin}
PASS_=${HELIX_PASS:-password}
ALLOWED=http://allowed.example.com
EVIL=http://evil.example.com
UNAUTH=/api/repo/files/:public/children   # 401 when not logged in

JAR=$(mktemp); trap 'rm -f "$JAR"' EXIT
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
hdr()  { curl -s -D - -o /dev/null "$@" | tr -d '\r'; }
row()  { printf '  %-18s %-6s (spec %s, off %s)\n' "$1" "$2" "$3" "$4"; }

echo "=== replay vs SPEC.md — $(date -u +%FT%TZ) — $BASE ==="
echo
echo "## SSRF"
row "bogus Host"        "$(code -H 'Host: evil.example.com' "$BASE$UNAUTH")"                       403 401
row "valid Host"        "$(code "$BASE$UNAUTH")"                                                   401 401
row "alt Host"          "$(code -H "Host: $ALT" "$BASE$UNAUTH")"                                   401 401
row "X-Forwarded-Host"  "$(code -H 'X-Forwarded-Host: evil.example.com' "$BASE$UNAUTH")"           401 401
row "token ep bad Host" "$(code -H 'Host: evil.example.com' "$BASE/api/csrf/token")"               403 204

echo
echo "## CSRF"
T=$(hdr -c "$JAR" -b "$JAR" "$BASE/api/csrf/token")
TSTATUS=$(echo "$T" | head -1 | awk '{print $2}')
THEAD=$(echo "$T" | awk -F': ' 'tolower($1)=="x-csrf-header"{print $2}')
TPARAM=$(echo "$T" | awk -F': ' 'tolower($1)=="x-csrf-param"{print $2}')
row "token endpoint"    "$TSTATUS" "204+hdr" "204 no hdr"
printf '  %-18s header=%s param=%s\n' "" "${THEAD:-<none>}" "${TPARAM:-<none>}"

code -c "$JAR" -b "$JAR" -d "j_username=$USER_&j_password=$PASS_" "$BASE/j_spring_security_check" >/dev/null
TOK=$(hdr -c "$JAR" -b "$JAR" "$BASE/api/csrf/token" | awk -F': ' 'tolower($1)=="x-csrf-token"{print $2}')
row "POST prot no tok"  "$(code -b "$JAR" -X POST "$BASE/api/repo/files/import")"                           403 400
row "POST prot + tok"   "$(code -b "$JAR" -X POST -H "X-CSRF-TOKEN: $TOK" "$BASE/api/repo/files/import")"   400 400
row "POST prot badtok"  "$(code -b "$JAR" -X POST -H 'X-CSRF-TOKEN: bogus' "$BASE/api/repo/files/import")"  403 400
row "GET matcher notok" "$(code -b "$JAR" "$BASE/api/system/refresh/metadata")"                             403 200
row "GET matcher +tok"  "$(code -b "$JAR" -H "X-CSRF-TOKEN: $TOK" "$BASE/api/system/refresh/metadata")"     200 200

echo
echo "## CORS"
P=$(hdr -X OPTIONS -H "Origin: $ALLOWED" -H 'Access-Control-Request-Method: POST' \
        -H 'Access-Control-Request-Headers: X-CSRF-TOKEN, Content-Type' "$BASE$UNAUTH")
row "preflight allowed" "$(echo "$P" | head -1 | awk '{print $2}')" "200+ACAO" "no ACAO"
printf '  %-18s ACAO=%s ACAH=%s\n' "" \
  "$(echo "$P" | awk -F': ' 'tolower($1)=="access-control-allow-origin"{print $2}')" \
  "$(echo "$P" | awk -F': ' 'tolower($1)=="access-control-allow-headers"{print $2}')"
row "preflight PUT"     "$(code -X OPTIONS -H "Origin: $ALLOWED" -H 'Access-Control-Request-Method: PUT' "$BASE$UNAUTH")"  403 -
row "preflight evil"    "$(code -X OPTIONS -H "Origin: $EVIL" -H 'Access-Control-Request-Method: POST' "$BASE$UNAUTH")"   403 -
A=$(hdr -H "Origin: $ALLOWED" "$BASE$UNAUTH")
row "actual allowed"    "$(echo "$A" | head -1 | awk '{print $2}')" "401+ACAO" "401"
printf '  %-18s ACAO=%s\n' "" "$(echo "$A" | awk -F': ' 'tolower($1)=="access-control-allow-origin"{print $2}')"
row "actual evil"       "$(code -H "Origin: $EVIL" "$BASE$UNAUTH")"                                 403 401
row "no origin"         "$(code "$BASE$UNAUTH")"                                                    401 401
