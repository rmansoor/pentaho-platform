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
