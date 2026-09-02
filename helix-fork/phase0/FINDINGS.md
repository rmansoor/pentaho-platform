# Phase-0 findings — `helix-server` (helix-main build), 2026-09-01

Ran a real `helix-server` assembled from `helix-main` (Tomcat 10.1.57, JDK 17,
bundled HSQLDB), with the `helix-deosgi` instrumentation jars swapped in and
`-Dpentaho.osgi.phase0.trace=true`. Captured `baseline/full/` (stock config) and
`baseline/trimmed/` (`pentaho-metaverse` removed from `featuresBoot`).

## TL;DR — Karaf's footprint in the Helix CE build is tiny

The "Karaf Exit Plan" and "De-OSGi Phase One" were sized against a fat
`ps-ce-10.1` install (727 MB `system/karaf`, boot set with dataservice-legacy,
data-refinery, marketplace, hadoop-shims, hadoop-cluster-ui, ~40 big-data Kettle
bundles). **The stock `helix-main` CE assembly boots none of that.**

| Metric | Karaf Exit Plan (fat install) | **helix-main CE (measured)** |
|---|---|---|
| `system/karaf` size | 727 MB | **62 MB** static / 106 MB after boot |
| `featuresBoot` | http, kar, config, management, community-edition, pentaho-server, pentaho-metaverse, **dataservice-legacy, data-refinery, marketplace, hadoop-shims-apache-kar, hadoop-cluster-ui** | `(http,kar), config, management, community-edition, pentaho-server, pentaho-metaverse` — **that's all** |
| Pentaho OSGi bundles staged | many | **16** (all infrastructure — list below) |
| OSGi → PentahoSystem object bridge | "~30 interfaces from 5 bundles" | **6 interfaces**, 5 of them from `pentaho-blueprint-activators` |
| hardcoded `/osgi/cxf/hadoop-cluster/*` security rules | yes | **none** (`hardcoded-osgi-cxf-paths.txt` is empty) |
| `/osgi/cxf/*` services | i18n, lineage, hadoop-cluster, … | **i18n + lineage only** |
| runtime client-module federation (`require-init.js` OSGi paths) | large | **one entry**: `pentaho/i18n-osgi` |

## The measured OSGi object-bridge contract — 6 interfaces

After a full smoke exercise (login, repo browse, report render, `.xaction`
transformation run, scheduler, `require-init.js`, `/osgi/cxf`), the trace shows
every interface that resolved **through OSGi**:

| interface | serving bundle | disposition |
|---|---|---|
| `java.lang.ClassLoader` | pentaho-blueprint-activators | blueprint infra |
| `org.springframework.context.ApplicationContext` | pentaho-blueprint-activators | blueprint infra |
| `org.springframework.context.support.GenericApplicationContext` | pentaho-blueprint-activators | blueprint infra |
| `org.pentaho.platform.api.engine.security.authorization.IAuthorizationRule` | pentaho-blueprint-activators | **platform's own bean, echoed back** — add to `ClassicResolutionList` |
| `org.pentaho.metaverse.api.analyzer.kettle.step.IStepExternalResourceConsumerProvider` | pentaho-blueprint-activators | metaverse SPI — gone if metaverse is dropped |
| `org.osgi.service.cm.ConfigurationAdmin` | felix-configadmin | dies with the container (Phase 5) |

Plus the **22** already on `ClassicResolutionList` (`de-osgi-classic-interfaces.txt`),
confirmed active at boot: `OSGI-CLASSIC active - 22 interface(s) resolved by the
classic platform only`.

So the forward bridge (`OSGIObjectFactory`) carries, for a fully-exercised Helix
CE server, **~4 platform interfaces that aren't already handled** — all published
by `pentaho-blueprint-activators`, all the platform's own beans. The Karaf Exit
Plan's "Phase 1 = classify 25 interfaces over 9 restarts" is effectively already
done for this configuration.

## The 16 staged Pentaho OSGi bundles

All infrastructure — none are functional plugins:

| bundle | role | Phase-K destination |
|---|---|---|
| `pentaho-blueprint-activators`, `pentaho-proxy-spring4` | the object bridge (classic beans ↔ OSGi) | delete with bridge |
| `pdi-osgi-bridge-activator` | Kettle plugin-registry ↔ OSGi | non-OSGi shim or drop |
| `pentaho-osgi-utils-impl` | `KarafFeatureWatcher` startup barrier | delete the barrier line |
| `pentaho-i18n-bundle`, `pentaho-i18n-webservice-bundle` | i18n message federation for JS + `/osgi/cxf/i18n` | re-host on the WAR (Phase 2) |
| `pentaho-metaverse-web` | data-lineage `/osgi/cxf/lineage` | drop, or re-host (Phase 2) |
| `guava-cache-provider`, `pentaho-cache-manager-api`, `pentaho-ehcache-provider` | OSGi cache (server uses legacy `ICacheManager`; this serves PDI data services) | drop with dataservice |
| `pentaho-requirejs-osgi-manager` + `requirejs-manager-{api,impl}` + `webpackage/*` (5) + `requirejs-listener-impl` | runtime client-module federation | **precompute a static manifest — see below** |
| `pentaho-webjars-deployer`, `pentaho-bundle-resource-manager`, `pentaho-platform-plugin-deployer` | OSGi deployers | delete with container |
| `pentaho-server-bundle` | OSGi substrate | delete with container |
| `spring-security-karaf-login-module` | authenticates OSGi services only | delete with container |

## The "structurally hard part" is not hard here

Karaf Exit Plan Phase 3 (replace runtime RequireJS/WebPackage federation with a
build-time manifest) was estimated at **1–1.5 quarters**. In the Helix CE build
the entire OSGi contribution to `require-init.js` is:

```
full:     "paths":{"pentaho/i18n-osgi":"/@pentaho/i18n-osgi@11.1.0.0-SNAPSHOT/js/i18n"}
trimmed:  "paths":{}                                       (metaverse feature removed)
```

**One path entry.** The classic plugins (common-ui, reporting, CDF/CDE, data-access,
…) already contribute their RequireJS config through `<external-resources
context="requirejs">`, which is not an OSGi path. Precomputing a static
`require-init.js` for the Helix plugin set is days, not a quarter — *unless* the
final Helix ships Analyzer / VizAPI / PDI-web, which federate more; re-capture
with those installed before trusting this.

## The metaverse trim — a real coupling

Removing `pentaho-metaverse` from `featuresBoot` (clean cache, restart):

- **Smoke test stayed green**: login, 15 plugins, `/public` tree, report render,
  `.xaction` transformation, scheduler `RUNNING`, `require-init.js` all 200.
- **But `/osgi/cxf` → 404** — removing the metaverse feature took down the
  **entire CXF-in-Karaf stack**, including the `/osgi/cxf/i18n` webservice. In
  this build the Apache CXF feature rides in with `pentaho-metaverse`.
- `require-init.js` lost its one OSGi path (`pentaho/i18n-osgi`).

**Implication:** if Helix drops data lineage, the i18n JS-federation endpoint
must be re-homed on the WAR *first* (Karaf Exit Plan Phase 2 — small: the i18n
resolver is a plain bean, the endpoint is one JAX-RS resource). Don't drop
metaverse without doing that, or OSGi-contributed UI message bundles silently
stop loading.

## Revised Phase K estimate for Helix

| Karaf Exit Plan phase | fat-install est. | **Helix CE reality** |
|---|---|---|
| 0 — instrument + baseline | 2–3 wk | **done** (this doc + `helix-deosgi`) |
| 1 — `<pen:publish>` type resolution + move non-structural services | 4–6 wk | ~2 wk — `<pen:publish>` fix + add ~4 blueprint-activator interfaces to `ClassicResolutionList` |
| 2 — re-host `/osgi/cxf/*` (i18n, lineage) on the WAR | 4–6 wk | ~2–3 wk — only 2 endpoints; i18n resolver is a plain bean |
| 3 — static RequireJS/WebPackage manifest | 1–1.5 quarters | **~1 wk** — one OSGi path entry in CE |
| 4 — big-data / dataservice / modeler off OSGi | 1–1.5 quarters | **~0** — not in the build |
| 5 — delete the container | 3–4 wk | 3–4 wk — same |

**Karaf-free Helix CE ≈ 8–12 weeks**, one engineer — not 5–6 quarters. Fold it
into v1. Re-validate the RequireJS number if Helix ships Analyzer/VizAPI/PDI-web.

## Smoke-test results (baseline reference)

| # | check | full | trimmed |
|---|---|---|---|
| 1 | login (`j_spring_security_check`) | 302→Home, `isAuthenticated=true` | same |
| 2 | `/public` repo tree | 200, Steel Wheels + plugin-samples present | 200 |
| 3 | render *Inventory List* report (table/html) | 200, 2.2 MB, `<table>` + data | 200 |
| 4 | run *SampleTransformation.xaction* | 200, "Action Successful"; Kettle log shows QUADRANT_ACTUALS query (148 rows), JS step, XML output | 200 |
| 5 | scheduler `state` | `RUNNING`; `jobs` 200 (v1 API, deprecated) | `RUNNING` |
| 6 | `require-init.js` | 200, 89 KB | 200, 89 KB (−72 B) |
| 7 | `/osgi/cxf` service listing | 200 (i18n + lineage) | **404** |
| 8 | plugins registered | 14–15 (reporting, cda, data-access, cdf, cde, scheduler, cgg, common-ui, xaction, url, …) | 15 |

Known gaps: scheduler **job creation** via REST returned 500 (v1 deprecated) /
404 (v2 path guess) — the scheduler *service* is up; verify job create via PUC or
the correct v2 path. `/osgi/cxf/i18n/messages` 404 on bare GET (needs `?_wadl` or
a sub-path). Neither blocks Phase 0.

## Addendum — `pentaho-metaverse` confirmed dropped (decision, 2026-09-01)

User confirmed dropping data lineage entirely. Re-ran the full smoke test (login,
`/public` browse, **Inventory report render — verified real data: "1958 Chevy",
`S10_` product codes**, **CDF sample dashboard render — verified, no errors**,
`.xaction` transformation, scheduler, GWT/mantle bootstrap) against the
metaverse-removed config (`baseline/no-metaverse/`) — all green.

**Object bridge with metaverse dropped: down to 5 resolutions, only 1 is a
genuine Pentaho interface:**

| interface | bundle | why it's still OSGi |
|---|---|---|
| `org.pentaho.platform.api.engine.security.authorization.IAuthorizationRule` | pentaho-blueprint-activators | **the only remaining Pentaho-domain interface** — a classic bean echoed into OSGi; candidate #1 to add to `ClassicResolutionList` |
| `java.lang.ClassLoader`, `org.springframework.context.ApplicationContext`, `org.springframework.context.support.GenericApplicationContext` | pentaho-blueprint-activators | generic infra the Aries Blueprint container needs internally |
| `org.osgi.service.cm.ConfigurationAdmin` | felix-configadmin | pure OSGi — dies with the container in Phase 5 |

**UI bootstrap chain verified intact via HTTP** (no visual browser check — the
Claude-in-Chrome extension wasn't connected this session): `/Home` 200, GWT
`mantle.nocache.js` 200, `require-init.js` 200 (empty OSGi paths — the classic
plugins' own RequireJS config, served via `<external-resources
context="requirejs">`, is unaffected). `webcontext.js` references only the
still-working `require-init.js` URL; no other `/osgi/*` reference appears in
served HTML/JS. **Recommend one manual PUC pass** (browser, message strings
render correctly rather than as raw i18n keys, a CDE editor session) before
treating this as fully proven — HTTP status codes don't catch a silently-missing
translated string.

**Revised Phase 1 scope**: the `<pen:publish>` type-resolution ticket now only
needs to additionally cover **one** interface (`IAuthorizationRule`) rather than
~4. Phase 2 (re-host `/osgi/cxf/i18n`) may be **droppable entirely** if the manual
UI pass confirms no OSGi-only i18n content is actually served — worth checking
before committing engineering time to re-hosting it.

Canonical baselines going forward: `baseline/no-metaverse/` (metaverse out, full
smoke) supersedes `baseline/full/` as the Helix reference config;
`baseline/trimmed/` (first metaverse-removal pass, partial smoke) is kept for
provenance.

## Addendum 2 — Karaf-removal spike (branch `helix-nokaraf`, 2026-09-01)

**Result: the Helix CE server boots and runs with Karaf completely gone.** Five
mechanical changes, no code changes:

| # | Change | File |
|---|---|---|
| 1 | Remove `<bean id="osgiListener" class="…OSGIBoot"/>` | `pentaho-solutions/system/systemListeners.xml` |
| 2 | Empty the `KarafFeatureWatcherBarrier=jcrRepository` line | `pentaho-solutions/system/barrierbean.properties` |
| 3 | Remove the `PdiOsgiBridge` `<registry-extension>` block | `pentaho-war/WEB-INF/classes/kettle-registry-extensions.xml` |
| 4 | Remove the Felix `ProxyServlet` + `/osgi/*` mapping + `ProxyListener` | `pentaho-war/WEB-INF/web.xml` |
| 5 | Serve a static `require-init.js` at `/osgi/requirejs-manager/js/require-init.js` (interim — captured empty-`paths` version; Phase K3 replaces it with a build-time generator) | `pentaho-war/webapp/osgi/…` |

Plus, for a real build: stop unpacking `org.hitachivantara.karaf.assemblies` into
`system/karaf` and drop the `org.apache.karaf.*` / `org.apache.felix.*` deps from
`assemblies/pentaho-war/pom.xml` (not done in the spike — the deployed `system/karaf`
was just moved aside).

### What the spike found (the reason it's not zero-effort)

**`pdi-osgi-bridge-core`'s `OSGIPluginRegistryExtension` hard-hangs boot.** With
only #1 + #2 done, the main thread stuck **forever** in
`OSGIPluginRegistryExtension.init()` (`pdi-osgi-bridge-core`, line ~115) — an
**unbounded** `while (!OSGIPluginTracker.registerPluginClass(...)) { sleep(1000); }`
loop, no timeout, no disable flag. It also calls `KarafBoot.startup()` directly.
It is registered as a Kettle plugin-registry extension via
`kettle-registry-extensions.xml`, so #3 (removing that entry) is **mandatory**, not
optional. `KarafLifecycleListener` (same jar) did not need separate handling once
#3 was done.

### Smoke test — no-Karaf server, all green

Boots in **~23 s** (vs ~26–28 s with Karaf). `baseline/no-karaf/`.

| check | result |
|---|---|
| login, `isAuthenticated`, version | 200 |
| 15 plugins registered | reporting, cda, cdf, **cdf-dd (CDE)**, data-access, scheduler-plugin, common-ui, xaction, url, cgg, monitoring-eventbus, pur-repository, pdi-platform, … |
| `/public` repo tree | 200 |
| **Inventory report** render (table/html) | 200, `<table>` + data |
| **`SampleTransformation.xaction`** (real Kettle run) | 200 |
| **CDF sample dashboard** render | 200 |
| **CDE editor** (`renderer/edit?path=…`) | 200 — component palette renders |
| scheduler `state` | RUNNING |
| PUC `/Home`, `mantle.nocache.js`, `webcontext.js`, `common-ui require-cfg` | 200 |
| static `require-init.js` | 200 (after #4 — the `/osgi/*` proxy mapping was shadowing it) |
| Users / Roles (admin) | 200 |
| `/osgi/cxf`, `/osgi/cxf/i18n` | 404 (gone — acceptable, see the metaverse coupling above) |
| **OSGi resolution trace** | **0 bytes** — the object bridge did nothing all session |
| startup log mentions of `karaf` / `OSGIBoot` / `felix` / `blueprint` | **0** |
| `pentaho.log` ERRORs | only pre-existing noise (HSQLDB port, DI_HOME warning, missing EE `pentaho-interactive-reporting`, probe 404s) |

### Step A — build-config cleanup (2026-09-01)

Landed on `helix-nokaraf`:

- `assemblies/pentaho-solutions/pom.xml` — removed the
  `org.hitachivantara.karaf.assemblies:server` unpack into `system/karaf`.
  **The 62 MB `system/karaf` tree stops shipping.** Also removes one
  non-redistributable Hitachi dependency from the air-gap surface.
- `assemblies/pentaho-war/pom.xml` — removed 6 now-dead dependencies:
  `org.apache.karaf.main`, `.jaas.boot`, `.diagnostic.boot`, `.util`,
  `org.apache.felix.http.proxy`, and `pdi-osgi-bridge-core`.

Safe because **no live `src/main` code imports `org.apache.karaf.*`,
`org.apache.felix.http.*`, or `org.pentaho.di.osgi.*`** — only the dead
`KarafBoot` / `OSGIBoot` / `KarafInstance*` classes do, and those compile against
`extensions/pom.xml`'s own `org.apache.karaf.main` dep (untouched, deleted in
Step B). `core`'s `osgi.core` dep stays for the still-compiled (dead)
`OSGIObjectFactory` — removed in Step B.

Needs a clean rebuild to confirm; then the `karaf` folder is gone.

### Step A — verified (clean build)

`system/karaf` gone. Distribution **−52 MB** (zip 801 → 747 MB). Boots in 25 s,
full smoke green, `gate-check.sh` vs `baseline/no-karaf`: **PASS**, OSGi trace
0 bytes. `org.apache.karaf.{main,jaas.boot,util}` still in `WEB-INF/lib` as
transitive deps via `pentaho-platform-extensions` — cleared by Step B.

### Step B — delete the dead Karaf source (2026-09-01)

Deleted **2,495 lines / 19 files** — the self-contained Karaf cluster:

`extensions/…/osgi/`: `OSGIBoot`, `KarafBoot`, `KarafInstance`, `KarafInstancePort`,
`IKarafInstanceResolver`, `ServerSocketBasedKarafInstanceResolver`,
`KarafInstanceResolverException`, `PentahoOSGIActivator`, `SystemPackageExtrapolator`,
`ExceptionBasedClientTypeProvider`, `IClientTypeProvider` + 8 test classes. The
`extensions/…/osgi/` package is now empty. Removed `org.apache.karaf.main` from
`extensions/pom.xml` (its only consumer was `KarafBoot`).

`core` + `extensions` **compile + test-compile clean on JDK 17** (`BUILD SUCCESS`).

**Kept deliberately** (compile fine, load-bearing or harmless):

| class | why kept |
|---|---|
| `core/…/objfac/OSGIObjectFactory`, `OSGIUtils`, `OsgiPentahoObjectReference` | now truly dead (only `PentahoOSGIActivator` registered `OSGIObjectFactory`, and it's gone) but still referenced by `OSGIRuntimeObjectFactory` / `ClassicResolutionList` / `Phase0ServiceTrace`. Removing them is **Step C** — touches `PentahoSystem`'s factory chain, needs its own IT cycle. |
| `core/…/objfac/OSGIRuntimeObjectFactory` | **load-bearing** — `PentahoSystem.defaultObjectFactory()` registers it as the runtime object factory; `<pen:publish>` / `registerReference()` flow through it (WI-1.7 already made it work without OSGi). |
| `extensions/…/web/http/ConfigurationAdminNonOsgiProxy` | **live** — `PentahoWebContextFilter` uses it; degrades to null cleanly without OSGi. |
| `core/…/objfac/spring/*` + `PublishedBeanRegistry` | **load-bearing** — the `<pen:publish>` machinery. |
| `Phase0ServiceTrace`, `ClassicResolutionList` | measurement scaffolding; keep until Step C. |

`osgi.core` / `osgi.cmpn` stay in `core/pom.xml` — API jars (no OSGi runtime),
still needed for `org.osgi.service.cm.ConfigurationAdmin` in `ConfigurationAdminNonOsgiProxy`.

### Step B — verified (clean build)

`system/karaf` gone; `org.apache.karaf.{main,jaas.boot,util}` jars gone from
`WEB-INF/lib`. Distribution **709 MB** (−92 MB total). Boots 24 s, full smoke +
`gate-check` **PASS**, OSGi trace 0 bytes.

### Step C — delete the OSGi object-factory bridge (2026-09-02)

The forward bridge was never registered after `PentahoOSGIActivator` went (Step B),
and the reverse-bridge / runtime factory is a pure pass-through to
`RuntimeObjectFactory` whenever `bundleContext == null` — which is now always.
So both come out cleanly. Deleted (6 main + 1 resource + 4 tests):

- `core/…/objfac/`: `OSGIObjectFactory`, `OSGIRuntimeObjectFactory`,
  `Phase0ServiceTrace`, `ClassicResolutionList`, `de-osgi-classic-interfaces.txt`
- `core/…/system/osgi/`: `OSGIUtils`, `OsgiPentahoObjectReference` (package now empty)

`PentahoSystem.java`:
- `defaultObjectFactory()` now `new RuntimeObjectFactory()` (was `OSGIRuntimeObjectFactory`)
- removed `import org.osgi.framework.BundleContext` and the
  `public static void setBundleContext( BundleContext )` method (no production caller —
  only `PentahoOSGIActivator`, deleted in Step B)

**No `src/main` code in `core` imports `org.osgi` anymore.** `core` + `extensions`
compile + test-compile clean on JDK 17 (`BUILD SUCCESS`).

Left in place: `core/pom.xml`'s `osgi.core` dep (unused now, but a tiny API jar —
low-value/low-risk trim for later); `extensions` keeps `osgi.cmpn` for
`ConfigurationAdminNonOsgiProxy`'s `org.osgi.service.cm.ConfigurationAdmin` import.
The WI-1.4-Tier2 lazy `getSystemConfig()` in `PentahoSystemPluginManager` stays —
it's a genuine improvement (removed a fragile field initializer), independent of OSGi.

**Phase K is now code-complete for CE** — Karaf, the OSGi bridge, and all the
instrumentation scaffolding are gone. What remains is the build-time
`require-init.js` generator (K3) and regression.

### Not verified

- **Clean rebuild after Step C** + full IT suite (`-DrunITs`).
- **Visual PUC pass** — Claude-in-Chrome extension wouldn't connect.
  HTTP + rendered-output checks are strong (report data, CDF/CDE render), but a
  human should click through PUC once: message strings render as words not
  `[keys]`, CDE drag-drop works, Analyzer is N/A on CE.
- A **full clean build** of `helix-nokaraf` (the spike patched a deployed server;
  the source edits are committed but not yet built into an assembly).
- `pentaho-war` pom cleanup (drop karaf/felix jars) and the `system/karaf` unpack
  removal — deferred to the real Phase K5.

### Revised Phase K estimate — even lower

The spike collapsed most of the risk. Remaining work to a shippable Karaf-free
Helix CE:

| task | est. |
|---|---|
| Land #1–#5 on a branch + full clean build + assembly | ~3–5 days |
| Build-time `require-init.js` generator (Phase K3) | ~1 wk |
| `pentaho-war` pom: drop `org.apache.karaf.*` / `org.apache.felix.*` deps; stop unpacking `system/karaf` | ~2–3 days |
| Add `IAuthorizationRule` to `ClassicResolutionList`; delete `OSGIBoot`/`KarafBoot`/`KarafInstance*`/`PentahoOSGIActivator`/`OSGI*ObjectFactory`/`pdi-osgi-bridge` dep | ~1 wk |
| Regression: full IT suite + the smoke matrix + one manual PUC pass | ~1 wk |
| **Total** | **~4–5 weeks, one engineer** |

The old "8–12 weeks" was conservative; the "5–6 quarters" from the fat-install
analysis does not apply to Helix CE at all.

## Environment notes

- JDK **17** — the `helix-deosgi` objfac unit tests (19, incl. `org.osgi.framework.Bundle`
  mocks) pass on 17. The JDK-21 mock failure from "De-OSGi Phase One" is a
  Mockito-4/byte-buddy-1.11 issue; `helix-main` ships Mockito 5.10 — **not a
  constraint on the Helix base**.
- HSQLDB sample DB on **9001** (not 9092). Server's internal `HsqlDatabaseStarterBean`
  logs one ERROR when it finds 9001 already bound — benign, the external DB serves.
- Embedded Karaf shell SSH (port 8802 / `karaf.port`) was not reachable for
  `feature:list`; the resolution trace + jar inventory + `require-init.js` diff
  are the authoritative sources and were sufficient.
- Working copy: `~/Developer/helix-phase0/pentaho-server` (throwaway). Original
  war jars backed up in `.phase0-orig-jars/`, config in `*.phase0-orig`.
