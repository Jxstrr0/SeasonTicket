# CLAUDE.md: Season Ticket build brief

You are building **Season Ticket**, a soccer club owner/GM sim with a live, changeable-tactics match engine, for Longlight Interactive. The full design is in `docs/DESIGN.md`. Read it before starting any stage.

The owner of this repo is a beginner-plus coder who tests mostly on a phone. Explain what you changed in plain language at the end of each task, and say how to test it on a phone.

---

## Tech stack

- **Vite + TypeScript**, no UI framework (plain DOM for menus and overlays).
- **Three.js** (pinned to an exact, stable version in `package.json`), with `GLTFLoader`, `DRACOLoader` or Meshopt, and `KTX2Loader`.
- **Vitest** for unit tests of the sim.
- **GitHub Actions** builds and deploys to **GitHub Pages**. `base` in `vite.config.ts` is `/SeasonTicket/`.

## Folder structure

```
/docs/DESIGN.md        design doc (source of truth for decisions)
/src/sim/              pure game logic: league, players, match engine, season, finances. NO three.js or DOM imports.
/src/game/             game state, calendar, save/load, events
/src/render/           three.js scenes: office, stadium, match day; quality tiers; asset loading
/src/ui/               DOM menus, HUD, tactics screens, overlays
/src/data/             JSON: clubs, nations and names, formations and tactics, tuning values
/public/assets/        compressed models (.glb), textures (.ktx2), audio
/tests/                vitest tests
/.github/workflows/    deploy workflow
```

## Non-negotiable rules

1. **Sim stays separate from rendering.** `src/sim` must run headless (in tests or Node) with no three.js or DOM. Rendering only reads sim output.
2. **Deterministic sim.** All randomness goes through one seeded RNG (`src/sim/rng.ts`), so the same seed gives the same match. This makes bugs reproducible.
3. **Data-driven tuning.** Ratings formulas, prices and probabilities live in `src/data`, not hard-coded in logic.
4. **Phone-first.** Landscape layout, touch targets of at least 44 px, no hover-only interactions. Test every UI change at a phone viewport.
5. **Quality tiers (Low, Medium, High) exist from the first 3D scene.** Tiers control pixel ratio, shadows, crowd density, level of detail and post-processing. Default to Medium on phones, High on desktop, user-adjustable.
6. **Asset budget for GitHub Pages:**
   - **No Git LFS.** Pages serves LFS pointer files, not the assets.
   - Every file under 100 MB; keep the whole site well under 1 GB.
   - Compress models (Draco or Meshopt) and textures (KTX2).
   - Lazy-load heavy assets per scene.
7. **Saves:** `localStorage` with a `version` field and migrations. Export/import as a copyable save code (compressed, base64). Never break old saves without a migration.
8. **No real league, club, player, place or brand names.** Everything is fictional, including the country (Valmere) and every nationality.
9. **Small, working commits.** The game should build and run after every task. Keep the deploy green. Push to `main`.

---

## Match engine spec for the sim

> **Note:** the spatial engine built in Stage 4.5 (see `docs/STAGE_4_5_SPATIAL_ENGINE.md`) replaces the per-minute tick engine described below. The rules, outputs and believability targets here still apply; the "one-minute ticks" model is what changes.

- 11 a side, 90 minutes plus stoppage time (1 to 6 minutes per half), five substitutions from a bench of nine.
- Simulate in one-minute ticks. Each tick, the team in possession attempts a move; outcomes include nothing, a foul (free kick, possible card), a corner, a shot (with an expected-goals value and the players involved), or a turnover that may become a counter-attack.
- Tactics change the numbers: formation, mentality, pressing, defensive line, width, tempo, passing directness, counter-attacks, time-wasting, set-piece takers, man-marking. Every tactic change takes effect at the next tick.
- Fatigue drains per minute (faster with high pressing and tempo) and lowers attributes.
- Cards, injuries, substitutions, and AI head-coach decisions (subs around 60 to 80 minutes, mentality shifts when chasing or protecting) all happen inside the engine so the headless season uses the same code as the live match.
- Playoffs: extra time (two 15-minute halves) then a penalty shootout.
- Output: a match result with team and player stats, a scoring summary, an event timeline (every tick that produced an event, with a one-line commentary string), and per-player match ratings.
- Believability targets (tests check these over several simulated seasons): 2.4 to 3.1 goals per match; home win about 45%, draw about 25%; 9 to 16 shots per team; stronger squads finish higher. Document any simplification in `docs/DESIGN.md`.

---

## Build stages

Work one stage at a time. Each stage ends with a playable build deployed to Pages and a short summary for the owner. Do not start a stage until the previous one meets its "done when".

### Stage 1: Foundation and match engine
- Repo setup: Vite + TS, Three.js, Vitest, deploy workflow, a placeholder page that loads on Pages and can run a season in the browser.
- League data: 16 fictional clubs in one table; generated players with attributes, positions, ages and nationality; coaching staff.
- The match engine described above, with AI head coaches picking formations, tactics and substitutions for every club.
- Season schedule (30 rounds, mid-season break) and the top-6 playoffs with extra time and penalties.
- **Done when:** a full season and playoffs simulate headless in seconds, and results and stats look believable (tests check goals per match, result split, shots, and that squad strength predicts the table).

### Stage 2: Owner/GM loop with plain UI (the concept test)
- Plain DOM screens, no 3D yet: club selection by difficulty, branding editor (name, city, colours, simple crest builder), squad, lineup and tactics screens, contracts, wage cap and luxury tax, homegrown rule toggle at career start, transfer windows with AI valuations, loans, free agents, youth academy intake.
- Business: ticket pricing, sponsors, staff hiring, finances, owner cash injections, loans with conditions, the five-step lender ladder.
- Match day in text: a live match feed where you change tactics and make subs at any time. Include the "game plan + big calls" mode and head-coach delegation.
- Save/load and export/import codes.
- **Done when:** the owner can play a full season and offseason on a phone, and it's fun with plain screens. Pause here for the owner's verdict before going further.

### Stage 3: HQ Office in 3D
- A semi-realistic office diorama: swipe to look around, tap objects (phone, laptop, TV, window).
- Visitors walk in for events.
- Quality tiers implemented here.
- **Done when:** the Stage 2 menus are reachable through the office, and it runs smoothly at Medium on a phone.

### Stage 4: Stadium builder
- A modular semi-realistic stadium (stands, boxes, roof, video board, pitch, signage) driven by purchases.
- Branding applied (colours, crest, pitch design). Attendance drives crowd density.
- Visible from the office window.
- **Done when:** buying an upgrade changes the stadium you can see, and the change persists in saves.

### Stage 4.5: Spatial match engine
- Replace the Stage 1 statistical engine (one outcome rolled per minute, no player positions) with a spatial engine: 22 players and the ball have positions on a 105 m by 68 m pitch, tactics set the team's shape, and each player decides from his attributes.
- One engine for the watched match and every background match, with a coarse mode for speed, running in a Web Worker. Matches replay from their seed and inputs, so no position frames go in saves.
- The 2D top-down viewer (moved here from Stage 5) is built early and is the main tool for judging the engine.
- Full spec, build steps, tests, performance budgets and "done when": `docs/STAGE_4_5_SPATIAL_ENGINE.md`. Start with its docs and design proposal, and stop for the owner's review before writing engine code.
- **Hard gate:** do not start any Stage 5 work (3D players, match-day cameras, the 3D tactics overlay, match audio) until:
  1. Stage 4 meets its "done when", and
  2. Stage 4.5 meets its "done when" in `docs/STAGE_4_5_SPATIAL_ENGINE.md`, and
  3. The owner has given his verdict on the new engine.

  If a request seems to need Stage 5 work before then, say so and ask the owner first.

### Stage 5: Match Day viewer
Build in three playable steps:
1. Text match feed (exists from Stage 2).
2. 2D top-down viewer (exists from Stage 4.5).
3. 3D replay viewer: semi-realistic highlights replayed from the engine's position data, with rigged GLB players re-coloured per club, broadcast and owner's-box cameras, the tactics overlay, weather, crowd and stadium audio, text commentary.
- **Done when:** a full match can be managed and watched in 3D on a phone at Medium quality.

### Stage 6: Events and story layer
- Office visitors, crises, rivalries, press conferences, newspaper and social feed, deadline-day war room.
- **Done when:** a season produces varied, consequential events.

### Stage 7: Polish and launch
- Tutorial, audio pass, balance pass, performance pass, credits.
- **Done when:** ready to share publicly as a free web game.

---

## Art pipeline notes

- Art direction is **semi-realistic** (see `docs/DESIGN.md`).
- Use freely licensed (CC0 or similarly permissive) rigged character models and animations. Keep a `CREDITS.md` listing every asset, its source and its licence.
- One base player model, re-coloured via materials for club branding.
- Animation set grows over time: idle, jog, sprint, pass, shoot, tackle, header, save, celebrate first.
- Compress every asset before committing.

## How to report back after each task

1. What changed, in plain language.
2. How to test it on a phone (the Pages URL and what to tap).
3. Anything the owner needs to decide.
