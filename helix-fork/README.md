# Helix Platform Fork Plan

Take `pentaho-platform` from the **10.1** baseline, carry forward the work done on
**master-0718**, rename Pentaho → Helix, and land it in a **private** repository.

> ⚠️ **Before any engineering work, read §0 — Licensing.** The post-10.1 code
> (all 954 commits) was relicensed from LGPL-2.1 / GPL-2.0 to **Business Source
> License 1.1 with no production-use grant**. "Fork from 10.1 + apply master-0718
> changes + run Helix in production" is not permitted by that license as written.

## Locked decisions

| # | Decision | Effect on the plan |
|---|---|---|
| 1 | **Self-contained build** — hard air-gap *relaxed* to "own Nexus, proxy + promote-to-hosted" (see §4) | You still control every artifact and builds are reproducible forever, but you do **not** have to fork & rebuild ~20 upstream repos. Fork only what you must *modify* (parent POM, anything patched). Contingent on being allowed to redistribute the upstream binaries — see §0. |
| 2 | **Do not rename Java packages** | `org.pentaho.*` package names stay. Keeps reflection, Spring XML `class=`, GWT modules, `ServiceLoader` descriptors, and plugin APIs intact. Massively reduces regression risk and keeps future upstream merges tractable. |
| 3 | **Existing Pentaho content repositories must upgrade in place** | No greenfield assumption. Constrains: JCR namespaces unchanged (below), Spring bean ids referenced by plugins unchanged, solution-tree layout kept compatible. Upgrade must be a drop-in. |
| 4 | **Namespace different from Pentaho** — applies to Maven coordinates, distribution names, product branding. *Not* Java packages (decision 2), *not* JCR namespaces (decision 3). | Reactor groupId/artifactId → `com.helix.platform` / `helix-platform-*`; `pentaho-solutions` → `helix-solutions`; `pentaho.war` → `helix.war`; product name → "Helix". |
| 5 | **Keep JCR namespaces `pho` / `pho_nt` / `pho_mix` as-is** (`http://www.pentaho.org/jcr/2.0`) | Internal, invisible to users. No Jackrabbit namespace migration; in-place repo upgrade just works. |
| 6 | **Squash git history** | Seed the private repo with an orphan base commit (10.1 tree) + one squashed commit for the 10.1→master-0718 delta, then rebrand commits on top. No 954-commit replay. |
| 7 | **Eliminate Karaf / OSGi** | Separate work item with its own plan (**"Karaf Exit Plan"** + **"De-OSGi Phase One"**, and a local `deosgi/phase1-instrumentation` branch with committed groundwork). A 6-phase strangler migration, **~5–6 engineer-quarters CE / +1 quarter EE** — *not* something to bundle into v1. Deletes `org.hitachivantara.karaf.assemblies` + `org.apache.karaf.*` and ~727 MB of `system/karaf`. See §6 Phase K. |

**Any forked upstream libraries are *vendored*, not rebranded.** Only
`pentaho-platform` itself becomes Helix. Dependency repos keep their
`org.pentaho*` coordinates and packages.

---

## 0. Licensing — blocker, read first

The `10.1` branch and `master-0718` are **not under the same license.**

### 10.1 — LGPL-2.1 + GPL-2.0 (genuine open source, forkable)

Per-module `LICENSE.txt`, confirmed against source headers:

| Module | License | Header count (10.1) |
|---|---|---:|
| `api` | **LGPL-2.1** (11 GPL-2.0 outliers in `repository2/unified/webservices` DTOs) | 375 LGPL / 11 GPL |
| `core` | **GPL-2.0** | 509 GPL / 11 LGPL |
| `extensions` | **LGPL-2.1** | 991 LGPL / 1 GPL |
| `repository` | `LICENSE.txt` says LGPL-2.1 but **headers are GPL-2.0** (inconsistent upstream) | 309 GPL / 3 LGPL |
| `user-console` | **LGPL-2.1** | 177 LGPL |
| `build-utils` | **GPL-2.0** | — |
| tree-wide | ~4,716 LGPL-2.1 headers · ~2,504 GPL-2.0 headers | |

Implications for a "closed repository":

- **GPL-2.0 is strong copyleft.** If you distribute a Helix binary that includes a
  derivative of the `core` / `repository` / `build-utils` modules, you must offer
  the **complete corresponding source** (including your modifications) to every
  recipient, under GPL-2.0. A private *repo* is fine; a distributed *product* is
  not "closed" in the source sense.
- **LGPL-2.1** (api, extensions, user-console) is weaker — linking proprietary
  code against it is allowed — but modifications *to the LGPL files themselves*
  must be published under LGPL, and recipients must be able to relink.
- The platform is a single running application that mixes GPL and LGPL modules,
  so in practice the **GPL-2.0 obligations dominate** the shipped server.
- You may rebrand (the licenses don't grant trademark rights, but "Pentaho" is
  *their* mark — removing it is required, not optional) and you must preserve the
  existing copyright and license notices.

### master-0718 (and 10.2, 11.0, 11.x) — Business Source License 1.1

Relicensed in commit **`98288a2053`** ("HNC-766: updated license and copyright
headers", **2024-09-24**) — *after* the 10.1 cutoff (2024-06-28). **Every one of
the 954 post-10.1 commits carries the BSL header** (~2,571 files on master-0718).

```
Licensor:             Pentaho Canada Inc.
Licensed Work:        Pentaho Developer Edition 11.0
Additional Use Grant: None
Change Date:          Four years from the date the Licensed Work is published   (11.0 header: 2030-06-15)
Change License:       Apache 2.0
```

BSL 1.1 grants the right to **copy, modify, create derivative works, redistribute,
and make _non-production_ use**. With **"Additional Use Grant: None"**, *any*
production use requires a **commercial license from Pentaho Canada Inc.** On the
Change Date each version converts to Apache 2.0.

**Consequence:** the core premise — fork 10.1, apply the master-0718 delta, run
Helix in production — is **not permitted by the BSL** without a Pentaho
commercial/OEM agreement. Options, for legal to weigh:

| Option | What you get | Cost |
|---|---|---|
| **A. Commercial / OEM license from Pentaho** for the 11.x line | Everything in this plan proceeds as written; likely also grants artifact access (helps §4) | commercial negotiation |
| **B. Stay on the 10.1 LGPL/GPL tree only** | Genuinely forkable. But: no JDK 17/21, no Jakarta, no Tomcat 10, none of the ~57 post-10.1 security fixes. You backport fixes yourself as clean-room work | large ongoing eng effort; GPL source-offer obligation remains |
| **C. Wait for the Change Dates** | 11.0 → Apache 2.0 on 2030-06-15; 11.1 ~2031. Then no restriction | time |
| **D. Clean-room re-implement** the specific post-10.1 changes you need on the LGPL/GPL 10.1 base | Avoids BSL code | expensive, legally delicate, needs process discipline |

Everything below assumes **Option A** is obtained. If not, the plan collapses to
Option B and the scope changes completely.

---

## Baseline facts

| | |
|---|---|
| Baseline branch | `10.1` — last commit 2024-06-28 (10.1 Suite backports) |
| Head branch | `master-0718` — last commit 2026-08-27 (toward 11.1) |
| Merge base | `1e189265c25c62db9253908804f91541af8b4736` |
| Commits after 10.1 | **954** (614 non-merge, 340 merged PRs) |
| Files changed 10.1 → master | **4,224** (+146,686 / −107,980 lines) |
| Distinct Pentaho-family artifacts (direct) | **84** + ~55 Kettle plugin zips |

Data files in this folder:

| File | Contents |
|---|---|
| `commits-after-10.1-full.txt` | all 954 commits, newest first |
| `commits-after-10.1-nomerge.txt` | 614 authored commits with author |
| `merge-prs-after-10.1.txt` | 340 PR merge commits |
| `changed-files-10.1-to-master.txt` | 4,224 changed paths |
| `pentaho-dependencies.txt` | resolved Pentaho-family dependency coordinates |
| `helix-plan.html` | styled standalone version of this document |

Related, from the parallel Karaf investigation (Claude artifacts, 2026-08-27/28):

| Doc | Covers |
|---|---|
| **Karaf Exit Plan** | code-level analysis of how Karaf is wired in + the 6-phase strangler migration to remove it |
| **De-OSGi Phase One** | execution log — instrumentation, service-contract freeze, the 25-interface classification, scope corrections |
| branch `deosgi/phase1-instrumentation` | original 6 commits off `10.1` (~868 LOC in `core/.../objfac/`): `Phase0ServiceTrace`, OSGi bridge blocklist, `ClassicResolutionList` fall-through |
| **branch `helix-deosgi`** | those 6 commits **re-based onto `helix-main`** (2 manual merge resolutions), compiles + 19 unit tests green on **JDK 17** — the JDK-21 mock failure noted in "De-OSGi Phase One" does **not** reproduce on the Helix base |
| `helix-fork/phase0/` | the Phase-0 baseline harness for a running `helix-server`: `capture-baseline.sh`, `gate-check.sh`, `log4j2-phase0-trace.xml`, smoke-test checklist |

---

## 1. The two branches

Both branches are local; neither is a plain checkout of an upstream tag.

| | 10.1 | master-0718 |
|---|---|---|
| Reactor version | `10.1.0.0-SNAPSHOT` | `11.1.0.0-SNAPSHOT` |
| Parent POM | `org.pentaho:pentaho-ce-jar-parent-pom:10.1.0.0-SNAPSHOT` | `…:11.1.0.0-SNAPSHOT` |
| JDK | 11 | 17 / 21 (`JDK17`, `Upgrade-JDK`, `JDK-21` merged) |
| Servlet API | `javax.servlet` (0 Jakarta files) | `jakarta.servlet` (156 files migrated) |
| Servlet container | Tomcat 9 | Tomcat 10.x (`Tomcat-10.X`, #5962) |
| OSGi runtime | Karaf 4.x | Karaf 4.4.6 (`karaf-upgrade-4.4.6`) |
| `.java` files with `org.pentaho` package | 2,375 | 2,545 |
| Modules | `api core repository extensions user-console tomcat-logs assemblies build-utils` | same |

**Consequence:** the gap is a platform re-baseline (JDK, Jakarta EE, Tomcat,
Karaf), not just features. Basing Helix on `master-0718` means the Jakarta /
JDK-17 migration comes along for free — but it also means the forked upstream
libraries must be at their `11.x` (Jakarta-compatible) versions too, not `10.1`.

---

## 2. Commit delta since 10.1

`git log 10.1..master-0718` → **954 commits** over ~26 months; 614 non-merge
commits through 340 pull requests. Steady activity every month — no "big bang" to
cherry-pick around, upgrades interleaved with features. Regenerate:

```bash
git log --pretty='%h %ad %s' --date=short 10.1..master-0718      # full list
git log --merges --pretty='%h %ad %s' --date=short 10.1..master-0718   # merged PRs
git diff --stat 10.1 master-0718                                  # cumulative diffstat
```

### By work-item prefix (merged PRs)

| Prefix | PRs | Meaning |
|---|---:|---|
| BACKLOG | 80 | feature & bug work |
| BISERVER | 58 | BI server features & bugs |
| PPP | 57 | platform hardening / security |
| PPUC | 25 | Pentaho Platform User Console |
| PDI | 8 | Kettle / data integration |
| PPN / DEVO / other | 13 | infra, dev-ops, misc |

### Major initiatives inside the window

| Theme | What moved | Branches / PRs |
|---|---|---|
| JDK 11 → 17 → 21 | language level, `--add-opens`, reflection, removed APIs | `JDK17`, `Upgrade-JDK`, `JDK-21` (#6009, #6029) |
| javax → jakarta | servlet, JAX-RS, JAXB, mail, validation, websocket, JSP — 156 Java files + web descriptors | Tomcat-10 line, Jersey 2.44 upgrade |
| Tomcat 9 → 10.x | assembly, `web.xml`, context, classloading | `Tomcat-10.X` (#5962) |
| Karaf 4.4.6 | OSGi runtime, feature files, boot features, cache | `karaf-upgrade-4.4.6` (#5760–#5788) |
| Generic File System | new `pentaho-generic-file-system` API/impl abstraction | PPUC-124 and related |
| Security hardening | ~57 PPP tickets — XSS, CSRF, authz, path traversal; `com.hitachivantara.security.web` adoption | PPP-5370, PPP-6529, PPP-5969/5970 |
| Dependency / CVE churn | Spring, Spring Security, log4j2, commons-\*, jackson, xmlbeans, POI, Saxon, Guava, Drools 8 | dependabot + snyk-fix + PPP bumps |
| Test modernization | JUnit 5, Mockito 5, PowerMock removal, HSQLDB test fixtures | BACKLOG-50636 series (#6331–#6335) |

---

## 3. Pentaho dependency analysis

84 distinct Pentaho-family artifact coordinates across the 9 module POMs, plus
~55 Kettle plugin zips assembled into `pentaho-solutions`. Almost all share the
version `11.1.0.0-SNAPSHOT` — siblings in Hitachi's suite build. All resolve from:

```
https://repo.orl.eng.hitachivantara.com/artifactory/pnt-mvn/   (Hitachi Vantara "Pentaho Public")
```

### A. Sibling suite libraries — versioned `11.1.0.0-SNAPSHOT`

| Group | Artifacts | Role |
|---|---|---|
| `pentaho` | mondrian, common-ui, pentaho-metadata, pentaho-connections, pentaho-versionchecker, pentaho-service-coordinator, pentaho-generic-file-system-api / -impl, pentaho-osgi-utils-api, pentaho-metaverse-api, pentaho-capability-manager, pentaho-mongo-utils, pentaho-mongodb-plugin, pdi-osgi-bridge-core, pentaho-proxy-factory, pentaho-data | OLAP engine, shared UI, metadata layer, data connections, VFS/GFS, OSGi glue |
| `org.pentaho` | actionsequence-dom, commons-database-model, commons-gwt-widgets, commons-xul-core / -gwt-impl / -html, json, pentaho-chartbeans, pentaho-report-wizard-core, pentaho-registry, shim-api, shim-api-core, pdi-engine-api | XUL UI toolkit, commons, Hadoop shim API, action-sequence engine |
| `org.pentaho.reporting.engine` | classic-core, classic-extensions (+ cda, drill-down, kettle, mondrian, olap4j, pmd, reportdesigner-parser, sampledata, scripting, toc, xpath), legacy-charts, legacy-functions, wizard-core | Pentaho Reporting engine (~15 artifacts) |
| `org.pentaho.reporting.library` | libbase, libdocbundle, libfonts, libformat, libformula, libloader, libpixie, librepository, libserializer, libsparkline, libswing, libxml, flute | Reporting support libraries (~13 artifacts) |
| `org.pentaho.reporting.plugin` | classic-core-platform-plugin | Reporting-in-platform plugin |
| `pentaho-kettle` | kettle-core, kettle-engine, kettle-ui-swt | PDI / Kettle runtime (`pdi.version`) |
| `org.pentaho.di.plugins` | pdi-engine-configuration-api, pentaho-kettle-repository-locator-api, pentaho-metastore-locator-api | PDI engine SPI |

### B. Pinned, independently released Pentaho libraries

| Coordinate | Version |
|---|---|
| `pentaho:pentaho-concurrent` | 1.0.0 |
| `pentaho:pentaho-cwm` | 1.5.4 |
| `org.pentaho:pentaho-vfs` | 1.0 |
| `pentaho:simple-jndi` | `${simple-jndi.version}` |

### C. Third-party Hitachi Vantara libraries

| Coordinate | Role |
|---|---|
| `com.hitachivantara.security.web:security-web-server-api / -model-impl / -service-impl` | CSRF / security-web framework |
| `com.hitachivantara.security.web:csrf-token-service-client-java-jax-rs-v3` | CSRF token client |
| `org.hitachivantara.karaf.assemblies` | Karaf base assembly |

⚠ **No public source.** `com.hitachivantara.security.web:*` is proprietary
Hitachi code — not on GitHub. Recommended path: **build our own** (§3.C.1).
`org.hitachivantara.karaf.assemblies` disappears once Karaf is eliminated
(decision 7 / §6 Phase K).

### C.1 What `com.hitachivantara.security.web` does, and replacing it

It is a declaratively-configured web-security library layered on Spring Security.
Feature by feature:

| Feature | Classes used by the platform | Platform config | Replace with |
|---|---|---|---|
| **CSRF** — request-matcher-driven CSRF gate; token endpoint `GET /api/csrf/token`; client-side `CsrfTokenFilter` for the CLI import/export tool | `CsrfRequestSetConfigurationPojo`, `AggregatedRequestSetCsrfConfiguration`, `CsrfGateFilter` (via XML), `CsrfTokenFilter`, `SessionCookiesFilter` | `applicationContext-spring-security-csrf.xml` — a per-endpoint allow/deny matrix (`/api/user-settings/*`, `/api/repo/files/import`, GWT-RPC `unifiedRepository` methods, `/UploadService`, …) | Spring Security 6 `CsrfFilter` + `CsrfTokenRequestAttributeHandler`, a custom `RequestMatcher` built from the same patterns, and a small `/api/csrf/token` controller |
| **CORS** — aggregated per-request-set CORS with pre-flight handling; wired into the Spring Security `filterChainProxy` | `CorsRequestSetConfigurationPojo`, `AggregatedRequestSetCorsConfiguration`, `CorsProtocolFilter` | `applicationContext-spring-security-cors.xml` — root config from `pentaho.xml` / `system.properties` (`system.cors-*`) | Spring `CorsFilter` + `UrlBasedCorsConfigurationSource`, or Spring Security's `.cors()` DSL; keep reading the same `system.cors-*` properties |
| **SSRF** — outbound-request allowlist config | `SsrfConfigurationPojo` (`PentahoSsrfConfigurationPojo` wraps it) | `applicationContext-spring-security-ssrf.xml` | ~1 small config bean + an allowlist check in the HTTP client factory |
| **Request matchers** — `swm:` Spring XML namespace: `regex-request-matcher`, `or-request-matcher`, plus a GWT-RPC method matcher | `RegexRequestMatcher`, `AbstractGwtRpcRequestMatcher` extends it | used across the 3 XMLs above + plugin `plugin.spring.xml` files | Spring Security `RegexRequestMatcher` / `OrRequestMatcher` directly; re-implement the GWT-RPC one (~150 LOC, already partly platform code); provide a thin `swm:` `NamespaceHandler` **or** convert the 3 XMLs to plain `<bean>`s so plugins keep working |
| **Servlet wrappers** — cached/multi-read request bodies | `MultiReadHttpServletRequestWrapper`, `ManagedBodyServletRequestWrapper` | referenced from `RequestParameterAuthenticationFilter`, `MultiReadHttpServletRequest` (already deprecated in favour of the HV one) | ~200 LOC each; the platform already has its own `MultiReadHttpServletRequest` to fall back to |

**Actual footprint in `pentaho-platform`:** only **6 `src/main` Java files** import
`com.hitachivantara.security.web`, plus **3 Spring XML** files and the war/extensions
dependency blocks. Small and well-contained.

**Estimate for a `helix-security-web` module:** ~3–5 weeks on Spring Security 6.
Removes 4 unconfirmed-source dependencies. The fiddly part is the `swm:` XML
schema — decide up front whether to reproduce the custom namespace handler or
rewrite the 3 platform XMLs (and audit shipped `plugin.spring.xml` files for
`swm:` usage — a handful use it).

### D. Parent POM chain (external)

`org.pentaho:pentaho-ce-jar-parent-pom` → `pentaho-ce-parent-pom` →
`pentaho-parent-pom` (repo `pentaho/maven-parent-poms`). Pins hundreds of
third-party versions, the license-header plugin, the Artifactory repo
definitions, `maven.compiler` level. Fork this one (you need to change the repo
URLs and own the version pins anyway).

### E. Runtime Kettle plugins (assembled, not compile deps)

`assemblies/pentaho-solutions/pom.xml` pulls ~55 `org.pentaho.di.plugins:*` zips
into the shipped `system/` tree. Needed for a complete distribution. Most live in
the `pentaho-kettle` repo or `pentaho/pdi-*` plugin repos.

Full resolved list: `pentaho-dependencies.txt`.

---

## 4. Dependency hosting — you don't need a full fork program

### Is Hitachi's Maven repo guaranteed to stay up? No.

`repo.orl.eng.hitachivantara.com/artifactory/pnt-mvn/` is **Hitachi-controlled
infrastructure with no SLA to you.** Concrete risks:

- **It has moved before** — `nexus.pentaho.org` → `repository.pentaho.org` → the
  current Artifactory. It can move again.
- **SNAPSHOTs are purged** on a rolling window (typically weeks). `11.1.0.0-SNAPSHOT`
  is not a stable target.
- **Access is already partly gated** (the referenced `settings.xml` implies auth
  for some paths). It could be restricted further at any time.
- BSL relicensing (§0) shows the vendor actively changing terms; artifact access
  policy can change with it.

So: **do not build against it long-term.** But the fix is *hosting*, not
*rebuilding from source*.

### Three tiers — pick the middle one

| Tier | Mechanism | Reproducible? | Effort | When you need it |
|---|---|---|---|---|
| **1. Proxy cache only** | Nexus/Artifactory remote-proxy repo in front of Hitachi's | ❌ re-fetches on eviction; SNAPSHOT bytes drift | ~1 day | never sufficient alone |
| **2. Proxy + promote-to-hosted** ✅ **recommended** | Resolve once against the proxy, then **copy every resolved artifact into a hosted (immutable) repo** you control (`helix-releases`). Repoint the build at the hosted repo only. | ✅ frozen forever; survives Hitachi going away | ~1 week | **default** — satisfies "self-contained & reproducible" without forking anything |
| **3. Full source fork + rebuild** | Fork & build ~15–25 upstream repos (§4 old plan) on your Nexus | ✅ + you can patch them | ~4–8 months | only if you must *modify* those libs, or licensing forbids redistributing the binaries |

**Answer to "can I remove the air-gapped requirement":** **Yes — go with Tier 2**,
*provided* you are licensed to redistribute the upstream binaries into your own
Nexus. That condition folds straight back into §0:

- With a **Pentaho commercial/OEM license (Option A)** — redistribution of the
  11.x jars into your internal Nexus is normally covered, and the license usually
  comes with artifact-repo access. Tier 2 is clean.
- Without it, on the **10.1 LGPL/GPL base (Option B)** — the platform's own jars
  are LGPL/GPL and freely redistributable; you host them yourself trivially. Most
  10.x-era Pentaho library jars are likewise LGPL/Apache. Tier 2 still works.
- The proprietary `com.hitachivantara.security.web:*` jars are **not**
  redistributable either way → that's the argument for building your own (§3.C.1),
  independent of the Karaf/air-gap questions.

### What you still fork (a handful, not 20)

- **`maven-parent-poms`** — to own the repo URLs and version pins.
- **`com.hitachivantara.security.web`** replacement → `helix-security-web` (§3.C.1) — build, not fork.
- Anything you end up patching for JDK/Jakarta/CVE reasons that upstream hasn't fixed.
- Karaf/OSGi bundles you decide to keep after Phase K, if any need source changes.

Everything else: **resolve once, promote to `helix-releases`, done.**

The old full-fork mapping table (mondrian → `mondrian`, reporting →
`pentaho-reporting`, etc.) is retained in git history of this file / the earlier
`helix-plan.html` revision if Tier 3 ever becomes necessary.

---

## 5. Rename surface — Pentaho → Helix

`git grep -i pentaho` hits 4,556 files. With decisions 2 and 5 locked, the work
shrinks to branding + packaging:

| Surface | Rename? | Notes |
|---|---|---|
| Java packages `org.pentaho.*` (2,545 files) | **No** (decision 2) | — |
| JCR namespaces `pho` / `pho_nt` / `pho_mix`, node types `pho_nt:pentahoFile` … | **No** (decision 5) | invisible to users; keeps in-place upgrade drop-in |
| Spring custom XML namespace `http://www.pentaho.com/schema/pentaho-system` (`pen:` handler, ~37 files) | **No** | plugin contract; third-party plugins use it. In-place upgrade (decision 3) forbids breaking it |
| Spring bean ids in `pentahoObjects.spring.xml` / `pentahoSystemConfig` etc. | **No** | referenced by name across plugins — an API break |
| Maven coordinates `groupId=pentaho`, `artifactId=pentaho-platform-*` (9 POMs) | **Yes** → `com.helix.platform` / `helix-platform-*` | update `<scm>`, `<url>`, parent ref |
| Distribution / assembly names `pentaho-solutions`, `pentaho.war`, `pentaho-server` | **Yes** → `helix-solutions`, `helix.war`, `helix-server` | touches install paths, `CATALINA_BASE`, start scripts, `web.xml` context, `PENTAHO_INSTALLED_LICENSE_PATH` → `HELIX_…`, `solution-path` |
| UI branding — logos (`pentaho-logo.png/.svg`), favicons, About box, login screen, CSS in `pentaho-style` / `user-console` | **Yes** | the actual point of the exercise |
| i18n — user-visible "Pentaho" in 667 `messages*.properties` | **Yes** | sweep for display strings only |
| URLs — `pentaho.com`, `www.pentaho.org` doc links, support links | **Yes** → Helix domains/placeholders. **Keep** `http://www.pentaho.org/jcr/2.0` (JCR URI, decision 5) and `http://reporting.pentaho.org/namespaces/...` (reporting-engine contract) |
| License headers — "Copyright © … Pentaho / Hitachi Vantara", `license/templates/*`, per-module `LICENSE.txt` | **Yes (legal)** | Pentaho CE is **LGPL-2.1 / GPL-2.0**. A fork *adds* Helix notices and *preserves* the originals. Confirm with legal |
| Maven repo URLs `repo.orl.eng.hitachivantara.com` | **Yes** | → your Nexus (§4) |

### Naming to fix now

- Maven groupId: **`com.helix.platform`** (recommended) — distinct from `org.pentaho` Java packages, which stay
- Artifact prefix: `helix-platform-*`
- Product display name: **"Helix"** / "Helix Platform"
- Distribution: `helix-server`, `helix-solutions`, `helix.war`
- Env var / system properties: `PENTAHO_*` → `HELIX_*` (with back-compat fallbacks for in-place upgrade)

### Mechanics

- Case-preserving replacement (`Pentaho→Helix`, `pentaho→helix`, `PENTAHO→HELIX`), scripted, run per category, never one global sed.
- Order: file *contents* first, then `git mv` paths, then directories; commit in reviewable slices.
- **Exclusion list** (external contracts — never rewrite): the JCR `pho*` prefixes and `http://www.pentaho.org/jcr/2.0`; `http://www.pentaho.com/schema/pentaho-system`; `http://reporting.pentaho.org/namespaces/*`; upstream Maven coordinates you vendor (`org.pentaho.*`, `pentaho-kettle:*`, `org.pentaho.reporting.*`); Java `package` / `import` statements.
- Guardrail: full build + IT suite green before and after each slice; keep a read-only `pentaho-platform` mirror to diff against.

---

## 6. Execution plan

### Phase 0 — Legal & infra *(hard blocker, no platform code)*

- **Resolve §0.** Confirm which license path applies: Pentaho commercial/OEM
  agreement for the 11.x line (Option A — assumed by the rest of this plan), or
  fall back to the 10.1-only LGPL/GPL base (Option B — different plan). Nothing
  below starts until this is settled in writing.
- Legal sign-off on: GPL-2.0 source-offer obligation for the shipped server,
  LGPL-2.1 relink obligation, copyright-notice preservation, "Helix" trademark
  clearance, redistribution of upstream binaries into your Nexus (Tier 2, §4).
- Private Git remote; Nexus with a remote-proxy repo **and** a hosted immutable
  repo (`helix-releases`).
- CI runners: JDK 17 (primary) and JDK 21.
- Finalise names from §5.

### Phase 1 — Seed the private repo *(squashed history — decision 6)*

```bash
# fresh repo, orphan base at the 10.1 tree
git init helix-platform && cd helix-platform
git --git-dir=/path/to/pentaho-platform/.git archive 10.1 | tar -x
git add -A && git commit -m "Baseline: pentaho-platform 10.1 (squashed)"
git tag helix-base-10.1

# one squashed commit bringing the tree to master-0718
git --git-dir=/path/to/pentaho-platform/.git archive master-0718 | tar -x --overwrite
git add -A && git commit -m "Import pentaho-platform trunk 10.1..master-0718 (954 commits squashed)"
git tag helix-import-11.1

git remote add origin <private-url> && git push -u origin main --tags
```

Attach `helix-fork/commits-after-10.1-full.txt` to the second commit message or a
`PROVENANCE.md` so the squashed history stays auditable.

### Phase 2 — Freeze the dependency set *(Tier 2, §4 — ~1 week)*

1. Build the `master-0718` tree once against a Nexus **remote-proxy** of Hitachi Artifactory, clean `~/.m2`.
2. Capture `dependency:list` / `dependency:tree` for every module. This is the authoritative artifact inventory.
3. **Promote every resolved artifact** (Pentaho, `com.hitachivantara.*`, and all third-party) from the proxy into the hosted immutable repo `helix-releases`. For SNAPSHOTs, re-stamp to a fixed version (`11.1.0.0-helix.1`) so nothing is mutable.
4. Repoint `<repositories>` / `settings.xml` at `helix-releases` **only**. Disable the proxy.
5. Success test: `mvn -o` (offline) builds the platform tree end to end with **zero** external network access.

### Phase 3 — Own the platform build config

- Replace `pentaho-ce-jar-parent-pom` with `helix-platform-parent` (fork of `maven-parent-poms`, repointed at `helix-releases`).
- Reactor coordinates → `com.helix.platform:helix-platform-*`; `<scm>` / `<url>` → Helix.
- CI green on JDK 17 and 21; full IT suite (`-DrunITs`) baseline recorded.

### Phase 4 — Rebrand in reviewable slices

One commit/PR per slice, build + IT between each:

| Slice | Scope |
|---|---|
| 4a | Maven artifact + assembly names (`pentaho-solutions→helix-solutions`, `pentaho.war→helix.war`, `pentaho-server→helix-server`) |
| 4b | Runtime paths, start scripts, system properties, `web.xml` context, license-path env var (with `PENTAHO_*` back-compat fallbacks for in-place upgrade) |
| 4c | UI branding: logos, favicons, About / login, `pentaho-style` / `user-console` CSS |
| 4d | i18n sweep of 667 `messages*.properties` — user-visible strings only |
| 4e | URLs & doc links → Helix (respecting the §5 exclusion list) |
| 4f | License headers: add Helix copyright, preserve Pentaho / HV notices; update `license/templates` + per-module `LICENSE.txt` |

### Phase S — Replace `com.hitachivantara.security.web` *(~3–5 weeks, parallel)*

New `helix-security-web` module on Spring Security 6 (§3.C.1). CSRF gate + token
endpoint, CORS protocol filter, SSRF allowlist, request matchers, servlet body
wrappers. Rewrite the 3 `applicationContext-spring-security-{csrf,cors,ssrf}.xml`
files; decide `swm:` namespace-handler reproduce-vs-rewrite; audit shipped
`plugin.spring.xml` for `swm:` usage. Removes 4 non-redistributable deps.

### Phase K — Eliminate Karaf / OSGi *(own workstream, ~5–6 engineer-quarters CE — decision 7)*

> **Measured against a running `helix-server` on 2026-09-01** — see
> `helix-fork/phase0/FINDINGS.md`. The earlier estimates below (from the "Karaf
> Exit Plan" / "De-OSGi Phase One" artifacts) were sized against a *fat*
> `ps-ce-10.1` install; the stock **helix-main CE build is dramatically smaller**:
>
> | | fat install (artifacts) | **helix-main CE (measured)** |
> |---|---|---|
> | `system/karaf` | 727 MB | **62 MB** |
> | `featuresBoot` | + dataservice, data-refinery, marketplace, hadoop-shims, hadoop-cluster-ui | `(http,kar) config management community-edition pentaho-server pentaho-metaverse` — nothing else |
> | OSGi object bridge | ~30 interfaces / 5 bundles | **6 interfaces** at runtime, 5 from `pentaho-blueprint-activators` (+ 22 already on `ClassicResolutionList`) |
> | `/osgi/cxf/*` | i18n, lineage, hadoop-cluster, … | **i18n + lineage only**; no hardcoded `/osgi/cxf/hadoop-cluster/*` rules |
> | runtime client-module federation | large | **one `require-init.js` path**: `pentaho/i18n-osgi` |
> | big-data / dataservice / modeler / data-refinery | booted via Karaf | **not in the build** |
>
> Instrumentation is on branch **`helix-deosgi`** (`helix-main` + 6 commits); the
> Phase-0 baseline + harness are in `helix-fork/phase0/`.
>
> **Update, 2026-09-01: dropping `pentaho-metaverse` (data lineage) too**
> (decision). Re-ran the full smoke test against that config — report rendering
> and a CDF dashboard verified with real output content, not just HTTP 200. With
> metaverse out, **the OSGi object bridge is down to 5 resolutions and only 1 is a
> genuine Pentaho interface** (`IAuthorizationRule`, itself just a classic bean
> echoed into OSGi by `pentaho-blueprint-activators`) — everything else is Aries
> Blueprint infra or Felix `ConfigurationAdmin`, both retired with the container
> in Phase 5. `baseline/no-metaverse/` is now the canonical Helix reference
> config.
>
> **Update, 2026-09-02: visual PUC pass DONE** (Playwright, no-Karaf/no-metaverse
> server). Logged in, walked every perspective — Reporting+Prompting (Invoice
> report, full data), CDF dashboard (live queries), Browse Files/JCR, Scheduler,
> Administration. No OSGi-only i18n content missing; every label renders as words,
> not `[keys]`; `require-init.js` static file serves 200; zero `/osgi/*` failures;
> no `i18n-osgi!` module refs anywhere. Console 404s are all pre-existing
> dev-profile packaging / sample-content issues with working fallbacks. Full
> results + table in `helix-fork/phase0/FINDINGS.md`.

**Verdict: feasible, but a strangler migration in 6 phases, not one step.** Every
phase leaves a working server. Karaf is glued to the server at **4 coupling
points** and must be removed **last, never first**:

| # | Coupling | Where | Un-wire when |
|---|---|---|---|
| ① | HTTP bridge — `/pentaho/osgi/*` → Felix `ProxyServlet` | `pentaho-war/.../web.xml` | nothing serves from `/osgi/*` anymore |
| ② | Object bridge — `OSGIObjectFactory` registered into `PentahoSystem` | `PentahoOSGIActivator`, `core/.../objfac/` | end — it already fails safe (returns null) |
| ③ | Boot listener — `OSGIBoot` (extends `KarafBoot`) is **first** in `systemListeners.xml` | `assemblies/pentaho-solutions/.../systemListeners.xml` | the literal last step |
| ④ | Startup barrier — `KarafFeatureWatcherBarrier=jcrRepository` gates JCR start on Karaf features | `barrierbean.properties` | removed with ③ |

**Key findings that shrink the object-bridge problem:**

- The whole OSGi → `PentahoSystem` object bridge carries only **~30 interfaces
  from 5 bundles, and ~28 are from `pentaho-blueprint-activators`** — the
  platform's *own* Spring beans echoed back through OSGi. Only ~3 are genuinely
  bundle-native (`ConfigurationAdmin`, `IDatabaseDialect` from a hive plugin,
  `IPluginPerspective` from marketplace).
- A 9-restart blocklist campaign on the live server classified 25 platform
  interfaces: **13 free removals · 3 targeted fix · 6 coupled security cluster ·
  3 later-phase**.
- **The real first engineering task** is a platform fix, not a deletion:
  `AbstractSpringPentahoObjectFactory.getObjectReferences()` is a stub and the
  aggregate fallback is name-based, so every `<pen:publish>`'d bean currently
  *depends on the OSGi bridge to be resolvable by type*. One ticket — make the
  classic `<pen:publish>` path serve type-based lookups without OSGi — likely
  unblocks most of Tier 2 **and** the Tier 3 security cluster at once.

**The structurally hard parts (the real cost):**

- **Client-side module federation.** `pentaho-requirejs-osgi-manager` +
  `pentaho-webpackage` generate `osgi/requirejs-manager/js/require-init.js` (~95 KB)
  *at runtime* from whatever bundles are installed. Replacement = a **build-time
  precomputed manifest** for the fixed shipped plugin set, served static.
  (~1–1.5 quarters.)
- ~~**PDI / big-data.**~~ **DE-SCOPED (decision, 2026-08-31).** Helix will **drop**
  big-data, `pentaho-hadoop-shims`, `data-refinery`, `pdi-dataservice-*` and
  `pentaho-modeler` entirely — not migrate them. Phase 4 collapses from
  "~1–1.5 quarters of classic-plugin repackaging" to **"delete the feature
  entries + bundles + their `<dependency>` blocks, remove the hardcoded
  `/osgi/cxf/hadoop-cluster/*` security rules, verify nothing else references
  them"** (~2–3 weeks). This also removes `shim-api` / `shim-api-core` /
  `pentaho-mongodb-plugin` / big-data kettle plugins from §3–4. Server-side
  *plain* PDI (run a transformation / job via `pdi-pur-plugin` + `kettle-*`)
  stays; check whether it still needs `pdi-osgi-bridge` once the big-data
  Kettle-OSGi plugins are gone (it may not).

**Scope corrections from the code review** (things my earlier draft mis-scoped):

| Item | Reality | Where it actually goes |
|---|---|---|
| Cache (guava/ehcache) → Spring | `org.pentaho.caching.api.*` has **no consumer in `pentaho-platform`**; server uses the legacy `ICacheManager` (already non-OSGi, 23 files). OSGi cache is a `pdi-dataservice-ee` concern | Phase 4 (PDI), confirm-only in Phase 1 |
| i18n bundle → classic | `LocalizationService` is genuinely OSGi-coupled (a `BundleListener` scanning `OSGI-INF/l10n`) | server resolver moves early; client federation endpoint → Phase 2/3 |
| Kerberos / JAAS `SpringSecurityLoginModule` | exists **only** to authenticate OSGi services against the platform realm; nothing else calls it | Phase 5 deletion, not a migration |
| Jackson / Gremlin / `org.json` de-wrap | `jackson-*` are already plain `mvn:` bundles; the remaining `wrap:` entries exist *because OSGi bundles consume them* (gremlin ← `pentaho-metaverse-web`, jackson-jaxrs ← CXF-in-Karaf) | Phase 2/3, with those consumers |
| VFS providers, streaming steps, metastore/repo locators as "OSGi-only" | correct that they're OSGi today; classic plugin framework already provides every needed extension point (`<bean>`, `<webservice type="jaxrs">`, `<content-generator>`, `<static-path>`, `<lifecycle-listener>`, child-first `PluginClassLoader`) | re-host as classic plugins per phase |

**The 6 phases** (from the Karaf Exit Plan — each independently shippable, gated
by a Phase-0 regression baseline + automated diff harness):

| Ph | Scope | Fat-install est. | **Helix CE (measured)** |
|---|---|---|---|
| 0 | Instrument + baseline the running server + diff harness | 2–3 wk | **done** — `helix-deosgi` + `helix-fork/phase0/` |
| 1 | `<pen:publish>` type-resolution ticket; add the ~4 `pentaho-blueprint-activators` interfaces to `ClassicResolutionList` | 4–6 wk | **~2 wk** |
| 2 | Re-host `/osgi/cxf/i18n` + `/osgi/cxf/lineage` on the WAR (`PluginDispatchServlet` / Jersey); shadow `/osgi/*` | 4–6 wk | **~2–3 wk** (only 2 endpoints; i18n resolver is a plain bean) |
| 3 | Build-time static `require-init.js` for the shipped plugin set | 1–1.5 quarters | **~1 wk** (one OSGi path entry in CE) |
| 4 | Drop big-data / hadoop-shims / data-refinery / dataservice / modeler | 1–1.5 quarters | **~0** (not in the build) |
| 5 | Delete the container (`osgiListener` bean, `KarafFeatureWatcherBarrier`, `KarafBoot`/`OSGIBoot`/`KarafInstance*`/`PentahoOSGIActivator`/`OSGI*ObjectFactory`, Felix `ProxyServlet` + `/osgi/*` mapping, `org.hitachivantara.karaf.assemblies` unpack, the `system/karaf` tree) | 3–4 wk | 3–4 wk |

**Measured total for a Karaf-free Helix CE: ~8–12 weeks, one engineer** (was
"5–6 quarters"). **Fold Phase K into v1.** **EE adds ~1 quarter** (analyzer,
`cxf-jaxrs`, monitoring). Re-validate the Phase-3 number if Helix ends up
shipping Analyzer / VizAPI / PDI-web, which federate more client modules.

⚠ **Coupling found (Phase-0 trim experiment):** removing the `pentaho-metaverse`
feature also removes the **entire CXF-in-Karaf stack**, including `/osgi/cxf/i18n`.
Do Phase 2 (re-host i18n on the WAR) *before* dropping data lineage, or
OSGi-contributed UI message bundles silently stop loading.

**Caveats for the Helix context specifically:**

- ~~The analysis + `deosgi/phase1-instrumentation` are on the 10.1/JDK-11 base and
  need re-basing.~~ **Done — branch `helix-deosgi`** (6 commits on `helix-main`,
  2 trivial merge resolutions in `PentahoSystemPluginManager` / a test). Compiles
  + **19 objfac unit tests green on JDK 17**, including the ones that mock
  `org.osgi.framework.Bundle` / `ServiceReference` — so the JDK-21 mock failure
  from "De-OSGi Phase One" **does not reproduce** on the Mockito-5 Helix base.
- New source files (`Phase0ServiceTrace`, `ClassicResolutionList`) still carry the
  10.1-era GPL-2.0 header — normalise in rebrand slice 4f (they are Helix-authored,
  so the header is a choice, not an obligation).
- `feature/no-osgi` upstream (`BACKLOG-46513`, last commit 2025-10-09, diverged,
  BSL) is a *different, incomplete* attempt — a hint, not a drop-in. Prefer the
  strangler plan above, which has a working baseline harness.
- Karaf removal is the one workstream that can be **deferred past v1**: ship Helix
  with Karaf (just re-host `org.hitachivantara.karaf.assemblies` — see §4), then
  run Phase K as a follow-on program. It does not block the rebrand or the
  in-place upgrade.

### Phase 5 — Upgrade path & release

- Build full `helix-server` assembly; boots on Tomcat 10 / JDK 17 (Karaf re-hosted for v1, or removed if Phase K is done first).
- **In-place upgrade test (decision 3):** stand up a real Pentaho 10.1 server with content (reports, schedules, ACLs, data sources) in its Jackrabbit repo → deploy Helix over it → verify login, repo browse, run report, run transformation, run schedule, import/export round-trip. This is the acceptance gate.
- Security scan + license scan (FOSSA / Snyk) on the closed tree.
- Document the upstream-merge procedure: read-only `pentaho-platform` remote, `git merge -X` strategy, the §5 exclusion list as a `.gitattributes` merge-driver config, cadence for pulling upstream security fixes.

### Rough order of magnitude *(assumes §0 Option A)*

| Workstream | Estimate | Parallel? |
|---|---|---|
| Phases 1–4: seed + freeze deps (Tier 2) + build config + rebrand | **~8–12 weeks**, one engineer who knows the platform | — |
| Phase S: `helix-security-web` | **~3–5 weeks** | yes |
| Phase 5: in-place-upgrade hardening & test matrix | **~3–4 weeks** | after Phases 1–4 |
| **Phase K: eliminate Karaf / OSGi** (measured against the running helix-server) | **~8–12 weeks CE**, one engineer, **+1 quarter EE** | fold into v1 |

**Recommended single track — Karaf-free Helix v1: ~4–6 months** for a small team.
The Phase-0 measurement (`helix-fork/phase0/FINDINGS.md`) collapsed the two phases
that used to dominate: big-data/dataservice/modeler aren't in the CE build at all,
and the runtime client-module federation is a single `require-init.js` entry, not
a quarter of work. Keeping Karaf and re-hosting its assembly is still an option if
schedule pressure demands it, but the gap to Karaf-free is now weeks, not quarters.

Phase K does not block the rebrand or the in-place upgrade — treat it as a
follow-on program with its own plan (already drafted: "Karaf Exit Plan").

---

## 7. Risks & open items

| # | Risk | Mitigation |
|---|---|---|
| **R0** | **BSL 1.1 forbids production use of the post-10.1 code without a Pentaho license (§0)** | Phase 0 hard gate — Option A (commercial license) or Option B (10.1-only). No workaround at the engineering layer. |
| R1 | GPL-2.0 (`core`, `repository`, `build-utils`) obliges a complete-corresponding-source offer to anyone you distribute the server to | Legal Phase 0; a private repo is fine, a distributed product must carry the source offer; keep the offer process ready |
| R2 | `com.hitachivantara.security.web` is proprietary, not redistributable | Build `helix-security-web` (Phase S) — footprint is only 6 files + 3 XMLs |
| R3 | Hitachi Maven repo moves / purges SNAPSHOTs / restricts access | Phase 2 Tier-2 freeze into immutable `helix-releases`; re-stamp SNAPSHOTs to fixed versions |
| R4 | In-place upgrade breaks on a renamed system property / path / bean id | `PENTAHO_*` back-compat fallbacks; §5 exclusion list; Phase 5 upgrade gate with real 10.1 content |
| R5 | **Removing `OSGIBoot` out of order is fatal** — it's deliberately the first system listener and JCR start is barrier-gated on Karaf features | Container is Phase K's *last* step; the diff harness + `ClassicResolutionList` fall-through enforce ordering. See the Karaf Exit Plan §00–02 |
| R6 | Phase K's hard cost is not the container — it's the **runtime client-module federation** (RequireJS/WebPackage) and the **big-data/PDI OSGi surface** this install actually boots | Phase 3 build-time manifest + Phase 4 classic-plugin repackaging with child-first classloaders; ~1–1.5 quarters each; freeze the `pdi-osgi-bridge` API for PDI-client parity |
| R7 | Phase K analysis + the `deosgi/phase1-instrumentation` branch are on the **10.1 / JDK 11** base; the OSGi test mocks fail on JDK 21 | Re-base the 6 commits onto `helix-main`; the Mockito 5 / byte-buddy 1.14 upgrade already in the delta likely removes the JDK-21 mock failure — verify in Phase K/0 |
| R8 | Divergence from upstream — future Pentaho security fixes must be merged (and are BSL) | Read-only upstream remote; packages unchanged (decision 2) keeps merges tractable; merges only under the §0 license |
| R9 | 10.1→master gap includes JDK 17/21 + Jakarta — a big migration comes with the delta | Base on `master-0718`, not a cherry-picked subset (given Option A) |
| R10 | Reporting-engine XML namespaces (`http://reporting.pentaho.org/...`) are wire/format contracts | On the §5 exclusion list — never rewrite; existing report files depend on them |
| R11 | Marketplace / runtime plugin hot-deploy is an OSGi capability; classic plugins need restart-to-install | Product decision (Phase K §07); classic drop-in install + restart, or build a lightweight watch-reload |

### Still open (decide during Phase 0)

1. §0 license path — **A** (commercial) or **B** (10.1-only). Everything depends on this.
2. Exact groupId: `com.helix.platform` vs `com.helix` vs `helix`.
3. Product name: "Helix" vs "Helix Platform" vs "Helix BI".
4. Karaf: eliminate now (Phase K) or defer and just re-host the assembly?
5. `swm:` Spring namespace — reproduce the handler or rewrite the 3 platform XMLs + audit plugins.
6. `-helix.N` version suffix on frozen upstream jars — yes (traceability) or no (minimal diff).
