# Upstream artifact inventory (step 4)

Captured 2026-11-24 on `helix-rebrand`, after S12 and the console-message interim rebrand.
This lists what the Helix build still takes from Pentaho/Hitachi as **binaries**: things
we must either mirror into a private Nexus (Phase 2) or fork and own (Phase 3+).

It is read-only: nothing in the build was changed to produce it.

## How it was captured

```sh
# every module, all scopes, transitive, offline
mvn -o -fae dependency:list -DoutputFile=<out>/deps.txt -DappendOutput=true
# plugins, parent poms and dependency-plugin artifactItems (not visible to dependency:list)
python3 -I helix-fork/inventory/pomscan.py > helix-fork/inventory/pom-scan.txt
```

Upstream = groupId in `pentaho`, `pentaho-kettle`, `org.pentaho*`, `com.pentaho*`,
`org.hitachivantara*`, `com.hitachivantara*`, minus this repo's 20 reactor artifactIds.

## Totals

| Kind | Count | File |
|---|---:|---|
| All resolved artifacts (every scope, incl. third-party) | 734 coords | `resolved-all.txt` |
| Upstream **libraries** (jars + `common-ui` zip) | 73 unique G:A | `resolved-upstream.txt` |
| Upstream **plugin zips** unpacked into `pentaho-solutions` / samples | 71 | `unpacked-upstream.txt` |
| Upstream **parent poms** | 3 | below |
| Upstream **Maven plugins** | 2 | below |
| Third-party artifacts that only Pentaho's Artifactory hosts (likely) | ~8 | below |

`com.hitachivantara.security.web` is **gone** (0 hits) — S10/S11 replaced it.

All 71 plugin zips and every library are present in `~/.m2` at `11.1.0.0-SNAPSHOT`, so the
offline build still works today. But they are moving `-SNAPSHOT` timestamps from
`repo.orl.eng.hitachivantara.com`, the only `<repository>` in the root pom.

## 1. Build chain (blocks everything — own first)

| Artifact | Role | Upstream repo (likely) |
|---|---|---|
| `org.pentaho:pentaho-ce-jar-parent-pom` → `pentaho-ce-parent-pom` → `pentaho-parent-pom` | root parent of the reactor | `pentaho/maven-parent-poms` |
| `org.pentaho.maven.plugins:license-helper-maven-plugin` | declared in pentaho-parent-pom | Pentaho maven plugins |
| `org.hitachivantara.karaf.tooling:karaf-maven-plugin` | declared in pentaho-parent-pom | Hitachi Karaf fork |

This is Phase 3's `helix-platform-parent`.

## 2. Libraries, grouped by upstream project

| Upstream project (likely repo) | Artifacts | Notes |
|---|---|---|
| **pentaho-reporting** | `org.pentaho.reporting.engine:*` (16), `org.pentaho.reporting.library:*` (14), `org.pentaho.reporting.plugin:classic-core-platform-plugin`, `org.pentaho:pentaho-report-wizard-core`, `org.pentaho:pentaho-chartbeans` | largest block |
| **pentaho-kettle** | `pentaho-kettle:kettle-core / kettle-engine / kettle-dbdialog / kettle-ui-swt`, `org.pentaho:pdi-engine-api`, `org.pentaho.di.plugins:pdi-engine-configuration-api / pentaho-kettle-repository-locator-api / pentaho-metastore-locator-api` | |
| **pentaho-commons-gwt-modules** | `org.pentaho:commons-gwt-widgets` (+sources) | **ships the console's `mantleMessages*.properties`** — see §5 |
| **pentaho-commons-xul** | `org.pentaho:commons-xul-core / -gwt-impl / -html / -swing / -swt` | |
| **pentaho-commons-database** | `org.pentaho:commons-database-model` | |
| **pentaho-metadata** | `org.pentaho:pentaho-metadata`, `pentaho:pentaho-cwm:1.5.4` | |
| **mondrian** | `pentaho:mondrian` | |
| **metastore** | `pentaho:metastore` | |
| **pentaho-platform-plugin-common-ui** | `pentaho:common-ui` (zip) | also unpacked into solutions |
| **pentaho-osgi-bundles / commons** | `pentaho:pentaho-connections`, `pentaho-capability-manager`, `pentaho-service-coordinator`, `pentaho-proxy-factory`, `pentaho-osgi-utils-api`, `pentaho-versionchecker`, `pentaho-vfs-browser`, `pentaho-generic-file-system-api / -impl`, `org.pentaho:pentaho-registry`, `pentaho-encryption-support`, `actionsequence-dom`, `json`, `pentaho-vfs:1.0` | many small repos; mapping to verify |
| **pentaho-mongodb-plugin** | `pentaho:pentaho-mongodb-plugin`, `pentaho-mongo-utils` | |
| **Pentaho-versioned third-party** | `pentaho:simple-jndi:1.0.14`, `pentaho:pentaho-concurrent:1.0.0` | fixed versions, mirror once |
| **Hitachi** | `org.hitachivantara.karaf.bundle:org.hitachivantara.karaf.bundle.core:4.4.6-2026.07.06`, `org.hitachivantara:jackson-dataformat-yaml:2.14.1` | Hitachi-rebuilt forks of OSS |

## 3. Plugin zips in the server (`unpacked-upstream.txt`)

Pulled by `maven-dependency-plugin` `artifactItem`s, mostly in `assemblies/pentaho-solutions`:

- **56 × `org.pentaho.di.plugins:*`** — PDI step/job plugins (excel, json, rest, sftp, kafka,
  jms, mqtt, s3, salesforce, sap, avro, pur, meta-inject, bulk loaders, …). Mostly from
  `pentaho-kettle/plugins`, with a few separate repos.
- **9 × `pentaho:*`** — `data-access-plugin`, `pentaho-scheduler-plugin`, `pentaho-cdf`, `cda`,
  `pdi-platform-utils-plugin`, `pentaho-pdi-platform-plugin-package`, `common-ui`, and the
  `pentaho-cdf-samples` / `cda-samples` sample zips.
- **3 × `org.pentaho.ctools:*`** — `pentaho-cdf-dd` (CDE), `cgg`, `pentaho-cdf-dd-samples`.
- `org.pentaho.reporting.plugin:classic-core-platform-plugin-package`, `org.pentaho:vertica-bulkloader-plugin`.
- ⚠ **`com.pentaho.di.plugins:mongodb-plugin`** — note the `com.pentaho` group, which is the
  EE naming. Check its licence before redistributing it in Helix CE.

These are product scope decisions as much as forking work: each zip is a feature we either
keep (and must own or mirror) or drop from the Helix server.

## 4. Third-party artifacts probably only on Pentaho's Artifactory

These are not on Maven Central under these coordinates (to confirm when the Nexus proxy is set up):

- `wkhtmltopdf:wkhtmltoimage-{amd64,OSX,i386}:0.10.0_rc2-static` (tar.bz2), `wkhtmltopdf:wkhtmltox:installer` (exe) — pentaho-server
- `com.google.code.gwtx:gwtx:1.5.4-java11`, `GWT-FX:GWT-FX:0.5.0`, `com.google.gwt:gwt-incubator:2.1.0` — user-console
- `ofc4j:pentaho-ofc4j:1.1.0`, `barbecue:barbecue:1.5-beta1` (marker says `pentaho-public`)
- `org.netbeans:nbmdr:200507110943-custom`
- `org.apache.tomcat:tomcat:${tomcat.version}:windows-x64` (zip) — on Central, but 10.1.59 is not cached locally, which is why the full server zip doesn't build offline

## 5. Where the console strings really come from

`org.pentaho:commons-gwt-widgets` contains
`org/pentaho/mantle/public/messages/mantleMessages.properties` and
`org/pentaho/mantle/login/public/messages/MantleLoginMessages.properties`. The user-console
GWT compile copies module `public/` resources into `mantle/messages/`, so this upstream jar
is the true source of the "Pentaho User Console" strings.

**Resolved (R5):** the 12 bundles that carry the product name are now owned in
`user-console/src/main/resources/org/pentaho/mantle/…/messages/`; GWT takes them over the jar's
copies, so no fork of pentaho-commons-gwt-modules is needed for branding. The other bundles still
come from the jar unchanged. `helix-check-console-messages` in `pentaho-war` guards against regressions.

## Suggested order

1. **Freeze** (Phase 2): mirror everything in `resolved-all.txt`, plus the 71 zips, the 3
   parent poms and the 2 plugins, into a hosted Nexus. Re-stamp the SNAPSHOTs to a fixed
   Helix version. The build then no longer depends on Hitachi.
2. **Own the build chain**: fork the parent poms into `helix-platform-parent` (Phase 3).
3. **Fork by need**, not wholesale. Do the repos we must change first:
   `pentaho-commons-gwt-modules` for branding; `common-ui` and the platform plugins we keep.
   Leave reporting, kettle and mondrian as mirrored binaries until a change is needed.
4. **Decide the plugin scope** in §3: drop what Helix won't ship before mirroring it forever.
