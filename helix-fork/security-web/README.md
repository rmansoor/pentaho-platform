# Phase S — replace `com.hitachivantara.security.web`

**Goal.** Remove the last non-redistributable proprietary dependency from the Helix
CE server by reimplementing its web-security layer as an owned module,
`helix-security-web`, on the platform's already-current stack (Spring Security
6.5, Spring 6.2, Jakarta EE 10, JAX-RS 3.1).

**Status:** S0–S9 landed on `helix-rebrand`; S10 (full-assembly validation) in
progress. `helix-security-web/` is a reactor module (before `extensions`),
60 module tests green on JDK 17; `extensions` main+test compile + 138 security
tests green against it.

| step | done | what |
|---|---|---|
| S0 | ✅ | `fixtures/SPEC.md` + `s0-blackbox.txt` — frozen behaviour of HV 0.14.0 with all 3 protections on |
| S1 | ✅ | module + poms + 6 model interfaces + `RequestMatcher.ALL/NONE` |
| S2 | ✅ | `RegexRequestMatcher`, `OrRequestMatcher`, CSRF/CORS pojos, both aggregators |
| S3 | ✅ | `hsw:` namespace (`http://www.pentaho.com/schema/security-web`): handler + 3 parsers + `hsw-1.0.xsd` + `spring.{handlers,schemas}`; full XML round-trip test |
| S4 | ✅ | `CsrfGateFilter` over Spring `CsrfFilter` + `CsrfRequiredRequestMatcherAdapter` + body wrappers (`HttpUtil`, `CachedServletInputStream`, `MultiReadHttpServletRequestWrapper`, `ManagedBodyServletRequestWrapper`) |
| S5 | ✅ | `CorsProtocolFilter` over Spring `CorsFilter` + `CorsConfigurationSourceAdapter` |
| S6 | ✅ | `SsrfGateFilter` + `SsrfUtil` (custom; Host-header origin check, forwarded headers ignored) |
| S7 | ✅ | `CsrfTokenService` JAX-RS resource (`@Path("/csrf")` `/token`) |
| S8 | ✅ | `CsrfTokenFilter` + `CsrfTokenServiceClient` + `SessionCookiesFilter` (JAX-RS client, for the import/export CLI) |
| S9 | ✅ | root pom module wiring; `extensions` + `pentaho-war` pom dep swap; 6 java files (FQCN only); 3 system XMLs + `pentahoServices.spring.xml` + 1 test resource (`swm:`→`hsw:`) |
| S10 | ✅ | full clean assembly builds; boots with `data-access`/`scheduler-plugin` registered; `gate-check.sh` **PASS**; SPEC.md replayed on the running server with all 3 protections on — **every row matches HV 0.14.0** (`fixtures/s10-replay.txt`) |
| S11 | ✅ | **CSRF/CORS/SSRF out of CE** (decision §8.2): filters moved to the optional `helix-security-web-plugin`; CE gets an empty `webSecurityExtensionFilter` slot. Replayed: CE-only with all flags on → nothing enforced (`fixtures/s11-replay-ce-only.txt`); CE + plugin → every SPEC row matches (`fixtures/s11-replay-with-plugin.txt`); `gate-check.sh` PASS on both |
| S12 | ✅ | **Browser pass (PUC, CE + plugin, all flags on)** via Playwright: login, Tools → Refresh → Reporting Metadata (GWT `CsrfRequestBuilder`: token fetch 204 → protected GET 200), New Folder, Add to Favorites (JS `pentaho/csrf/service`: token fetch → protected POST 200). Found + fixed a real bug: `MultiReadHttpServletRequestWrapper.getInputStream()` returned a fresh replay on every call; Jersey calls it per read → body replayed forever → `OutOfMemoryError` → 500 on every buffered (non-form, non-multipart) protected POST. Now one stream/reader per replay until end-of-body (`MultiReadHttpServletRequestWrapperTest`) |

**Phase S complete.** (S11 then moved enforcement out of CE into a plugin, see §7a.) `com.hitachivantara.security.web` is gone from every pom,
source file, and shipped config in the tree. Two integration wrinkles fixed
during S10:
- external binary plugins (`data-access`, `scheduler-plugin`) still ship
  `plugin.spring.xml` on the `swm:` namespace → an assembly-time
  `maven-replacer-plugin` step in `assemblies/pentaho-solutions/pom.xml` rewrites
  them to `hsw:` in the unpacked copy (remove when those plugins are re-owned);
- the platform's Jersey layer instantiates `@Path` resources via their no-arg
  constructor when the Spring-bind path misses → `CsrfTokenService` reworked to
  reflect the upstream filter's `CsrfToken` rather than depend on a
  constructor-injected `CsrfConfiguration`.

Follow-ups (not blockers): remove the `replacer` step once `data-access` /
`pentaho-scheduler-plugin` are rebuilt against `helix-security-web`; wire the
JAX-RS `CsrfTokenService` bean through the Spring provider so the injected
`CsrfConfiguration` path also works; add `mockwebserver` end-to-end tests for the
CLI CSRF client (S8).

---

## 0. Why

`com.hitachivantara.security.web` is proprietary, source-closed, and its schema
carries an explicit *"reproduction / modification / distribution … strictly
prohibited"* notice. It cannot ship in a fork we control or be promoted into
`helix-releases`. It is the only such dependency left after Karaf, big-data, and
metaverse were removed.

The reimplementation is **clean-room**: it is built from the *observable public
contract* — interface signatures (`javap`), the Spring XML element names that
Pentaho's own configs already depend on, and documented HTTP behaviour — never
from decompiled HV implementation code.

---

## 1. What it actually is (v0.14.0, measured)

Already on Spring Security **6.5.11** / Jakarta — so this is **not** a framework
port, only an ownership swap.

### 1.1 Artifacts on the classpath

| artifact | role | in |
|---|---|---|
| `security-web-server-api` | 6 model interfaces | `extensions`, `pentaho-war` (compile) |
| `security-web-server-model-impl` | pojos + `swm:` XML namespace | same |
| `security-web-server-service-impl` | 3 servlet filters + `CsrfTokenService` + request wrappers | same |
| `csrf-token-service-client-java-jax-rs-v3` | JAX-RS client filters for the import/export CLI | `pentaho-war` (compile), `extensions` (provided/test) |

**~34 classes total** across the three server jars. Small.

### 1.2 The API surface (`security-web-server-api`)

```java
interface RequestMatcher extends java.util.function.Predicate<HttpServletRequest> {
  RequestMatcher ALL;   // always true
  RequestMatcher NONE;  // always false
}

interface CsrfConfiguration {
  boolean isEnabled();
  boolean isEnabled(HttpServletRequest);        // per-request: enabled AND some matcher hits
}
interface CsrfRequestSetConfiguration {
  RequestMatcher getRequestMatcher();
}

interface CorsConfiguration {
  default boolean isEnabled();
  CorsRequestSetConfiguration getRootConfiguration();
  CorsRequestSetConfiguration getRequestConfiguration(HttpServletRequest);
}
interface CorsRequestSetConfiguration {
  String ROOT_NAME;                             // "root"
  String getName();  String getParentName();  boolean isAbstract();
  RequestMatcher getRequestMatcher();
  boolean isEnabled();  default boolean isEnabledEffective();
  Set<String> getAllowedOrigins();  Set<String> getAllowedMethods();
  Set<String> getAllowedHeaders();  Boolean getAllowCredentials();
  Long getMaxAge();  Set<String> getExposedHeaders();
}

interface SsrfConfiguration {
  boolean isEnabled();
  Set<URI> getAllowedOrigins();
}
```

### 1.3 The impl classes that matter

| class | what it does | reimpl strategy |
|---|---|---|
| `impl.model.matcher.RegexRequestMatcher(pattern, methods?, insensitive?)` | regex (`Pattern.compile`, `CASE_INSENSITIVE` when `insensitive`) tested against `getServletPath()+getPathInfo()` — already context-relative — plus optional `getMethod()` set | ~40 lines, trivial |
| `impl.model.matcher.OrRequestMatcher` | disjunction of child matchers | ~15 lines |
| `impl.model.csrf.CsrfRequestSetConfigurationPojo(RequestMatcher)` | holds one matcher | trivial |
| `impl.model.csrf.AggregatedRequestSetCsrfConfiguration` | `enabled` flag + `List<CsrfRequestSetConfiguration>`; `isEnabled(req)` = enabled && any child matcher hits; `requestSetConfigurationDidBind/WillUnbind` for dynamic (plugin) contribution | ~60 lines |
| `impl.model.cors.CorsRequestSetConfigurationPojo` | full CORS config bean (name/parent/abstract/origins/methods/headers/credentials/maxAge/exposed) | ~120 lines of getters/setters |
| `impl.model.cors.AggregatedRequestSetCorsConfiguration` | root config + `getRequestConfiguration(req)` resolves the first non-abstract child whose matcher hits, inheriting from parent chain | ~90 lines |
| `impl.model.ssrf.SsrfConfigurationPojo(Set<URI> allowed, boolean enabled)` | holds allow-list | trivial (Pentaho already subclasses it — see §2) |
| `impl.service.csrf.servlet.CsrfGateFilter(CsrfConfiguration [, CsrfTokenRepository])` | **wraps Spring Security's `org.springframework.security.web.csrf.CsrfFilter`**; adds a `RequireCsrfProtectionMatcher` delegating to the aggregated config, body-buffering for GWT-RPC method extraction (`parseBodyMethods`), pluggable `AccessDeniedHandler` | thin adapter over SS6 `CsrfFilter` — the bulk is SS6's |
| `impl.service.cors.servlet.CorsProtocolFilter(CorsConfiguration)` | pre-flight + actual CORS header handling | adapter over SS6 `CorsFilter` + a `CorsConfigurationSource` bridging our model → `org.springframework.web.cors.CorsConfiguration` (an adapter class `CorsConfigurationSourceAdapter` already exists in HV; we author our own) |
| `impl.service.ssrf.servlet.SsrfGateFilter(SsrfConfigurationPojo)` | rejects requests whose `Origin`/`Referer`/`Host` resolves outside the allowed FQDN set (defends server-side URL fetches that reflect request host) | **no SS6 equivalent — fully custom, ~120 lines** |
| `impl.service.csrf.jaxrs.CsrfTokenService(CsrfConfiguration)` | JAX-RS resource: `GET /api/csrf/token?url=<target>` → 204 with `X-CSRF-{HEADER,PARAM,TOKEN}` response headers if the target URL needs protection, else 204 empty | ~70 lines over SS6 `CsrfToken` + repository |
| `impl.service.util.ManagedBodyServletRequestWrapper` / `MultiReadHttpServletRequestWrapper` / `CachedServletInputStream` | buffer the request body so it can be read by a filter (CSRF method sniff, param auth) and again by the servlet | ~150 lines total; standard pattern |
| `impl.service.util.multipart.*` (`MultipartResolver`, `FileItemPart`, `MultipartResult`) | parse `multipart/form-data` bodies in the wrapper without consuming them | ~120 lines; or delegate to `jakarta.servlet.http.Part` where the container allows |
| `impl.service.util.HttpUtil` / `SsrfUtil` | URL / origin normalisation helpers | ~80 lines |
| `impl.model.spring.xml.WebSecurityModelNamespaceHandler` + `OrRequestMatcherParser` + `RegexRequestMatcherParser` + `schema-1.0.xsd` | the `swm:` Spring XML namespace | reauthor — see §3 |

### 1.4 The CSRF JAX-RS client (`csrf-token-service-client-java-jax-rs-v3`)

Two `jakarta.ws.rs.client.ClientRequestFilter` / `ClientResponseFilter`:

- `impl.client.csrf.jaxrsv3.CsrfTokenFilter(URI tokenEndpoint)` — before an
  unsafe request, calls `GET {tokenEndpoint}?url=<target>`, copies the returned
  `X-CSRF-*` headers onto the outgoing request.
- `impl.client.csrf.jaxrsv3.util.SessionCookiesFilter(CookieManager)` — carries
  the `JSESSIONID` between the token call and the real call.

Used only by `CommandLineProcessor` (the `import-export.sh` CLI). ~2 small classes.

---

## 2. Every consumer in `pentaho-platform` (the migration surface)

### 2.1 System Spring configs — `assemblies/pentaho-solutions/.../system/`

| file | uses |
|---|---|
| `applicationContext-spring-security-csrf.xml` | `CsrfRequestSetConfigurationPojo`, `AggregatedRequestSetCsrfConfiguration`, `CsrfGateFilter`, `CorsRequestSetConfigurationPojo`; `<swm:or-request-matcher>`, `<swm:regex-request-matcher>`; `<pen:publish>` of `model.csrf.CsrfRequestSetConfiguration` + `model.cors.CorsRequestSetConfiguration`; `<pen:list class="…model.csrf.CsrfRequestSetConfiguration">` |
| `applicationContext-spring-security-cors.xml` | `CorsRequestSetConfigurationPojo`, `AggregatedRequestSetCorsConfiguration`, `CorsProtocolFilter`; `<swm:all-request-matcher>`; `<pen:publish>` / `<pen:list>` of `model.cors.CorsRequestSetConfiguration` |
| `applicationContext-spring-security-ssrf.xml` | `SsrfGateFilter` + `org.pentaho.platform.config.PentahoSsrfConfigurationPojo` (no `swm:`) |
| `applicationContext-spring-security.xml` | `filterChainProxy` weaves `ssrfGateFilter, csrfGateFilter, corsFilter` into **7** `<sec:filter-chain>`s (`/api/csrf/token`, `/webservices/**`, `/api/repos/**`, `/api/**`, `/plugin/reporting/api/jobs/**`, `/plugin/**`, `/**`) |
| `pentahoServices.spring.xml` | `CsrfTokenService` bean (own app-context so JAX-RS exposes it at `/api/csrf/token`), `<pen:bean class="…model.csrf.CsrfConfiguration">` |

The `<pen:publish as-type="INTERFACES">` / `<pen:list>` wiring means CSRF/CORS
config is **contributed across app-contexts and by plugins** through
`PublishedBeanRegistry` — the aggregated beans collect every published
`*RequestSetConfiguration`. Our interfaces must keep the identities the registry
keys on. (Already verified: **no shipped `plugin.spring.xml` uses `swm:`** — only
these 3 system files + one test resource.)

### 2.2 Java — `extensions/src/main/java/`

| file | coupling | migration |
|---|---|---|
| `config/PentahoSsrfConfigurationPojo` | `extends com.hitachivantara…impl.model.ssrf.SsrfConfigurationPojo` | change superclass to `org.pentaho.platform.security.web.model.ssrf.SsrfConfigurationPojo` (or `com.helix…`) |
| `web/gwt/rpc/matcher/AbstractGwtRpcRequestMatcher` | `extends …impl.model.matcher.RegexRequestMatcher` | change superclass; GWT-RPC body method-name matching stays here (already Pentaho code) |
| `web/http/security/RequestParameterAuthenticationFilter` | `new …impl.service.util.ManagedBodyServletRequestWrapper(req)` | swap to our wrapper |
| `web/http/request/MultiReadHttpServletRequest` | only a `@deprecated` javadoc `{@link}` pointer | update or drop the link |
| `web/WebUtil` | only two javadoc `{@code}` mentions; the CORS logic here reads `pentaho.xml` directly, **not** the HV lib | text-only edit |
| `plugin/services/importexport/CommandLineProcessor` | `new CsrfTokenFilter(uri)`, `new SessionCookiesFilter(cookieMgr)` | swap to our client filters |

### 2.3 POMs

- `extensions/pom.xml` — 2 dep blocks (`api`, `model-impl`, `service-impl` at
  ~2015; `csrf-token-service-client…v3` provided at ~2632) + `spring-security-web`
  stays.
- `assemblies/pentaho-war/pom.xml` — the `<!-- region HV Web Security -->` block
  (4 deps, ~131).
- Replace all with one `helix-security-web` dep.

---

## 3. The `swm:` Spring namespace → `hsw:`

HV registers, via `META-INF/spring.{handlers,schemas}`:

```
http://www.hitachivantara.com/schema/security/web/model/spring
  → WebSecurityModelNamespaceHandler
```

parsing 4 elements: `or-request-matcher`, `regex-request-matcher`,
`all-request-matcher`, `none-request-matcher` (full XSD reproduced from the
public contract in `schema/hsw-1.0.xsd` here — element names and attributes are
the compatibility contract; the HV file's prose/annotations are not copied).

**Decision: new namespace** `http://www.pentaho.com/schema/security-web`, prefix
`hsw:`, handler `org.pentaho.platform.security.web.spring.SecurityWebNamespaceHandler`.
Update the 3 system XMLs + `PluginManagerTest/.../good-plugin1/plugin.spring.xml`.
Keeping `swm:` would mean shipping a `com.hitachivantara…`-named handler — wrong
for an owned module. Churn is 4 files.

Parsers: `RegexRequestMatcherBeanDefinitionParser`,
`OrRequestMatcherBeanDefinitionParser` (nests the group + `<xsd:any>` for
`<pen-gpc:system-gwt-rpc-request-matcher>`), plus trivial `all`/`none` →
`RequestMatcher.ALL` / `.NONE` factory beans.

---

## 4. Module shape

```
helix-security-web/
  pom.xml                          artifactId helix-security-web, parent pentaho-platform-ce-parent
  src/main/java/org/pentaho/platform/security/web/
    model/{matcher,csrf,cors,ssrf}/     interfaces + pojos + aggregators
    servlet/{csrf,cors,ssrf}/           the 3 filters + request wrappers + multipart
    jaxrs/csrf/                         CsrfTokenService (+ config interface bean)
    client/csrf/                        CsrfTokenFilter, SessionCookiesFilter (JAX-RS client)
    spring/                             SecurityWebNamespaceHandler + parsers
  src/main/resources/META-INF/
    spring.handlers  spring.schemas
    org/pentaho/platform/security/web/spring/hsw-1.0.xsd
  src/test/java/…                       see §6
```

Package `org.pentaho.platform.security.web.*` — consistent with decision 2 (don't
rename `org.pentaho`; this is *new* platform code, not a renamed HV package).
Single module (HV's api/model/service split buys nothing for CE).

Dependencies: `spring-security-web`, `spring-web`, `spring-context`,
`jakarta.servlet-api` (provided), `jakarta.ws.rs-api` (provided),
`spotbugs-annotations`, `commons-logging`. Test: junit4, mockito, spring-test,
`spring-security-test`, `mockwebserver` (already used by `CommandLineProcessor`
tests).

Wire into the reactor **after** it compiles green: add `<module>helix-security-web</module>`
to root `pom.xml` before `extensions`, and to `dependencyManagement`.

---

## 5. Reimplementation notes / risks

1. **CSRF — lean on SS6.** `CsrfGateFilter` delegates to
   `org.springframework.security.web.csrf.CsrfFilter` with:
   - `requireCsrfProtectionMatcher` → adapter over `AggregatedRequestSetCsrfConfiguration.isEnabled(req)`
   - `CsrfTokenRequestHandler` = `CsrfTokenRequestAttributeHandler` (or the
     `XorCsrfTokenRequestAttributeHandler`; must match whatever the current
     client/JS expects — **verify against `webContext`/PUC JS token handling**)
   - `CsrfTokenRepository` = `HttpSessionCsrfTokenRepository` with header
     `X-CSRF-TOKEN`, param `_csrf` (confirm names — PUC and the CLI both read
     `X-CSRF-{HEADER,PARAM,TOKEN}` from the token endpoint response)
   - body buffering only for the GWT-RPC chains (method-name is in the body).
2. **CORS — lean on SS6/Spring Web.** Bridge our resolved
   `CorsRequestSetConfiguration` → `org.springframework.web.cors.CorsConfiguration`,
   run `org.springframework.web.filter.CorsFilter`. The parent-inheritance +
   `abstract` root semantics are ours.
3. **SSRF — fully custom** (no framework equivalent). Behaviour to preserve:
   with `ssrf-protection-enabled=true`, a request is rejected when its effective
   origin (from `Origin`, else `Referer`, else `Host`/forwarded headers) is not
   in `{fully-qualified-server-url} ∪ {alternative-fully-qualified-server-urls}`.
   Confirm exact header precedence + what response (403? empty?) by black-box
   testing the current filter before deleting it.
4. **`pen:publish` identity.** `PublishedBeanRegistry` keys on the published
   interface type. The 3 system XMLs publish
   `…model.csrf.CsrfRequestSetConfiguration`, `…model.cors.CorsRequestSetConfiguration`,
   `…model.csrf.CsrfConfiguration`, `AggregatedRequestSetCsrfConfiguration`,
   `AggregatedRequestSetCorsConfiguration`. After the package rename these become
   `org.pentaho.platform.security.web.model.*` in **both** the publisher and the
   `<pen:list class="…">` consumer — they move together, so the contract holds.
5. **Filter order** in `filterChainProxy` is `ssrf → csrf → cors`, ahead of
   auth. Preserve exactly; it is load-bearing (CSRF token endpoint must be
   reachable pre-auth; SSRF must run before anything reads the body).
6. **`csrf-protection-enabled` / `cors-requests-allowed` defaults are `false`**
   in CE (`${system.csrf-protection-enabled:false}`). The happy path for a
   default CE install exercises very little of this — but EE / hardened installs
   turn it on, so it must be correct, not just present.
7. **GWT-RPC matcher `<xsd:any>`.** `OrRequestMatcher`'s content model allows
   foreign elements (`<pen-gpc:system-gwt-rpc-request-matcher>` from the
   `pentaho-gwt-rpc-spring` namespace). The `or` parser must delegate unknown
   children back to Spring's `parseCustomElement`.

---

## 6. Test strategy

- **Black-box baseline first.** Before deleting the HV filters, capture the
  current behaviour against a running server: CSRF token round-trip
  (`GET /api/csrf/token` → unsafe POST), a CORS pre-flight for an allowed and a
  denied origin, an SSRF-blocked request — with `*-protection-enabled=true`.
  Freeze as fixtures (extends the `helix-fork/phase0` harness).
- **Unit**: `RegexRequestMatcher` (pattern/method/case matrix), `OrRequestMatcher`,
  aggregators (bind/unbind, enabled precedence, CORS parent inheritance),
  namespace parsers (parse each `swm:`→`hsw:` element, assert the `BeanDefinition`).
- **Slice/integration**: stand up `filterChainProxy` with `MockMvc` +
  `spring-security-test`; replay the frozen fixtures against the new filters.
- **CLI**: `CommandLineProcessor` CSRF client against `mockwebserver` (pattern
  already in the repo).
- **Full**: build the `helix-security-web` candidate assembly, run the
  `phase0` gate-check + a PUC pass with `csrf-protection-enabled=true`.

---

## 7. Task breakdown / estimate

| # | task | est. |
|---|---|---|
| S0 | Black-box the current CSRF/CORS/SSRF behaviour → fixtures | 2–3 d |
| S1 | Module skeleton + poms + the 6 interfaces + `RequestMatcher.ALL/NONE` | 1 d |
| S2 | `RegexRequestMatcher`, `OrRequestMatcher`, pojos, both aggregators + unit tests | 3–4 d |
| S3 | `hsw:` namespace: handler + parsers + XSD + `spring.{handlers,schemas}` + tests | 2–3 d |
| S4 | `CsrfGateFilter` over SS6 `CsrfFilter` + body wrappers + multipart + tests | 4–6 d |
| S5 | `CorsProtocolFilter` over Spring `CorsFilter` + model bridge + tests | 3–4 d |
| S6 | `SsrfGateFilter` (custom) + `SsrfUtil`/`HttpUtil` + tests | 3–4 d |
| S7 | `CsrfTokenService` JAX-RS resource + wiring in `pentahoServices.spring.xml` | 2 d |
| S8 | CSRF JAX-RS **client** filters + `CommandLineProcessor` swap + tests | 2 d |
| S9 | Migrate the 3 system XMLs + 6 Java files + 3 pom edits; reactor wiring | 2 d |
| S10 | Full assembly build + gate-check + PUC pass (`*-protection-enabled=true`) + fix | 3–5 d |
| | **total** | **≈ 4–5 weeks, one engineer** |

Parallelisable: S4/S5/S6 are independent once S2–S3 land.

---

## 7a. S11 — CE / plugin split (2026-11-23)

**CE (`helix-security-web`, in `WEB-INF/lib`)** keeps the declaration side, because other
plugins (`data-access`, `scheduler-plugin`, …) declare `hsw:` request sets in their
`plugin.spring.xml` and must still load without the enforcement plugin:
model + aggregators, `hsw:` namespace, `CsrfTokenService` (`/api/csrf/token` → 204 with no
token headers when nothing is enforcing), the CLI CSRF client, and request-body wrappers.
The system configs `applicationContext-spring-security-{csrf,cors,ssrf}.xml` keep their
configuration beans; the SSRF pojo is now `pen:publish`ed so the plugin can resolve it.

**The slot:** `org.pentaho.platform.web.http.security.WebSecurityExtensionFilter` sits first in
every chain of `filterChainProxy` (where `ssrfGateFilter, csrfGateFilter, corsFilter` were). It
runs every `jakarta.servlet.Filter` published with attribute `helix.filter-slot=web-security`,
in publish-priority order, then the rest of the chain. Pass-through when the slot is empty.
Lookup is per request until `PentahoSystem.getInitializedOK()`, then cached; cache dropped on
plugin-manager reload.

**Plugin (`helix-security-web-plugin`)**, built in the reactor but not shipped by any CE
assembly: the three filters + `plugin.xml`/`plugin.spring.xml`, packaged as
`helix-security-web-plugin-<v>.zip` → unzip into `pentaho-solutions/system/`. Publishes one
`CompositeFilter` (SSRF → CSRF → CORS) into the slot; the filters take their configuration via
`pen:bean` from CE. The model jar is `provided` — must not be re-shipped in the plugin `lib/`.
The existing `system.properties` flags still switch each protection on/off.

Gotcha found during S11: a plugin context's `pen:publish` beans only reach `PentahoSystem` if
the context declares `ApplicationContextPentahoSystemRegisterer` (same as `data-access`,
`reporting`). Without it the slot silently stays empty.

Not split out (left in CE, pre-existing upstream code): the legacy `WebUtil.setCorsResponseHeaders`
path driven by `cors-requests-allowed` in `pentaho.xml`.

Replay tool: `fixtures/replay.sh <base-url>` prints every SPEC row with its expected
"spec" (plugin) and "off" (CE only) result.

## 8. Decisions (2026-11-23, answered by the project owner)

1. **Package/namespace → new names.** Keep `org.pentaho.platform.security.web` +
   `hsw:` (`http://www.pentaho.com/schema/security-web`). No drop-in
   `com.hitachivantara…` / `swm:` compatibility layer.
2. **CSRF/CORS/SSRF is OUT of Helix CE.** It will ship as a separate plugin.
   CE core keeps no web-security filters; `helix-security-web` becomes the
   basis of that plugin. (Follow-up work: remove the filters/beans and the
   `hsw:` blocks from CE system configs, move the module out of the CE
   reactor/WAR, decide how the plugin hooks into the filter chain.)
3. **CSRF token handler mode — checked in code, not a blocker.** Production
   `CsrfGateFilter` keeps Spring's default (`XorCsrfTokenRequestAttributeHandler`);
   `CsrfTokenService` returns the request-attribute token as-is. The clients
   (`pentaho/csrf/service` JS, GWT `CsrfRequestBuilder`, CLI `CsrfTokenFilter`)
   treat the token as opaque and echo it back in `X-CSRF-TOKEN`, so either mode
   works. S10 replay confirms the round trip (`POST prot + tok` passes).
   Not yet verified: a real browser PUC action with CSRF on — moves to the
   plugin's test plan per decision 2.
