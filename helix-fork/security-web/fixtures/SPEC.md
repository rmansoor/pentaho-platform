# S0 — frozen behavioural spec (from HV `security-web` 0.14.0)

Captured 2026-09-03 against the candidate build with
`csrf-protection-enabled=true`, `ssrf-protection-enabled=true`,
`cors-requests-allowed=true`, `cors-requests-allowed-domains=http://allowed.example.com`,
`fully-qualified-server-url=http://localhost:8080/pentaho/`,
`alternative-fully-qualified-server-urls=http://127.0.0.1:8080/pentaho/`.

Raw transcript: `s0-blackbox.txt`. `helix-security-web` must reproduce every row.

Filter order in `filterChainProxy`: **`ssrfGateFilter → csrfGateFilter → corsFilter`**, all ahead of authentication.

## SSRF (`SsrfGateFilter`)

| request | result |
|---|---|
| `Host: evil.example.com` | **403**, request never reaches auth/CSRF |
| `Host: localhost:8080` (matches FQ url) | pass-through (→ 401 unauth) |
| `Host: 127.0.0.1:8080` (matches alternative) | pass-through |
| valid `Host` + `X-Forwarded-Host: evil.example.com` | pass-through — forwarded headers **not** trusted |
| `GET /api/csrf/token` with `Host: evil.example.com` | **403** — SSRF runs before the CSRF token endpoint |

Allowed set = the host:port (scheme too) of `fully-qualified-server-url` ∪ `alternative-fully-qualified-server-urls`. Rejection status = **403**, empty body.

## CSRF (`CsrfGateFilter` + `CsrfTokenService`)

Token endpoint `GET /api/csrf/token[?url=…]`:

| request | result |
|---|---|
| any GET (with/without `url`, protected or not) | **204**, headers below, sets `JSESSIONID` if none |

Response headers on the token endpoint:
```
X-CSRF-HEADER: X-CSRF-TOKEN
X-CSRF-PARAM:  _csrf
X-CSRF-TOKEN:  <~97-char base64url, XOR-masked, changes every call, one logical token per session>
```
Token repository = session-backed; request handler = XOR-masking (Spring
`XorCsrfTokenRequestAttributeHandler` semantics — the raw token is stable per
session, the wire value is re-masked each emission).

Enforcement:

| request | result |
|---|---|
| `POST /j_spring_security_check` (login) | **not protected** — 302, no token needed |
| authed `POST /api/repo/files/import`, no token | **403** |
| authed `POST /api/repo/files/import`, wrong token | **403** |
| authed `POST /api/repo/files/import`, valid session token in `X-CSRF-TOKEN` | passes CSRF (→ 400 on missing multipart body) |
| authed `GET /api/system/refresh/metadata`, no token | **403** (GET matchers are enforced) |
| authed `GET /api/system/refresh/metadata`, valid token | **200** |

Protected request set = the `<hsw:or-request-matcher>` in
`applicationContext-spring-security-csrf.xml` (REST `/api/*` subset + the
GWT-RPC `unifiedRepository` method list + `/UploadService` + `/upload/*`).
Token accepted via header `X-CSRF-TOKEN` or param `_csrf`.

## CORS (`CorsProtocolFilter`)

Root config: `enabled=true`, `abstract=false`, `allowedOrigins={http://allowed.example.com}`,
`allowedMethods={GET,HEAD,POST}`, `allowCredentials=true`,
`allowedHeaders` echoed from the request, matcher = all requests.

| request | result |
|---|---|
| `OPTIONS`, `Origin: http://allowed.example.com`, `ACRM: POST` | **200** + `ACAO: http://allowed.example.com`, `ACAM: HEAD,POST,GET`, `ACAC: true`, `Vary: Origin, Access-Control-Request-Method, Access-Control-Request-Headers` |
| `OPTIONS`, allowed origin, `ACRH: X-CSRF-TOKEN, Content-Type` | + `Access-Control-Allow-Headers: X-CSRF-TOKEN, Content-Type` (echoed) |
| `OPTIONS`, allowed origin, `ACRM: PUT` (not allowed) | **403** |
| `OPTIONS`, `Origin: http://evil.example.com` | **403** + `Vary: …`, no `ACAO` |
| actual `GET`, `Origin: http://allowed.example.com` | pass-through + `ACAO` + `ACAC: true` on the response |
| actual `GET`, `Origin: http://evil.example.com` | **403** |
| request with no `Origin` | normal processing, no CORS headers |

Note `ACAM` ordering (`HEAD,POST,GET`) — set iteration order, not significant, but
tests should compare as sets.
