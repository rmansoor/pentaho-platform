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
    app/router.tsx        TanStack Router routes (code-based for now)
    shell/                AppShell, NavRail (collapsible), TopBar, layout store
    features/             one folder per area as it is built
```

## The navigation rail

- **Expanded** (232 px) shows icon and label. **Collapsed** (64 px) shows icons only, giving the content the full width.
- Toggle it with the button at the foot of the rail, or with **Ctrl+B** / **Cmd+B** (ignored while typing in a field).
- The choice is saved per browser (`localStorage`, key `helix.console.layout`).
- Below 768 px the rail becomes a drawer, opened from the top bar's menu button and closed with Esc.
- Labels stay in the accessibility tree when collapsed and show as tooltips on hover.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173/pentaho/console/ ; /pentaho/api is proxied to :8080
npm test           # Vitest + Testing Library
npm run build      # typecheck + production build into dist/
```

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
