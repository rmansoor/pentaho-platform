# Helix Console

The React console that replaces the GWT `user-console` (see the Helix Console Rebuild plan).
It is hidden until cutover: it is built only with `-Pnew-console` and served at `/pentaho/console/`.

Look and feel: the **Atlas** direction (Helix Look and Feel, option B). It uses a navy brand rail,
Cobalt accent, Plus Jakarta Sans, 10–14 px radii and soft layered shadows.

## Layout

```
helix-console/
  pom.xml                 war module; frontend-maven-plugin runs npm ci, build, test
  packages/ui/            @helix/ui: Atlas tokens (theme.css), Tailwind theme, components
  src/
    app/                  router (TanStack, code-based), providers
    api/                  fetch wrapper, Zod-validated REST clients, data-source context
    api/mock/             sample repository for tests and `npm run dev:mock`
    shell/                AppShell, NavRail (collapsible), TopBar, layout store
    features/files/       Files: folder tree, sortable table, selection toolbar
    features/             one folder per area as it is built
```

## The navigation rail

- **Expanded** (232 px) shows icon and label. **Collapsed** (64 px) shows icons only, giving the content the full width.
- Toggle it with the button at the foot of the rail, or with **Ctrl+B** / **Cmd+B** (ignored while typing in a field).
- The choice is saved per browser (`localStorage`, key `helix.console.layout`).
- Below 768 px the rail becomes a drawer, opened from the top bar's menu button and closed with Esc.
- Labels stay in the accessibility tree when collapsed and show as tooltips on hover.

## Shell

- **Signed-in user** (`/api/session/userName`, `/api/mantle/isAdministrator`) at the foot of the rail,
  with a menu for Change password (`PUT /api/userroledao/user`) and Sign out (`/pentaho/Logout`).
  Administration is only listed for administrators.
- **New** (top bar): New folder and Upload files, into the folder being browsed or else the user's
  home folder. New folder: `PUT /api/repo/dirs/{pathId}` (409 when the name is taken; `/`, `\` and tab
  refused). Upload: multipart `POST /api/repo/files/import/multiple` with the GWT field names, names
  URI-encoded in `fileNameOverride` (the single-file endpoint fails with a server NPE without it),
  optional replace; zips are unpacked by the server. The endpoint answers 200 for everything, so the
  body is read: `INVALID_MIME_TYPE` or a stack trace means it failed. Files can also be dragged onto
  the Files page. New > Database connection opens the connection editor (below).
- **Database connections:** New / Edit on Data sources (and New > Database connection). Types from
  `GET /plugin/data-access/api/dialect/getDatabaseTypes` (default port per type); Native (JDBC) or
  JNDI. Test is `PUT /plugin/data-access/api/connection/test`: 200 with a sentence on success, 500
  with an HTML error page on failure, so the console shows its own message. Save is
  `PUT …/datasource/jdbc/connection/{name}` (204; adds or updates). The server never returns the
  password; a blank password on save or test keeps the saved one. Fields the form doesn't edit
  (pooling, extra options, attributes) are passed back unchanged.
- **Command palette:** Ctrl+K / ⌘K, or the search box in the top bar. It jumps to areas and Trash,
  opens favorites, and toggles the menu; type to filter, arrows to move, Enter to run.

## Files

`/files?path=/public/...` shows a folder tree (Home and Public) next to a sortable table of the folder's
contents, read from `GET /api/repo/files/{pathId}/tree?depth=1`. The folder path lives in the URL, so a
folder can be bookmarked and survives a reload.

- **Table:** folders first, then by the chosen column. Click selects; Ctrl/Cmd+click toggles; Shift+click
  or Shift+arrow selects a range; Enter or double-click opens a folder.
- **Tree:** follows the ARIA tree pattern (arrows, Home/End, Right/Left to expand or collapse). Children
  load on first expand and share the cache with the table.
- **Toolbar:** Open (folders in Files, files in the viewer), Share, Schedule (schedulable types), and
  More (Properties, favorites, Move to trash).
- **Errors:** an unreachable server and a missing or forbidden folder each get their own message and a retry.
- **Move to trash:** from the More menu or the Delete key, with an Undo toast.

## Opening files

Open (Files toolbar, double-click, Enter), Home, the palette and favorites open a file at
`/view?path=…`: a header (folder breadcrumb, title, favorite star, Share, Open in new window) over one
frame showing the file with the plugin that renders it, at the URL the GWT console uses,
`/api/repos/{pathId}/{perspective}`. The perspective for each extension comes from the RUN command in
`GET /api/mantle/settings` (`plugin-content-type-N…`; "None" means `generatedContent`). Types no
plugin opens get a Download link instead. Opening a file records it in Recent (GWT format, 10 items).
Pentaho reports (`.prpt`) open in the console's own viewer instead (below).

*Report viewer.* The console draws the parameter panel, format choice, paging, print and downloads;
only the rendered output sits in a frame (`features/viewer/ReportViewer.tsx`, `api/reports.ts`):

- `POST /api/repos/{id}/parameter` (form body, `renderMode=PARAMETER`) describes the parameters:
  labels, values, how to draw each one (`parameter-render-type`: dropdown, list, radio, checkbox,
  togglebutton, textbox, multi-line, datepicker), which are selected, errors, and whether the report
  can run (`is-prompt-needed`). Every change is sent back, and the server answers with the corrected
  selection, so dependent lists refresh and stale choices drop out (cascading parameters). Text
  commits on Enter or blur. Reports that don't auto-submit wait for **View report**.
- `GET /api/repos/{id}/report?…&output-target=…&accepted-page=N&renderMode=REPORT` is the output.
  HTML pages load their images and CSS through `/pentaho/getImage`, so the frame needs nothing else.
  The same `renderMode=XML` call to `/parameter` gives `page-count` for paged HTML.
- **View as** offers the viewable formats (HTML paged or single page, PDF); **Download** offers every
  format the report allows, using the same `REPORT` request, which the server names after the report.
  `renderMode=DOWNLOAD` is not used: on 11.1 it answers a 109-byte placeholder named "defaultnull".
- PDF frames are not sandboxed: Chrome refuses to show a PDF in any sandboxed frame.
- **Classic viewer** switches to the plugin's own viewer (remembered per browser) for what this viewer
  doesn't do: drill-through links into other reports, row limits, background progress and moving a
  running report to the background. The plugin's viewer runs reports as background jobs
  (`/plugin/reporting/api/jobs`); this one uses the synchronous endpoints.

## Plugin compatibility (`window.mantle_*`)

Plugin pages written for the GWT console call functions on `window.parent` / `window.top`.
`src/compat/mantle-bridge.ts` installs the same names (mounted by `BridgeHost` in the shell):

| Called by | Function | Helix behaviour |
|---|---|---|
| reporting | `mantle_addHandler` / `mantle_removeHandler` / `mantle_fireEvent`, `mantle_initialized` | Event bus; the content frame fires `GenericEvent` `tabClosing` with its frame id when it closes |
| reporting | `pho.runAdhocInBackground(path, jobId, recalculateFinished)` | "Run in background" dialog; fires `locationPromptAttached` / `Ok` / `Finish` / `Canceled` like the GWT command and posts `/plugin/reporting/api/jobs/{id}/schedule` |
| reporting | `executeCommand("RunInBackgroundCommand")`, `mantle_openRepositoryFile(path, "SCHEDULE_NEW")` | Schedule sheet (one run now / new schedule) |
| reporting | `mantle_openTab`, `openURL`, `urlCommand`, `mantle_openNamedFrameTab` | `/content?url=` (same-origin `/pentaho/` URLs only) |
| reporting | `authenticate`, `show/hideLoadingIndicator`, `mantle_showMessage`, `mantle_showConfirmDlg` | Session check, top progress bar, toast, confirm dialog (`{onOk, onCancel}`) |
| data-access | `enableContentEdit`, `setContentEditSelected`, `mantle_refreshRepository` | Edit state kept; repository queries refreshed |
| any | favorites, `mantle_isSupportedExtension`, `mantle_setPerspective`, `closeTab` | Mapped to the console |

Every other function the GWT console exported is a stub that logs one warning, so a plugin that
depends on it fails visibly in QA rather than silently.

## Home

Quick actions (Files, Schedules, Data sources, Trash), then **Favorites** and **Recent**. Both lists are
per-user settings (`/api/user-settings/favorites`, `/recent`) in the GWT console's JSON format
(`[{"fullPath","title","lastUse"}]`, 10 recents), so the old and new consoles share them during the
transition. Star or unstar from Home or from Files › More › Add to favorites.

## Trash

`/files/trash` (Trash at the foot of the folder tree) lists deleted items with their original location
and deletion date. Restore puts them back; if you can't write to the original folder the server says so
(406), and the console offers your home folder instead, asking what to do with name clashes (409:
replace, keep both or skip). Delete permanently and Empty trash ask first and say how many items go.

## Properties and Sharing

One selected item: **Share** opens a side sheet on the Sharing tab; **More › Properties** opens it on
General. General shows name, type, location, owner (from the ACL), size, dates and description, with
the Hidden and Allow scheduling flags (`/metadata`, `_PERM_HIDDEN` / `_PERM_SCHEDULABLE`). Sharing has
an "Use the folder's permissions" switch and a Read / Write / Delete / Manage matrix per user or role
(ticking one ticks what it needs, as in the GWT console); users and roles come from
`/api/userrolelist/permission-users` and `permission-roles`. Changes are saved together.

ACL quirks on the server (`GET/PUT /repo/files/{id}/acl`):

- Permissions are ordinals (READ 0, WRITE 1, DELETE 2, ACL_MANAGEMENT 3, ALL 4); one value comes back as
  a string, several as an array. All four are sent as ALL.
- The Administrator entry (`modifiable: false`) is added for display only and dropped on save.
- The DTO's list setter resets `entriesInheriting` to false, so **to inherit, send no `aces` at all**;
  sending entries turns inheritance off. (`aclRequestBody` in `src/api/repo.ts`.)

## Schedules

`/schedules` lists every schedule the user can see, sorted by next run: the file it runs, the recurrence
in plain words, next and last run, owner and state, with search and owner/state filters. Row actions:
run now, pause/resume, delete (confirmed). A status pill shows whether the scheduler as a whole is
running; administrators can pause or start it, and a banner warns while it is paused.

It talks to the scheduler plugin's **v1** API (`/pentaho/plugin/scheduler-plugin/api/scheduler`).
The server logs v1 as deprecated in favour of `/api/v2/scheduler`, but 11.1 doesn't ship v2 (404), so
all scheduler calls live in `src/api/scheduler.ts` for a later switch. Live quirks:

- `GET /state` answers only `Accept: text/plain` (406 otherwise).
- On the EE scheduler, `POST /job` fails with `InvalidUserName` unless the request carries the
  `ActionAdapterQuartzJob-ActionUser` job parameter (relevant for the create/edit wizard).
- Server bug (fixed on pentaho-scheduler-plugin branch `fix/cron-named-day-of-week`): named days in
  cron strings were shifted one day earlier (`MON-FRI` stored as Quartz `1-5`, Sunday–Thursday).

**Schedule wizard.** Schedule (Files toolbar or viewer, for types the server can schedule per
`/api/repos/executableTypes`) and Edit (Schedules row) open a side sheet: name, output folder, repeat
(once, every N minutes or hours, daily, weekly on chosen days, monthly on a day, or a cron expression),
start date and time, optional end date, time zone, and a live summary. It posts the same
`JobScheduleRequest` the GWT dialog does (`POST /job`, `POST /job/update` with `jobId`): simple
triggers for once/minutes/hours/daily, `cronJobTrigger` for weekly/monthly/cron, with **numeric**
Quartz days (`2-6`) so weekly schedules are right even on servers without the day-of-week fix, and the
`ActionAdapterQuartzJob-ActionUser` parameter EE requires. When editing, start times are shown in the
schedule's own time zone.

*Report parameters.* When `GET /api/repo/files/{id}/parameterizable` says `true` (for `.xaction`, when
its `parameterUi` has visible inputs), the sheet embeds the content's own prompt,
`/api/repos/{id}/parameterUi`, using the GWT contract: an iframe with id `schedulerParamsFrame`, parent
callbacks `schedulerParamsLoadedCallback` / `…CompleteCallback` / `…ContentResizeCallback`, values
read with `getParams(true)` and typed as GWT types them (string, number, boolean, date, `[]` forms).
When editing, saved values go back in as query parameters. The frame is sized to the prompt panel
(`#toppanel`), never the body: report prompts have an output area that fills the frame, so sizing to
the body makes it grow forever. A prompt that reports incomplete blocks saving.

*Email.* `GET /api/emailconfig/isValid` (`true`/`false`, text) enables the switch. To, Cc, Bcc,
Subject, Message and Attachment name go in as `_SCH_EMAIL_*` job parameters and are read back when
editing; `lineage-id` is carried over on edit.

*Blockout times.* Administrators get a Blockout times card under Schedules: add, edit and remove
windows in which no schedule runs, using the same recurrence fields plus a duration. A blockout is a
`BlockoutAction` job: `GET /blockout/blockoutjobs`, `POST /blockout/add` (the schedule trigger plus
`duration` in ms and `timeZone`), `POST /blockout/update?jobid=` (the server deletes and re-adds, so the
id changes), delete with `removeJob`. The server renames every blockout `BlockoutAction`.

The schedule sheet warns as you edit when runs fall in a blockout ("16 of the 28 runs in the next 4
weeks…") and refuses a schedule whose every run is blocked. The console works this out itself
(`features/schedules/blockouts.ts`: run times in the schedule's zone, a Quartz cron reader for
lists, ranges, steps and names, windows inclusive at both ends) because on 11.1
`POST /blockout/blockstatus` reports a daily 23:00 run inside a weeknight blockout as not blocked,
and a single run outside every window as partially blocked. People who can't list blockouts
(`org.pentaho.scheduler.manage`) fall back to `blockstatus`, and only its "totally blocked" answer is
shown. Cron expressions using `L`, `W` or `#` aren't evaluated, so they get no warning.

## Data sources

`/datasources` lists database connections (with type, host and database from
`jdbc/connection/{name}`), Analysis schemas, Metadata models and Data Source Wizard models from the
data-access plugin (`/pentaho/plugin/data-access/api/datasource`), with type filters, search, Export
(the server's attachment download for analysis, metadata and DSW) and Delete with a warning about what
depends on it. DSW models are also returned as metadata domains and are shown once. Database
connections can be created and edited (see above); the data source wizard is not built yet.

## Administration

`/admin` has **Users** and **Roles** tabs (`/api/userroledao`). Users: list, roles as checkboxes
(applied immediately), New user (password typed twice), Change password (the server also requires the
administrator's own password), Delete. Roles: list, members as checkboxes, New role, Delete (with a
stronger warning for Administrator). Passwords are sent as `ENC:` + base64 so they don't appear as
plain text in request logs; bulk names are tab-separated query parameters; validation failures carry
their reason in the `PUC_VALIDATION_ERROR_MESSAGE` header, which the console shows.

**Permissions** (the GWT "System Roles" panel): a roles × permissions matrix from
`GET /api/userroledao/logicalRoleMap` (localized permission names; roles without an assignment are
added with nothing granted). Each tick saves that one role with `PUT /roleAssignments`
(`{assignments:[{roleName, logicalRoles}]}`); immutable roles (Administrator, SysAdmin) are locked.
Tabs: Users, Roles, Permissions, Settings, Mail server.

**Mail server** (`/api/emailconfig`): host, port, protocol, SSL/STARTTLS, sign-in, From; Send test email
uses the unsaved values (server answers `EmailTester.SUCESS` [sic] or `EmailTester.FAIL`). Saving
replaces the whole config, so OAuth fields are carried through unchanged. Note: the server returns the
SMTP password decrypted to administrators.

**Settings**: delete generated files older than N days now (run-once `GeneratedContentCleaner` job,
removed afterwards because the finished job confuses `getContentCleanerJob`), and a daily automatic
clean-up found from the job list.

## Translations

All text comes from message catalogs in `src/i18n`: English (`en/`, the source) and German (`de/`).
Messages are ICU MessageFormat via `intl-messageformat`, so plurals and selections follow each
language's rules (`{count, plural, one {# item} other {# items}}`). Call `t('area.key', values)` at
render time (never at module load, before the language is known). Dates, times, numbers, relative
times, day names and lists use `Intl` with the current locale, so they need no catalog entries.

The language is the user's Pentaho locale (`GET /api/system/locale`), read once before the first
render; without a server (`dev:mock`) the browser's language. **Account menu › Language** saves the
choice with `POST /api/system/locale` (as PUC's language menu does) and reloads, so content the server
renders (report prompts, embedded GWT pages) switches too. Unsupported locales fall back to English.

To add a language: copy `src/i18n/de` to the new code, translate it, and add the code to `LANGUAGES`
and the loaders in `src/i18n/index.ts`. The `Catalog` type fails the build on a missing or extra key,
and `i18n.test.ts` fails if a message doesn't parse or uses different placeholders than English.
Each language is its own chunk, loaded only when used.

What stays in the server's language: report and parameter names, permission names (the server
localizes them), and the browser's own date and time pickers.

## Changing data

Unsafe requests go through `send()` in `src/api/http.ts`, which adds the CSRF header from
`GET /api/csrf/token?url=…` (Helix Security Web plugin) and retries once with a fresh token on 403.
Without the plugin the endpoint returns no token and nothing is added.

The REST client tolerates the JAXB JSON quirks: booleans and numbers as strings, epoch-millisecond date
strings, and a one-element `children` list sent as a bare object.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173/pentaho/console/ ; /pentaho/* is proxied to :8080
npm run dev:mock   # same, backed by a sample repository (no server needed)
npm test           # Vitest + Testing Library
npm run build      # typecheck + production build into dist/
```

### Against a live server

Everything under `/pentaho` except the console is proxied to `HELIX_SERVER` (default
`http://localhost:8080`), so the session cookie belongs to the dev origin, as it will in production:

1. `HELIX_SERVER=http://localhost:8090 npm run dev`
2. Open `http://localhost:5173/pentaho/console/files`. Signed out, it shows a **Sign in** link.
3. Sign in on the server's login page (`admin` / `password` on a sample install). It returns you to
   the old console; go back to `/pentaho/console/files`.

What a Pentaho 11.1 server actually sends, and how the client handles it:

- Folders have `fileSize: -1` and an empty `lastModifiedDate`, so the table shows the created date.
- Tree responses carry no owner (it lives in the file's ACL), so there is no Owner column yet.
- A signed-out API call is redirected to `/Login` and returns HTML; the client reports it as 401.

## Maven

```sh
mvn -Pnew-console -pl helix-console package
```

Node and npm come from the parent POM's `node-npm_install` execution, which downloads from the
Pentaho mirror (`nodeDownloadRoot`). Without mirror credentials, add
`-DnodeDownloadRoot=https://nodejs.org/dist/ -DnpmDownloadRoot=https://registry.npmjs.org/npm/-/`.

## Theming

All colours, fonts, radii and shadows live in `packages/ui/src/theme.css`. Components use the
semantic tokens (`bg-surface`, `text-fg-muted`, `bg-accent`, `bg-rail`, ...), never hex values, so
changing the look means editing that one file. Dark-mode values are provisional.
