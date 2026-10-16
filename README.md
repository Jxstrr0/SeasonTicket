# Season Ticket

A soccer club owner/GM management sim with a live, changeable-tactics match engine, set in the fictional nation of Valmere. By Longlight Interactive.

- Design doc: `docs/DESIGN.md`
- Build brief for the AI pair-programmer: `CLAUDE.md`
- Live build: https://jxstrr0.github.io/SeasonTicket/

## Status

- Built:
  - Stage 1: league, match engine, season and playoffs.
  - Stage 2: the owner/GM career in plain menus.
  - Stage 3: the 3D HQ office.
  - Stage 4: the stadium builder, in 3D on the Stadium tab and through the office window.
- In progress, Stage 4.5: a spatial match engine that simulates every player's position.
  - Spec: `docs/STAGE_4_5_SPATIAL_ENGINE.md`.
  - Design: `docs/DESIGN.md` section 17, with the detail in `docs/history/STAGE_4_5_SKETCH_NOTES.md`.

## Develop

```
npm install
npm run dev       # local dev server
npm test          # headless sim tests (vitest)
npm run build     # typecheck + production build to dist/
```

The sim in `src/sim` is pure TypeScript with no DOM or three.js imports, so it runs in Node and in tests.

## Deploy

Every push to `main` runs `.github/workflows/deploy.yml`: install, test, build, then publish `dist/` to GitHub Pages.

One-time setup (the Actions token cannot do this itself): in the repo on GitHub open **Settings → Pages**, and under **Build and deployment** set **Source** to **GitHub Actions**. After that, re-run the latest "Build and deploy to GitHub Pages" workflow from the Actions tab, or push a new commit, and the site appears at the live-build link above.
