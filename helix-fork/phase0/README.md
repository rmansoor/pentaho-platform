# Phase 0 — baseline the running `helix-server`

You have a `helix-server` built from `helix-main`. Before touching anything else,
capture what a working server looks like. Every later phase (rebrand slices,
`helix-security-web`, Karaf removal) is gated on "this baseline still passes".

## 0. Add the OSGi instrumentation to your build

The `helix-deosgi` branch (off `helix-main`, 6 commits) carries the tracer:

```bash
git checkout helix-deosgi
JAVA_HOME=$(/usr/libexec/java_home -v 17) mvn -pl core,extensions -am install -DskipTests
# then rebuild the assembly / re-deploy the pentaho-platform-core + -extensions jars
```

It adds, in `core/.../engine/core/system/objfac/`:

| Thing | What it does | Switch |
|---|---|---|
| `Phase0ServiceTrace` | logs every `PentahoSystem.get()` that resolves **through OSGi** — `OSGI-RESOLVE iface=… bundle=…` | `-Dpentaho.osgi.phase0.trace=true` |
| bridge **blocklist** | makes the forward bridge *decline* named interfaces, so you can prove they resolve classically without OSGi | `-Dpentaho.osgi.phase0.blocklist=<fqcn,fqcn|@file>` |
| `ClassicResolutionList` + `de-osgi-classic-interfaces.txt` | the **permanent** version of the blocklist — 22 interfaces already validated as classic-resolvable | edit the `.txt`, or `-Dpentaho.osgi.classic.additions=` |

Zero runtime effect when the properties are unset. 19 unit tests, green on JDK 17.

## 1. Enable the trace

- Merge `log4j2-phase0-trace.xml` into
  `tomcat/webapps/pentaho/WEB-INF/classes/log4j2.xml`.
- Add to `CATALINA_OPTS` / `setenv.sh`: `-Dpentaho.osgi.phase0.trace=true`
- Start the server.

## 2. Functional smoke test — the regression reference

Do these by hand (or script with the browser), in order. This **is** the
acceptance checklist for every later phase.

| # | Action | Pass = |
|---|---|---|
| 1 | Log in to PUC as `admin` | home perspective loads, no JS 404s in console |
| 2 | Browse Files → open `/public` | tree renders, folders expand |
| 3 | Run a sample report (e.g. *Steel Wheels / Inventory*) | report viewer renders output |
| 4 | Run a sample transformation / job via **pdi-pur-plugin** | completes, output in the repo |
| 5 | Create a schedule on that report, run it now | job appears in Schedules, status **COMPLETE** |
| 6 | Admin perspective → Users/Roles, Data Sources | panels populate |
| 7 | Export `/public` to a `.zip` | download succeeds |
| 8 | Import that `.zip` back to `/tmp/restore` | files land, no errors in `pentaho.log` |
| 9 | `tail pentaho.log` for the whole run | **0** `ERROR`, no new `WARN` vs a clean boot |

Record pass/fail + notes in `baseline/<date>/SMOKE.md`.

## 3. Capture the machine-readable baseline

```bash
./capture-baseline.sh \
  --server-dir /path/to/pentaho-server \
  --url http://localhost:8080/pentaho \
  --user admin --password password \
  --out ./baseline/$(date +%Y%m%d)
```

Writes: `/osgi/*` + REST HTTP surface (status + sha256), `require-init.js`,
`feature:list -i`, `service:list`, `bundle:list`, `http:list`, the `featuresBoot`
line, every config file referencing `/osgi/`, the hardcoded `/osgi/cxf/*` security
paths, `system/karaf` size + bundle inventory, and — if the trace was on — the
`(interface,bundle)` resolution CSV + a by-bundle rollup.

Commit `baseline/<date>/` to `helix-deosgi`.

## 4. Trim the feature set, re-capture, diff

Helix drops big-data / hadoop-shims / data-refinery / dataservice / modeler
(decision, 2026-08-31). Remove them from the boot set and see what's actually left:

- Edit `pentaho-solutions/system/karaf/etc/org.apache.karaf.features.cfg` →
  `featuresBoot`: delete `pentaho-hadoop-shims-apache-kar`,
  `pentaho-hadoop-cluster-ui`, `pdi-data-refinery`, `pentaho-dataservice-legacy`,
  and (if present) modeler / marketplace.
- Also drop their `<dependency>` blocks from `assemblies/pentaho-solutions/pom.xml`
  and the `org.pentaho.di.plugins:*` big-data plugin zips, so they stop being
  unpacked into `system/`.
- Restart, re-run the smoke test, re-run `capture-baseline.sh --out baseline/trimmed`.

```bash
./gate-check.sh baseline/<full-date> baseline/trimmed
```

The diff between the two captures is the **decision input**: if what remains in
Karaf after the trim is just i18n + RequireJS federation + a handful of CXF
endpoints + the object bridge (which the trace shows is ~30 interfaces, ~28 of
them the platform's own beans), Phase K folds into Helix v1. If something
load-bearing is still OSGi-only, it stays a follow-on program. See
`helix-fork/README.md` §6 Phase K and the "Karaf Exit Plan" artifact.

## Files here

| File | |
|---|---|
| `capture-baseline.sh` | the capture harness |
| `gate-check.sh` | diff a fresh capture vs the frozen baseline |
| `log4j2-phase0-trace.xml` | routes the trace logger to `logs/osgi-resolutions.log` |
| `baseline/` | committed captures (created on first run) |
