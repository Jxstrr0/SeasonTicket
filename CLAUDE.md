# CLAUDE.md: Season Ticket build brief

**Season Ticket** is a soccer club owner/GM sim with a live, changeable-tactics match engine, by Longlight Interactive. It launched as **version 1.0.0 on 2026-10-19** and is live at https://jxstrr0.github.io/SeasonTicket/. The design is in `docs/DESIGN.md`; read it (and its decisions log, section 15) before changing how the game plays.

## How Kelbo works

- Kelbo is a beginner-plus coder who tests mostly on a phone, in landscape.
- Explain what changed in plain language at the end of every task, and say how to test it on a phone (the live link and what to tap).
- Work on a branch and open a pull request into `main`. Never push straight to `main`.
- Once `npm test` and `npm run build` pass locally and the PR check is green, merge the PR yourself. Kelbo has given standing permission to merge.
- Keep pull requests small enough to review on a phone.
- When something is a real design decision, ask Kelbo instead of guessing, and record the answer in the decisions log in `docs/DESIGN.md`.

## Tech stack

- **Vite 8.3.4 + TypeScript 7.0.2**, no UI framework. Menus and overlays are plain DOM built from HTML strings (`src/ui`).
- **three.js 0.186.1** from npm (`@types/three` 0.186.0), bundled by Vite. It is loaded only by dynamic import when a 3D scene opens, so the plain menus never download it. Models are glTF with **Meshopt** geometry (`meshopt_decoder` from three's examples) and **KTX2** textures (`KTX2Loader`). No Draco.
- **fflate 0.8.2** compresses save codes. **meshoptimizer 1.1.1** (its simplifier) makes the light far-away player bodies in the 3D match.
- **Vitest 5.0.5** for tests. CI uses Node 22.
- The sim runs on **Web Workers** for background matches (`src/game/matchRunner.ts`, `matchWorker.ts`), with a main-thread fallback.
- Installable as an app: `public/manifest.webmanifest` plus a service worker written at build time by `vite.config.ts` from `src/pwa/serviceWorker.ts`.

## Commands

```
npm ci                    # install (npm install also works)
npm run dev               # local dev server
npm test                  # unit tests: 40 files, about 2 to 3 minutes
npm run test:perf         # the engine's time budgets (tests/perf), a few seconds
npm run test:slow         # whole seasons and ten-season careers (tests/slow), many minutes
npm run build             # tsc --noEmit, then vite build to dist/
npm run check:first-load  # after a build: the script before the title screen must stay under 200 KB
npm run typecheck         # tsc only
npm run golden            # after an engine or tuning change: raise engineRev, then store the new golden outcomes
npm run credits           # after editing src/data/meta/credits.json: rewrite CREDITS.md
npm run preview           # serve dist/ locally
```

## Deploy

- `.github/workflows/deploy.yml` runs on every push to `main`: `npm ci`, `npm test`, `npm run test:perf`, `npm run build`, `npm run check:first-load`, then publishes `dist/` to GitHub Pages. A second job, `believability`, runs `npm run test:slow` beside the build; a miss shows red there but does not hold back the deploy.
- Pull requests get the same checks.
- `base` in `vite.config.ts` is `/SeasonTicket/`. Anything in `public/` is referenced through `import.meta.env.BASE_URL` (`assetUrl` in `src/render/assets.ts`).
- `__BUILD_ID__` (the first 7 characters of the commit) is shown in problem reports.
- Hash routes: `#sandbox` is the Stage 1 season simulator, `#engine-lab` (or `#engine-lab/<seed>`) the 2D engine viewer. Both are linked from the title screen.

## Code rules (the code follows these; keep it that way)

1. **Sim stays separate from rendering.** `src/sim` has no three.js or DOM imports and runs headless in Node and in tests. `src/render` never imports the sim; `src/ui` turns sim state into plain snapshots for the scenes (`match3d.ts`, `stadiumSnapshot.ts`).
2. **Deterministic sim.** All randomness goes through the seeded RNG in `src/sim/rng.ts`. The spatial engine (`src/sim/spatial`) and the files it shares use only `det.ts` maths: no `Math.sin`, `Math.pow`, `**` and so on. A test in `tests/spatial.test.ts` scans those files and fails on banned maths (there is no ESLint). Saves keep a match as a recipe (seed, line-ups, every change), so a change that makes an old seed play a different match must raise `engineRev` in `src/data/tuning/spatial.json` and run `npm run golden`.
3. **Data-driven.** Every tuning number lives in `src/data/tuning/*.json`. Content lives in `src/data` as JSON: clubs, names, formations, commentary, events, news, press questions, help, tips, credits, the version and What's new. No magic numbers in logic.
4. **Saves.** One career in `localStorage["seasonticket.career"]`, the previous one in `seasonticket.career.backup`. A save is the career as JSON, zlib-compressed, base64, behind the prefix `ST1:`; the same string is the copy-and-paste save code. `CAREER_VERSION` (now 11, in `src/sim/career/create.ts`) and the migrations in `src/game/save.ts` bring old saves forward. Never break an old save without a migration. `src/game/saveCheck.ts` refuses damaged codes; a pasted code may not inflate past 60 MB. After a crash, saving is frozen so the last good save survives.
5. **Per-device settings** are their own `seasonticket.*` keys (quality, tips, audio, radio, live pitch, 3D match, highlights, camera, shape overlay, fps, splash, title summary), never part of the save. Wrap every `localStorage` access in try/catch.
6. **Phone-first.** Landscape, touch targets of at least 44 px, no hover-only interactions, nothing wider than a 640 by 360 screen. Test every UI change at a phone viewport.
7. **Quality tiers** Low, Medium, High and Off (plain menus) in `src/data/tuning/office.json` (`quality`). Default Medium on phones, High on desktop. Tiers set pixel ratio, antialiasing, shadows, bloom, prop detail and crowd density.
8. **Asset budget.** No Git LFS. Compress models (Meshopt) and textures (KTX2) with the tools in `scripts/assets/` and commit the output. Each scene lazy-loads its own assets. Sound files are mono MP3 from `scripts/assets/build-audio.py`.
9. **Credits.** Every third-party asset is an entry in `src/data/meta/credits.json`; `CREDITS.md` is written from it (`npm run credits`), and a test fails if they disagree or a file under `public/assets` is not covered.
10. **No real league, club, player, place or brand names.** Everything is fictional, including the country (Valmere) and every nationality. A test checks the name lists.
11. **Small, working commits.** The game builds and runs after every task. Keep the deploy green.

## Where things live

```
index.html                 the page; link-preview tags; loads src/main.ts
vite.config.ts             base path, build id, the service-worker plugin, the vitest projects (unit, perf, slow)
src/main.ts                picks the career, #sandbox or #engine-lab
src/sim/                   pure game logic. career/ (money, market, staff, stadium, story, news, press, rivalry,
                           deadline, rollover, live match), spatial/ (the match engine), match/ (events, ratings,
                           commentary, lineups), season, schedule, standings, playoffs, players, coach, rng
src/game/                  save/load and migrations, the save check, the week runner, the match runner and worker
src/render/                three.js scenes: office/, stadium/, match/ (players, rig, cameras, actions, weather),
                           audio/ (crowd, office, synthesised menu sounds), quality tiers, asset loading
src/ui/                    DOM screens. career/ (the app, state, boot, crash screen, 3D hosts, tips, title scene),
                           views/career/ (one file per tab or screen), pitch2d (the 2D pitch), lab/ (Engine Lab)
src/pwa/                   service worker source and its registration (update banner)
src/data/                  clubs, names, formations, world, commentary, deadline calls, events/, news/, press/,
                           help/, meta/ (credits, version), tuning/ (one JSON per system)
public/assets/             compressed models, textures and sounds (office/, match/, audio/)
public/                    manifest, icons, og.png (link preview)
scripts/assets/            offline tools that make the compressed assets (never run by the build)
scripts/check-first-load.mjs  the first-load budget check
tests/                     vitest: unit tests at the top, perf/, slow/, golden/ (stored outcomes), bench/, helpers/
.github/workflows/         deploy.yml
```

### Docs

- **Living:** `CLAUDE.md` (this file), `docs/DESIGN.md` (the game as built, plus the decisions log), `README.md` (the short editing guide), `CREDITS.md` (generated).
- **History, leave as they are:** `docs/STAGE_4_5_SPATIAL_ENGINE.md`, `docs/STAGE_5_MATCH_DAY.md`, `docs/STAGE_6_EVENTS.md`, `docs/STAGE_7_POLISH.md`, `docs/LAUNCH_CHECKLIST.md`, `docs/history/`. They record how each stage was planned and built; the Stage 7 doc holds the launch audit and the balance numbers.

## Build stages

All seven stages are built and merged. In order: Stage 1 (league, match engine, season, playoffs), Stage 2 (the owner/GM loop in plain menus), Stage 3 (the 3D HQ office), Stage 4 (the stadium builder), Stage 4.5 (the spatial match engine, 2D viewer, replays, workers), Stage 5 (the 3D match: players, actions, cameras, weather, crowd, audio), Stage 6 (events, crises, rivalries, press conferences, newspaper and fan feed, deadline day), Stage 7 (tips and Help, audio pass, balance pass, performance pass, crash screen, install as an app, credits, launch audit, save safety). The plans and build notes are in the stage docs above.

The match engine's rules, outputs and believability targets are in `docs/DESIGN.md` sections 5 and 17. The Stage 1 per-minute engine is gone from the game; it survives only as a test-only stand-in in `tests/helpers/stage1/`.

## Current status

- **Launched:** 1.0.0 on 2026-10-19. The version and What's new list are in `src/data/meta/version.json`; bump the version when a release changes what players see.
- **Shipped:** a club career over any number of seasons (squad, market, loans in, youth, staff, money, lenders, stadium builder and branding), live matches in text, 2D and 3D with changeable tactics, three match-day modes (full control, game plan and big calls, coach), replays, the story layer (76 events in `src/data/events/`, press conferences, rivalries, the Valmere Courier and fan feed, deadline day), the 3D office with visitors and radio, first-time tips and Help, sound with three volume sliders, save codes with a backup, a crash screen, offline play and the update banner, Credits.
- **Known gaps:** GoatCounter analytics are not on (waiting for Kelbo's site code; the Credits screen says the game sends nothing). Frame-rate numbers from a real phone are still wanted for a later performance pass. The league's average age drifts down over ten seasons (26.5 to about 24.6) and is flagged, not fixed. Some world generation uses `Math.log`, `Math.cos` and `Math.pow`, which could differ in the last digit between phone engines; changing it would change every existing world, so it is left. The other "found and left alone" items are at the end of `docs/STAGE_7_POLISH.md`.
- **Not built, named in the design:** a kit designer, loaning your own players out, pre-season friendlies, end-of-season awards, a win-probability readout, a city view, the fan zone, owner's box guests, lower divisions and cups. Launch extras Kelbo passed on (a second save slot, a richer owner "new game plus", a share-your-season card) stay ideas.
- **What is next:** nothing is scheduled. The launch checklist (`docs/LAUNCH_CHECKLIST.md`) is Kelbo's quick phone check after any update.

## How to report back after each task

1. What changed, in plain language.
2. How to test it on a phone (the live link and what to tap).
3. Anything Kelbo needs to decide.
