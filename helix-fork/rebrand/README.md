# Helix rebrand — status

Branch **`helix-rebrand`** (off `helix-nokaraf`). All commits `mvn process-resources`
verified; every `.properties` diff is 1:1 with line endings preserved (incl. CRLF).

## Done — mechanical user-visible TEXT

| Slice | Commit | Scope |
|---|---|---|
| R1 | `478ff18` | login page, PUC header/title, About box, admin intro, docs InfoMap, home/getting-started; `InitFailure.jsp` / `MantleDebug.jsp` `<title>`, `pentaho-style` `about.html` + `<display-name>`, `ROOT/index.jsp` |
| R2 | `5d6b4d0` | **100 message bundles** (core/extensions/repository/scheduler2), all locales — `PentahoSystem` errors, `MessageFormatter`, datasource/connection errors, repo-sync warnings |
| R2b | `c893632` | CJK stragglers + script hardening |
| R3 | `2ad8a30` | `welcome.html`, mantle Community-Collaboration-Plugin HTML (`welcome/index.html`, `ccp_sub-*.html`), `DebugMantle.html`, repository `package.html` javadoc |
| R4 | `b0df334` | `welcome/js/main.js` "Helix Live Chat" |

**~145 files, ~550 line edits.** The i18n message-bundle rebrand is essentially
complete — remaining `Pentaho` in bundles is only `pentaho.xml` /
`pentahoObjects.spring.xml` config-file references, class names (`IPentahoConnection`,
`PentahoSystemDriver`), `pentaho.com` URLs, and copyright text — all deferred by design.

## The tool — `rebrand-strings.py`

`--check` / `--apply <glob>...`. Case-preserving (`Pentaho`→`Helix`, `PENTAHO`→`HELIX`).
- **never renames a property KEY** (API contract) — only the display value
- line-ending safe (`newline=""` on read+write)
- skips: copyright/license lines (multilingual + `&copy;`/`©`), `COPYRIGHT`/
  `USER_ABOUT_TEXT`/`LICENSE` keys, `org.pentaho`/`com.pentaho` FQCNs,
  `PentahoSystem`-style class prefixes (uppercase-follows), `pentaho/x` module
  paths, `class="org.` bean defs, and the deferred-identifier list
  (`pentaho.xml`, `pentaho-solutions`, `pentaho.war`, `pentaho-server`, `PENTAHO_*`)
- `\uXXXX`-escape-aware lookbehind (a trailing hex char before `Pentaho` in a
  `.properties` value is not treated as a mid-identifier)

## Not done — needs decisions or artwork

| Slice | Blocker |
|---|---|
| **URLs** (`pentaho.com`, `academy.pentaho.com`, `docs.pentaho.com`, `pentaho.com/marketplace`, forum links) | need Helix domains / whether a Helix docs site / academy / marketplace / community exist. **Keep** the namespace URIs: `http://www.pentaho.org/jcr/{2.0,nt/2.0,mix/2.0}`, `http://www.pentaho.com/schema/pentaho-system(.xsd)`, `http://www.pentaho.com/schema/pentaho-gwt-rpc-spring`, `http://reporting.pentaho.org/namespaces/*`, `http://www.pentaho.org/ws/1.0` (JAX-WS QName) |
| **Images** — 27 assets: `pentaho-style/{logo*,splash,favicon*,apple-touch-icon,images/login/logo}`, `sw-style/*logo*`, samples `pentaho-logo.{png,svg}`, mantle `img/*` | need actual Helix artwork |
| **Config `.properties` + `pentaho.xml`** | rename the file `pentaho.xml`→`helix.xml` (or not) + every reference (`web.xml` context-param `pentaho-system-cfg`, `PentahoSystem`, spring configs) — slice 4b |
| **Assembly / dir names** — `pentaho-solutions`→`helix-solutions`, `pentaho.war`→`helix.war`, `pentaho-server`→`helix-server`, `PENTAHO_*` env vars, `CATALINA_BASE`, start scripts | slice 4a — touches poms + install scripts; recommend `PENTAHO_*` back-compat fallbacks for in-place upgrade |
| **License headers** — `Copyright ... by Pentaho ... : http://www.pentaho.com` in ~all files, `license/templates/*`, per-module `LICENSE.txt` | slice 4f — legal: add Helix notice, preserve originals; ties to §0 licensing decision |
| **Java packages `org.pentaho.*`** | **decision 2: NOT renamed** |
| **JCR namespaces `pho` / `pho_nt` / `pho_mix`** | **decision 5: NOT renamed** |

## Still-visible "Pentaho" after these slices (by design)

Product name in JCR/schema wire contracts, Java packages, the `pho:` JCR prefix,
Maven coordinates (slice 4a), copyright notices (slice 4f), and doc/community URLs
(pending Helix domains).
