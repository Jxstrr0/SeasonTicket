# Season Ticket

A soccer club owner/GM management sim with a live, changeable-tactics match engine, set in the fictional nation of Valmere. By Longlight Interactive.

- Design doc: `docs/DESIGN.md`
- Build brief for the AI pair-programmer: `CLAUDE.md`
- Live build: https://jxstrr0.github.io/SeasonTicket/

## Status

Launched: version 1.0.0 on 2026-10-19. All seven build stages are in:

- Stage 1: league, match engine, season and playoffs.
- Stage 2: the owner/GM career in plain menus.
- Stage 3: the 3D HQ office.
- Stage 4: the stadium builder, in 3D on the Stadium tab and through the office window.
- Stage 4.5: the spatial match engine (every player's position), the 2D viewer and replays. Spec: `docs/STAGE_4_5_SPATIAL_ENGINE.md`; design: `docs/DESIGN.md` section 17.
- Stage 5: the 3D match. `docs/STAGE_5_MATCH_DAY.md`.
- Stage 6: events, press conferences, rivalries, the newspaper and fan feed, deadline day. `docs/STAGE_6_EVENTS.md`.
- Stage 7: tips and Help, sound, balance, performance, crash screen, install as an app, credits, launch audit. `docs/STAGE_7_POLISH.md`.

The version and the What's new list live in `src/data/meta/version.json`.

## Develop

```
npm ci                    # install
npm run dev               # local dev server
npm test                  # unit tests (vitest), a few minutes
npm run test:perf         # the engine's time budgets
npm run test:slow         # whole seasons and long careers (many minutes)
npm run build             # typecheck + production build to dist/
npm run check:first-load  # after a build: the first-load size budget
```

The sim in `src/sim` is pure TypeScript with no DOM or three.js imports, so it runs in Node and in tests.

## Deploy

Every push to `main` runs `.github/workflows/deploy.yml`: install, unit tests, perf tests, build, the first-load check, then publish `dist/` to GitHub Pages. A separate `believability` job runs the slow season suite beside the build; it does not hold back the deploy.

One-time setup (the Actions token cannot do this itself): in the repo on GitHub open **Settings → Pages**, and under **Build and deployment** set **Source** to **GitHub Actions**. After that, re-run the latest "Build and deploy to GitHub Pages" workflow from the Actions tab, or push a new commit, and the site appears at the live-build link above.
