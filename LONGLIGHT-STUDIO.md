# Longlight Interactive: studio catalogue

> **Snapshot: 7 November 2026**, tables refreshed 16 November (Hull Down, Funded, Burn Rate and Laminar added; Escapement retired); Outwash added 21 November; Mainline added 25 November; The Whip retired 25 November. One reference file for every Longlight game.
> The same file is dropped into each game repo. Versions and details drift;
> when something matters, check the live repo. A game's own `CLAUDE.md` always
> wins over this file inside that game's repo.
>
> **Public edition.** It covers the eleven games in the studio site's
> `projects.json` and leaves out Kelbo's private and parked repos. Ask Kelbo
> about those.
>
> **Six games are listed on the site** (16 November 2026): Prairie Engine
> Works, Scrapline, Season Ticket, Funded, Lombard and Burn Rate. Five more
> carry `"hidden": true` in `projects.json`: Frontier Lab (hidden on
> 15 November, when Burn Rate took its place) and
> the newest games Hull Down, Laminar, Outwash and Mainline, hidden until Kelbo says
> to show them. A hidden game has no card, no game page and no devlog or
> release lines; its repo and live game stay up, and everything in this file
> still applies to it.
>
> **Escapement is retired.** Kelbo deleted its repo on 16 November 2026 and
> it was taken off the site entirely. Scrapline now owns the Velmark and
> Haldis world it shared.
>
> **The Whip is retired.** Kelbo deleted its repo on 25 November 2026 and
> it was taken off the site entirely. Its names and storage prefix are free.

---

## 1. What this file is for

Kelbo makes his games as Longlight Interactive. Each game lives in its own
repo, keeps its own look and is built by Claude sessions that usually can't see
the other games. This file gives every session the full studio picture so it
can do three jobs:

1. **Reuse first.** Before building a system (save codes, graphics tiers, a
   tutorial, a share card, a balance bot), check the **Reuse map** (section 10).
   Another game has often solved it already. Copy and adapt it; don't rewrite it.
2. **Pitch away from what exists.** When Kelbo asks for new game ideas, a new
   setting, new names or a new look, check **Names already taken** (section 8)
   and **Genres, looks and open space** (section 9) so the pitch is fresh, not a
   repeat of another Longlight game.
3. **Pitch improvements.** Each profile ends with gaps and improvement ideas,
   and section 12 lists studio-wide ones. A good idea from one game (say, the
   save-safety bar in Season Ticket) can often be pitched to another (Frontier Lab).

**Ground rules**

- **Read other repos, don't change them.** From a session in one game, never
  push to another game's repo unless Kelbo asks for that in so many words.
  Pitch the change to Kelbo instead.
- **Copy, don't link.** Never import code across repos or hotlink another
  game's files. Copy the file in, adapt it, and add a comment at the top:
  `// Adapted from <Repo> <path> (<date>)`.
- **Carry credits with assets.** If a copied model, sound or texture is
  third-party, copy its line from that repo's `CREDITS.md` / `ATTRIBUTION.md`
  / `LICENSES.md` too.
- **Use the name Kelbo only.** Never a real name, initials or email, in any repo.
- **Ask about real design decisions.** This file helps you pitch; Kelbo decides.

---

## 2. How to look at the other repos

Every game is a public repo under **github.com/Jxstrr0**, served by GitHub Pages
on its own subdomain of **longlight.games** (November 2026; the old
`https://jxstrr0.github.io/<Repo>/` addresses forward there).

| Game | Repo | Live | On the site |
| --- | --- | --- | --- |
| Prairie Engine Works | [Jxstrr0/350Chev](https://github.com/Jxstrr0/350Chev) | https://pew.longlight.games/ | Listed |
| Lombard | [Jxstrr0/Lombard](https://github.com/Jxstrr0/Lombard) | https://lombard.longlight.games/ | Listed |
| Scrapline | [Jxstrr0/Scrapline](https://github.com/Jxstrr0/Scrapline) | https://scrapline.longlight.games/ | Listed |
| Season Ticket | [Jxstrr0/SeasonTicket](https://github.com/Jxstrr0/SeasonTicket) | https://seasonticket.longlight.games/ | Listed |
| Funded | [Jxstrr0/Funded](https://github.com/Jxstrr0/Funded) | https://funded.longlight.games/ | Listed |
| Burn Rate | [Jxstrr0/BurnRate](https://github.com/Jxstrr0/BurnRate) | https://burnrate.longlight.games/ | Listed |
| Frontier Lab | [Jxstrr0/FrontierLab](https://github.com/Jxstrr0/FrontierLab) | https://frontierlab.longlight.games/ | Hidden |
| Hull Down | [Jxstrr0/hull-down](https://github.com/Jxstrr0/hull-down) | https://hulldown.longlight.games/ | Hidden |
| Laminar | [Jxstrr0/Laminar](https://github.com/Jxstrr0/Laminar) | https://laminar.longlight.games/ | Hidden |
| Outwash | [Jxstrr0/Outwash](https://github.com/Jxstrr0/Outwash) | https://outwash.longlight.games/ | Hidden |
| Mainline | [Jxstrr0/Mainline](https://github.com/Jxstrr0/Mainline) | https://mainline.longlight.games/ | Hidden |
| Studio site | [Jxstrr0/Kelbo.Website](https://github.com/Jxstrr0/Kelbo.Website) | https://longlight.games/ | — |

Kelbo's private and parked repos are not covered here (section 11).

**Ways to read one**

- **Claude Code in the cloud:** call the `add_repo` tool (owner `Jxstrr0`,
  repo name as in the table), then clone it where the tool says. Don't
  pre-check with curl; just call the tool.
- **Any session with git:** a shallow, read-only copy outside your own repo:
  `git clone --depth 1 https://github.com/Jxstrr0/<Repo>.git /tmp/<repo>`
- **One file:** `https://raw.githubusercontent.com/Jxstrr0/<Repo>/main/<path>`
- **Where to start in a repo:** `CLAUDE.md`, then the design doc it names
  (`docs/DESIGN.md`, `DESIGN.md`, `docs/01-GDD.md`), then the status file
  (`plan/status.md`, `PROGRESS.md`, `docs/PROGRESS.md`, `docs/STATUS.md`).

---

## 3. The studio brand (studio pieces only)

**Each game keeps its own look.** Its fonts, colours and art stay its own, and
game screens are never restyled to match the studio. The Longlight brand
applies only to studio pieces: the logo or splash, the credit line, the studio
block on a credits or about screen, and any link back to the studio site.

| Piece | Rule |
| --- | --- |
| Logo | The horizon lockup: a half-set clay sun on a long horizon line, LONGLIGHT above INTERACTIVE. Use the official files from `Jxstrr0/Kelbo.Website` `assets/press/longlight-logo-dark` and `longlight-logo-light` (SVG, plus 2x PNG); press kit at https://longlight.games/press.html. Copy them in. Never hotlink, redraw, recolour or swap the letters for live text. |
| Colours | Clay `#D97757`, Purple `#7B3FC4`, Slate `#141413`, Ivory `#FAF9F5`, Lilac `#B48CE8`. Nothing else in the logo or studio block. |
| Font | Space Grotesk 500/700. Self-host it in a studio piece; no new font host. |
| Name | Always "Longlight Interactive" in full. |
| Credit line | `© <year> Kelbo / Longlight Interactive` (the studio isn't a registered business yet). |
| Studio link | https://longlight.games/ |

Some games chose the Longlight colours as their own in-game look too (Prairie
Engine Works, Scrapline, Lombard's menus). That's their
choice, not a rule.

**Brand drift found in this snapshot** (good small fixes to pitch):

| Game | Drift |
| --- | --- |
| Season Ticket | `src/ui/brand.ts` and `public/icons/` use older colours (purple `#6F45B8`, copper `#C2826A`, ink `#1C1820`, paper `#E1DED7`); no `©` line anywhere. |
| Frontier Lab | Title, boot and credits say only "A Longlight Interactive game": no logo, no `©` line. |

---

## 4. Rules every Longlight game shares

- **Kelbo** is a beginner-plus coder who tests on his phone from the live site.
  End every task with a plain-language summary and how to test it on a phone.
- **Phone first.** Touch must work before a feature is done. Portrait unless
  the game says otherwise (Season Ticket is landscape).
- **Four-number versions**, `Major.Minor.Patch.Build` (Major = overhaul,
  Minor = feature batch, Patch = tweak or fix, Build = republish). npm projects
  keep a three-number `package.json` version that players never see.
- **Fictional names** for people, companies, brands, units and invented
  countries. Some games use real cities (see section 8); check before you do.
- **The sim stays separate from rendering**: no DOM or three.js in sim code,
  seeded RNG only, no `Math.random` or `Date.now` in the sim. Tuning numbers live
  in tables or data files, not inline.
- **Branch, PR, merge on green.** Never push to `main`. Kelbo has given standing
  permission to merge once the repo's checks pass (each CLAUDE.md says which).
  Small PRs he can read on a phone.
- **GitHub Pages deploy**: merging into `main` is the deploy.
- **Save safety** (every current game has it): a save code
  (`PREFIX1:` + compressed JSON + checksum), backup files
  (`<game>-backup-YYYY-MM-DD.txt` through the share sheet or a download),
  `navigator.storage.persist()`, and a reminder after 14 days without a backup.
- **Players' save codes are their personal data**: decode them locally only,
  never send them anywhere, never commit them.
- **No backend, accounts, analytics, ads or API keys** in any game.

---

## 5. Storage and cache names already taken

Since November 2026 every game has its own address (`<game>.longlight.games`,
the studio site `longlight.games`), so each has its own localStorage, Cache
Storage, IndexedDB and quota. Before that they all shared one origin,
`jxstrr0.github.io`, and old saves stay there. Keep the prefixes anyway: they
cost nothing, keep old copies apart, and let a game move again safely.

- Use **your own prefix** for every localStorage key, IndexedDB database and
  cache name.
- **Never clear or delete anything outside your own prefix.** No
  `localStorage.clear()`; a service worker deletes only caches that start with
  its own prefix.
- Each game asks for `persist()` itself; a grant covers only its own address.

| Game | localStorage | Caches | Save code |
| --- | --- | --- | --- |
| Studio site | `kelbo.*` | `longlight-*` (now `longlight-3`) | none |
| Prairie Engine Works | `pew2-save`, `pew2-slot1..3`, `pew2-legacy` | `pew-` | `PEW1:` (old `PEW2:` still loads; next is `PEW3:`) |
| Lombard | `lombard.*` (settings) + IndexedDB database `lombard` (careers) | none (no service worker yet; use `lombard-` when one is added) | `LMB1.` (dots, not a colon: `LMB1.<data>.<checksum>`) |
| Scrapline | `scr-save`, `scr-slot1..3` | `scr-` | `SCR1:` (next `SCR2:`) |
| Season Ticket | `seasonticket.*` | build-time service worker | `ST1:` |
| Frontier Lab | `frontierlab.*` + IndexedDB `frontierlab` | content-hash name | `FL<schema>:` |
| Hull Down | `hulldown.*` + IndexedDB `hulldown` | `hulldown-` | `HD1:` |
| Funded | `funded.*` (`funded.run.v1`, `funded.meta.v1`, `funded.audio.v1`) | none (no service worker) | none |
| Burn Rate | `brn-settings`, `brn-save`, `brn-slot1..3` | `brn-` | `BRN1:` |
| Laminar | `laminar.*` + IndexedDB `laminar` (slots) | none yet (use `laminar-` when one is added) | `LAM1:` (designs `LAMD1:`) |
| Outwash | `outwash.*` + IndexedDB `outwash` | `outwash-` | `OUT1:` (designs `OUTD1:`) |
| Mainline | `mainline.*` + IndexedDB `mainline` | `mainline-` | `ML1:` (backup file `mainline-backup-YYYY-MM-DD.txt`) |

> **Fixed on 7 November 2026:** the studio site's `sw.js` used to delete every
> cache that wasn't its own when it updated, which wiped the games' offline
> copies. It now deletes only `longlight-*` caches. Every service worker on the
> origin must follow the same rule.

---

## 6. The games at a glance

Status and version are what the live studio site showed on 16 November 2026
(the deploy fills versions from each game's newest GitHub Release). Order is
Kelbo's own ranking, listed games first. **Hidden** marks the games off the
site (`"hidden": true`); they are still live at their own addresses.

| Game | Status | Version | Genre | Setting | Screen | Stack |
| --- | --- | --- | --- | --- | --- | --- |
| Prairie Engine Works | Released | 1.76.135.4 | Engine builder, dyno, ten race events, race-team career | Prairie engine shop (Saskatoon) | Phone, both ways; desktop layout | Classic JS + `build.js`, three r128 (CDN) |
| Scrapline | Polishing | 0.1.68.1 | Combat-robot builder, arena fights, career | Velmark and the Haldis | Portrait (side by side in landscape) | Classic JS + `build.js` (PEW stack), three r128 |
| Season Ticket | Released | 1.2.4.0 | Football club owner/GM with live tactics | Valmere, a fictional northern republic | **Landscape** | TypeScript, Vite, three 0.186 |
| Funded | Polishing | 0.9.0.4 | Prop-firm trading roguelike: five-day evals, three desks, edge cards | A trading firm's desk (fictional tickers) | Portrait 9:16 frame | Plain ES modules, no build; Blender-rendered backdrops |
| Lombard | Polishing | 1.4.6.1 | First-person pawn shop sim: inspect, appraise, haggle; a crime layer | Mostograd, a 2010s Russian river city | Portrait first | TypeScript, Vite, three 0.187 (npm) |
| Burn Rate | Released | 1.6.1.1 | Solid rocket motor design: design, predict, static fire, incident report | Aqsor Range (Site 41), a steppe salt flat, 2030s | Portrait first | Classic JS + `build.js` (PEW stack), three vendored in `lib/` |
| Frontier Lab | Polishing, **hidden** | 0.1.64.2 | AI-lab tycoon (fork of Vault Street) | Real cities on procedural maps | Portrait | TypeScript, Preact, 2D canvas/SVG |
| Hull Down | Prototype, **hidden** | 1.8.5.2 | Tank design bureau: design to a weight limit, trial, after-action report | Tarnovia, 1980s to today | Portrait first | TypeScript, Vite; 2D office, three (npm) for trials |
| Laminar | In development, **hidden** | 0.9.15.0 | Aero consultancy: shape in 3D, scale model, wind tunnel, real event | Tarnovia, Stavren (2010–2040; rubles) | Portrait first | TypeScript, Vite, three 0.187 (npm) |
| Outwash | In development, **hidden** | 0.9.0.0 | A Laminar game: head of aero at a grand prix team; CFD, tunnel, dirty air, twelve rounds a season | Laminar's Tarnovia and a fictional world series (2026–2050; rubles) | Portrait first | TypeScript, Vite, three 0.187 (npm) |
| Mainline | In development, **hidden** | 0.13.2.0 | Train builder: win tenders, design a train part by part, prove it on the test ring, live with its record in service | Ardesia, a fresh Atlantic republic (2010–2040; coroas, Cr) | Portrait first | TypeScript, Vite, three 0.187 (npm) |

Studio site trading projects (not games): Pre-market brief, AI Trading Journal,
Agent Fleet.

---

## 7. Game profiles

Each profile uses the same headings so you can compare games quickly. Paths
are as of this snapshot.

### Prairie Engine Works (repo `350Chev`)

- **Status:** Released. 1.76.78.0 (`const VERSION` in `src/app/state.js`; the CLAUDE.md header lags behind).
- **Pitch:** a physics engine builder. Pick a layout, choose every part down to the rod bolts, put it on the dyno, race it, or run a shop that supplies race teams a season at a time.
- **Loop:** 19 layouts, 56 part tables (268 options), 96 base engines. Dyno, endurance and over-rev tests. Ten event types: drag, bracket, pull, salt flats, bog, boat, road course, hill climb, oval, 24-hour. Career: supply race teams for 8-round seasons across 27 series, with certification, R&D, crew, sponsors, 3 rival shops and Legacy prestige. A test-cell sandbox.
- **Setting and tone:** a prairie engine shop around Saskatoon ("Section Line Dragway · Saskatoon"). The real Pikes Peak and Bonneville appear. Money in `$` (en-CA). Hands-on gearhead.
- **Look:** "engine shop at night". A 3D engine and garage under the "Shop Glass" UI (`src/css/ui-glass.css`). Fonts: Chakra Petch, Barlow, IBM Plex Mono (Google Fonts).
  - Dark: soot `#141413`, panels `#1c1b19` / `#252421`, chalk `#faf9f5`, muted `#b4b1aa`, orange `#d97757` / `#e8956f`, accent `#b48ce8`. Status colours: good `#5cbf8a`, warn `#e2b24a`, crit `#ee5a5e`, info `#78a9dd`.
  - Light: bg `#faf9f5`, panels `#ffffff`, text `#141413`, orange `#ad4d2a`, accent `#7b3fc4`.
  - Theme: dark, light or auto.
- **Platform:** phone portrait and landscape; a desktop layout (`html.desk`).
- **Stack:** classic JS globals `ENGINE_SIM` / `ENGINE_SOUND` / `ENGINE_VIS`.
  - `build.js` joins the 119 files in `src/manifest.txt` into `index.html` (about 3.8 MB) and writes `sw.js`.
  - three r128 from cdnjs. Post-processing addons and GLTFLoader come from jsdelivr via `PEW_LIBS` / `__pewPost`.
  - Lite/Full/Ultra graphics tiers.
  - No CI. Checks: `node build.js --check` and `node check-savecode.js` (15 checks).
- **Saves:** `pew2-save`, `pew2-slot1..3`, `pew2-legacy`.
  - Code `PEW1:` (LZW + base64url + 6-character FNV checksum). Old one-game `PEW2:` codes still load; the next format is `PEW3:`.
  - Backup file `prairie-engine-works-backup-YYYY-MM-DD.txt`; last backup time in `S.bkAt`.
- **Audio:** an engine synth built from the engine's specs, plus 72 openly licensed recordings (`sounds/CREDITS.md`). A Synth / Real / Blend setting.
- **Reusable:**
  - Build and offline: `build.js` (with `--check`, `--absorb` and a content-hashed `sw.js`), `src/app/pwa.js`.
  - Saves: `src/app/savecode.js` + `check-savecode.js`.
  - Loading and speed: the `#boot` splash in `src/html/head.html`, `src/app/perf.js`.
  - Photos and cards: photo mode (`src/app/photo.js`, `src/vis/photo.js`, `phoSave`); the results card `src/app/rcard.js` (ghost curve, holo trophy).
  - Help and UI: `src/app/help.js` (tour, glossary, 17 lessons), `ui-glass.css`, `src/app/rail.js` (results rail and sheet), `folds.js`.
  - Career pieces: `crew.js`, `rivals.js`, `legacy.js`.
  - Assets: `src/vis/models.js` + `tools/pack-model.py`, `tools/make-icons.js`, `tools/fetch-sounds.js`.
- **Names:**
  - Tracks: Section Line Dragway, Prairie Sky Raceway, 24 Hours of Prairie Sky, Coulee Park, Grain Exchange Street Circuit.
  - Hills: Badlands Grade, Kettle Butte, Ghost Ridge, Thunder Pass.
  - Rival shops: Hollis Hot Rods (Tulsa; owner Dale Hollis), Marlow & Daughters (Duluth), Tidewater Diesel & Marine (Galveston).
  - Sponsors: Blue Heron, Coldwater, Ironhorn, Corvid, Gopher Valley, Red Butte, Gripline, Hollow Ridge, Static Moose, Wild Oat, Northlight. Northwind Tyre appears on signs.
  - 24-hour teams: Moose Jaw Speed, Estevan Oilpatch, Canola Speedworks. Trucks: Prairie Thunder, Sod Buster.
- **Gaps:** turbo spool, supercharger whine and nitrous are still synthesized; there's no Deltic recording; the first load is 3.8 MB.
- **Pitches:**
  - A node sim-test harness like Scrapline's `tools/sim-test.js`.
  - "Watch it" replays for pull, bog, boat and hill.
  - Lazy-load chunks of the 3.8 MB page.
  - A CI check on PRs (Kelbo's call).

### Lombard

- **Status:** released **1.0.0.0 on 6 November 2026** (`VERSION` file; `package.json` stays at 0.1.0). The studio site still shows "In development" 0.1.1.0. Roadmap M0–M6 are done. Save `STATE_VERSION` is 9.
- **Pitch:** a first-person pawn shop sim. Stand at the counter of a canal-side *lombard*, inspect what people bring in, work out what it's worth and whether they're lying, then haggle.
- **Loop:**
  - Customers: 8 sellers a day, each with an item and a story. Some are walk-ins built from templates; 40 are authored regulars.
  - Inspect: orbit and pinch the 3D item, then use the tools (loupe, scale, UV, magnet, acid, reference book, phone lookup, specialist call). Each tool returns evidence cards; the game never says "FAKE".
  - Decide: buy, give a pawn loan (30 days, interest) or pass. The haggle runs 2–5 rounds with Straight / Evidence / Sympathy / Walk.
  - Between customers: price and display stock, sell to walk-in buyers, take phone calls.
  - Day end: the ledger, the morning paper, reputation by group.
  - Wider systems: 5 specialists on retainer; a crime layer (police heat and Detective Volkova, mob protection, a fence); 8 story arcs plus specialist arcs and 20 regular threads; upgrades; an appraiser hire.
  - Endings: retire from day 90 or hit a forced ending. One of 19 ending titles is picked from 4 hidden axes, then a newspaper epilogue and a card for each character.
- **Setting and tone:**
  - Place: Mostograd, a fictional St Petersburg-like river city. The shop is on Kanatnaya Street in the Kanal district.
  - Time and money: the career starts 2014-03-03; money is rubles (₽).
  - The default shop name is "Lombard No. 7" (the player can rename it). The player has no name or face.
  - Tone: warm slice-of-life with dark-comedy edges; the crime is grounded. Some signage is in Cyrillic.
- **Look:** a lived-in canal-side shop in warm evening light.
  - 3D: a full Cycles lightmap bake, scripted Blender item models, and Microsoft Rocketbox rigged humans (MIT).
  - UI: 2D DOM in paper tags, receipt mono and worn plastic. Menus and the title use the Longlight palette.
  - Fonts: Space Grotesk 400/500/700 and IBM Plex Mono 400/500/600, self-hosted via `@fontsource`. The newspaper is in Georgia.
  - Palette (`src/style.css`):
    - Base: slate `#141413`, surface `#1c1b19`, card `#1f1e1b`, plastic `#2a2723`, ivory `#faf9f5`, muted `#a39d92`.
    - Paper: `#efe7d4` with ink `#2a241c` / `#6a5f50`, red `#9e2b1f`, green `#2f5a33`. Newsprint `#ece4cf`.
    - Accents: clay `#d97757`, light clay `#e8967a`, purple `#7b3fc4`, lilac `#b48ce8`.
  - Dark only. Settings for reduced motion and text size.
- **Platform:**
  - Layout: portrait phone first (390×844). Landscape and desktop move the dialogue and actions into a right-hand column.
  - Input: Pointer Events. Drag to look; orbit and pinch to inspect; tap and hold to use a tool. The desktop key map is `src/input/keymap.ts`.
  - Budget: 30+ fps on a 2021 mid-range Android; first load 13.9 MiB against a 15 MiB cap.
- **Stack:** TypeScript 5.9 and Vite 8.3.5, with no UI framework.
  - three.js 0.187.0 from npm, split into chunks. Also idb, zod, fflate and stats.js.
  - Dev tools: Vitest, ESLint, Playwright, gltf-transform, KTX2, Draco.
  - Workflows: `deploy.yml` (lint, test, build, Pages); `bake.yml` and `items.yml` (headless Blender).
  - Checks: `npm run lint`, `npm run test`, `npm run build` (with the `scripts/check-bundle.mjs` budget gate), `npm run shots`, `npm run sim -- --days 100 --seeds 10`.
  - URL flags: `?debug=1`, `?perf=1`, `?scenario=`, `?gallery=1&item=`, `?seed=`, `?tier=`, `?time=HH:MM`, `?street=`, `?weather=`, `?life=0`.
- **Saves:**
  - Careers: IndexedDB database `lombard`, store `careers`, 3 slots.
  - Settings: localStorage keys `lombard.*` (`sound`, `ambience`, `lastBackup`, `qualityTier`, `autoTier.v2`, `reduceMotion`, `textScale`, `lookHintSeen`).
  - Save code: `LMB1.` + base64url(deflate JSON) + `.` + a 7-character FNV-1a base36 checksum (`src/game/save/code.ts`). Under about 20 KB.
  - Migrations come with frozen fixtures for v1–v9.
  - Safety: backup file `lombard-backup-YYYY-MM-DD.txt`, `persist()`, a storage line and a 14-day reminder (`src/persist/safety.ts`).
  - **No service worker.**
- **Audio:** WebAudio. `src/audio/cues.ts` is a pure map from state change to sound; `engine.ts` plays them, including a 54 s ambience loop with crossfades. 13 CC0 OpenGameArt recordings as mono MP3, built by `art/audio/build.py`.
- **Reusable:**
  - Saves: `src/game/save/code.ts` (compact deflate codes with readable errors); `src/persist/safety.ts`; `src/persist/autosave.ts` + `src/game/save/slots.ts` + `migrations.ts` (IndexedDB slots with fixture-tested migrations).
  - Speed and loading: `src/render/perf.ts` (tiers; steps down when the median frame rate falls under 45 fps); `#loading` + `src/ui/loading.ts`.
  - Audio: `src/audio/cues.ts` + `engine.ts`, and `art/audio/build.py`.
  - Blender in Actions: `bake/` + `bake.yml` (a headless Cycles bake started from the phone). Builders in `art/items/`, `art/customers/build.py`, `art/street/` and `art/backdrop/`. Packers `scripts/*-pack.mjs` + `copy-decoders.mjs`.
  - Game logic: `src/game/haggle/machine.ts`; `src/game/story/` (a declarative story-arc engine); `src/sim/simulate.ts` + `policies.ts`; `src/game/rng.ts` (mulberry32).
  - Text: `src/data/strings/` (a typed `t()` with Intl plurals, plus a test that catches hard-coded English).
  - Checks and tools: `scripts/shots.mjs`, `scripts/check-bundle.mjs`, `scripts/make-icons.mjs`.
  - Living scene: `src/render/street/` (sprite passers-by, traffic, a boat, weather); `src/render/life/` (wall clock, moving sunlight, steam, a flickering tube); `src/ui/screens/news.ts`.
- **Names:**
  - Specialists: Faina Gelfand, Ilya Semyonovich Brodsky, Gennady Pavlovich Shurygin, Stanislav Edgarovich Lyubimov, Zhenya Kroshkina.
  - Crime and law: Detective Alla Sergeevna Volkova; the fence Veniamin "Venya" Mostovoy; the crew's Eduard Lvovich and Zhora.
  - The shop's people: previous owner Yuri Gusev; appraiser Lev Andreyevich Sablin; landlord Semyon Markovich; caretaker Pyotr Kuzmich Lapshin.
  - Story cast: the Collector Leopold Germanovich Bessmertny (Bessmertny Foundation for Domestic Beauty); Seryozha the roofer; Father Ioann; Edik Sorokin and Ramil; Fedya Ryabov; Zinaida Petrovna.
  - The 40 regulars are in `src/data/regulars/`.
  - Brands:
    - Watches: Rolland, Omeca, Brequet-Fils, Mostochas.
    - Phones: Mangosteen, Galaxia, Vertex.
    - Cameras: Kanon, Nevka.
    - Laptops and VHS: Tosaki.
    - Bags: Louis Vieux, Guccio.
    - Hi-fi: Rubezh, Nakashima. Car audio: Severin.
    - Consoles: Nimbus, Kosmo.
    - Records: Liraphon, Kanal. Books: Mostizdat.
    - Real Soviet makes appear as historical items: Pobeda, Vostok, Zenit.
  - The paper: Вечерний Мостоград / *Evening Mostograd*.
- **Gaps:**
  - Previews render with AgX tone mapping; the game uses ACES.
  - Parked speed work: avatars as KTX2 (about 10 MB decoded each), a smaller HDRI, an ETC1S lightmap.
  - Parked polish: the street door doesn't open; no footsteps, temperament idles, shop cat, clock tick or fan; the landscape haggle bubble covers the item.
  - In the GDD but not built: loan renewals; walk-outs coming back with the remembered offer; neighbourhood reputation changing the customer count (fixed at 8); sports items; a second language.
  - The roadmap doc lags behind the code.
- **Pitches:**
  - A `lombard-` service worker so installed copies work offline.
  - Walk-outs who come back later with the remembered offer, and standing that sets the daily customer count.
  - Temperament idles as haggle tells.
  - A shareable ending card.

### Scrapline

- **Status:** the site shows "In development" 0.1.12.0; the repo is at 0.1.15.2 (`const VERSION` in `src/app/state.js`). All 10 plan PRs are done. There are no GitHub Releases, so the site lags.
- **Pitch:** build combat robots in a Haldis workshop and fight them in the arena.
- **Loop:**
  - Five weight classes: Ant 150 g, Beetle 1.5 kg, Hobby 5.5 kg, Feather 14 kg, Heavy 110 kg.
  - Build: part slots and a layout grid; six bench tests.
  - Fight: a deterministic 60 Hz fight sim shown in 3D, in 1v1, rumble, tag team and minibot formats. A 60-second pit window, a post-mortem and a replay.
  - Career: 52-week seasons over 4 acts.
- **Setting and tone:** the present day from 2026, in Velmark and the Haldis. Money is euros (`€4,850`). Venues: Haldis Gemeindehalle, Stahlbrück, Eisenau, Grauwald, the Eisenhalle. German-flavoured alpine names.
- **Look:** uses the Longlight palette as its own look. Fonts: Space Grotesk + JetBrains Mono (Google Fonts).
  - Dark: base `#141413`, surface `#1C1B19`, card `#1F1E1B`, ink `#F2EFE8`, muted `#ABA79E`, clay `#D97757` (light-theme text `#A8482A`), lilac `#B48CE8` / purple `#6A33AD`. Status colours: good `#4CC38A`, warn `#E2A93B`, crit `#E5484D` (text `#F06A6E`).
  - Light: base `#FAF9F5`, surface `#F1EEE7`, card `#FFFFFF`, ink `#1C1B19`.
  - Theme: dark, light or auto.
- **Platform:** portrait; side by side in landscape. Stick, tap-to-go, keyboard, gamepad and haptics.
- **Stack:** the PEW shape, with globals `SCRAP_SIM` / `SCRAP_VIS` / `SCRAP_SOUND`; `SCR_LIBS` / `__scrPost`.
  - Checks: `node build.js --check`, `check-savecode.js` (16 checks), `tools/sim-test.js` (which also bans `Math.random` and `Date.now`), `tools/fight-test.js`.
- **Saves:** `scr-save`, `scr-slot1..3`; caches start `scr-`; `SAVE_V` 7.
  - Code `SCR1:` (the next format is `SCR2:`).
  - Backup file `scrapline-backup-YYYY-MM-DD.txt`.
- **Audio:** a synth (`src/sound/synth.js`) plus 18 CC0 clang recordings.
- **Reusable:**
  - Fighting: `src/sim/fight.js` (deterministic 2D rigid bodies with a height axis, an input log and `replayFight`) + `tools/fight-test.js`; `src/sim/ai.js` (8 driving styles).
  - Controls and effects: `src/app/controls.js`; `src/vis/fx.js`.
  - Help and reports: `src/app/help.js` (loaner-bot tutorial, `phoSave`, a bot card via `SCRAP_VIS.shot`); `src/app/report.js`.
  - Scene: `src/vis/props.js`.
  - Shared with the PEW line: `src/sim/rng.js`, `build.js`, `savecode.js`, `perf.js`, `pwa.js`.
  - Tools: `tools/blender-arena-kit.py`, `tools/blender-bot-shells.py`, `tools/pack-model.py`, `tools/get-polyhaven.py`, `tools/make-icons.js`.
- **Names:**
  - Rivals: Ottilie Brandt, Rudi Kessler, Mira Vogt, Anselm Huber.
  - Staff: Liesl Amrein, Konrad Fehr, Pia Lötscher, Bruno Zaugg, Jonas Ritter, Vera Hasler.
  - Sponsors: Zahnrad Bräm, Kaffee Alpenrot, Seilbahn Haldis, Stahlbrück Eisenwerk, Radio Velmark, Velmark Bahn.
  - Bots: Zahnrad, Kiesel, Feierabend, Holzwurm, Glockenschlag, Zange, Uhrwerk, Lawine, Hochofen, Walzwerk.
- **Gaps:**
  - Balance: some builds win over 65% of fights.
  - Replays: could drift between browsers (they use `Math.sin`).
  - Fights: no disc-against-disc contact; no pit window in rumble or tag.
  - Rendering: no interpolation between sim steps.
  - Tidying: an `undefined/` screenshot folder is committed.
- **Pitches:**
  - Deterministic maths so replays can be shared (Season Ticket's `det.ts`).
  - Publish GitHub Releases so the studio site updates.
  - Slow-mo replays with commentary.
  - A team post-mortem.
  - Delete `undefined/` and add a studio link.


### Season Ticket

- **Status:** Released. 1.0 launched 2026-10-19; now 1.1.2.0 (`src/data/meta/version.json`).
- **Pitch:** a football club owner/GM sim with a live match engine whose tactics you change mid-game.
- **Loop:**
  - Matches: a spatial 22-player engine, with three match-day modes (full control, game plan and big calls, coach).
  - Squad: transfers with a deadline-day war room; youth, staff, a wage cap.
  - Club: a stadium builder; money with a 5-step lender ladder that ends in receivership.
  - Story: 76 events, press conferences, rivalries, a newspaper and a fan feed.
  - Season: a 30-round league plus a top-6 playoff.
- **Setting and tone:** Valmere (the Valmeran dollar) and the Rivière Valley. The Kestrel Football League has 16 clubs; trophies are the Valmere Shield and the Founders' Cup. Every nation is fictional.
- **Look:** semi-realistic 3D (CC0 Quaternius bodies) with 2D DOM menus. System fonts (Georgia for the newspaper).
  - Palette: bg `#0b1020`, surface `#141b33`, text `#f4f5fa`, muted `#9aa3c2`, gold `#f2c14e`, teal `#4ecdc4`, win `#3ecf8e`, loss `#ef5b5b`.
  - Dark only. `src/ui/brand.ts` still holds older studio colours.
- **Platform:** **landscape**; 44 px tap targets; nothing wider than 640×360.
- **Stack:** TypeScript 7.0.2, Vite 8.3.4, three 0.186.1 (loaded only when a 3D scene opens), fflate, meshoptimizer, Vitest. Background matches run in Web Workers.
  - Checks: `npm test`, `npm run test:perf`, `npm run build`, `npm run check:first-load` (under 200 KB before the title).
- **Saves:** `seasonticket.career` + `.backup`; per-device settings under `seasonticket.*`.
  - Code `ST1:` (zlib JSON, base64). `CAREER_VERSION` 11, with migrations.
  - Backup file `season-ticket-backup-YYYY-MM-DD.txt`.
- **Audio:** a CC0 Freesound crowd, 3 OpenGameArt songs, and synthesized menu sounds (`src/render/audio/synth.ts`, `hub.ts`).
- **Reusable:**
  - Determinism: `src/sim/spatial/det.ts` and its ban test in `tests/spatial.test.ts`; `src/sim/rng.ts`.
  - Saves: `src/game/save.ts` + `saveKey.ts` + `saveCheck.ts`; `src/ui/career/saveSafety.ts`.
  - Speed and loading: `src/render/quality.ts`; `#boot` + `src/ui/bootScreen.ts`.
  - Offline: `src/pwa/serviceWorker.ts` + `register.ts`.
  - Workers: `src/game/matchRunner.ts` + `matchWorker.ts`.
  - Crashes and tips: `src/ui/career/crash.ts` + `report.ts`; `tips.ts`.
  - Story: `src/sim/career/news.ts`, `press.ts`, `story.ts`.
  - 3D: `src/render/stadium/`, `src/render/match/weather.ts`, `lod.ts`.
  - 2D: `src/ui/pitch2d.ts`, `src/ui/views/career/crest.ts`.
  - Checks and assets: `scripts/check-first-load.mjs`, `tests/credits.test.ts`, `scripts/assets/`.
- **Names:**
  - Nations: Esperia, Kaltland, Marrovia, Sundara, Ostenburg, Caravelle, Vostria, Norrvik.
  - Cities: Crowncaster, Port Alder, Cape Fenwick, Saltwater Cove, Sainte-Rivière, Val-Delacroix, Lakehaven, Wrenmoor, Inkwater, Cindervale, Fort Sterling, Silverpeak, Frostbeck, Lumenfell, Prairie Junction, Sunreach.
  - Clubs: Monarchs, Mariners, Gulls, Orcas, Voyageurs, Rouges, Loons, Wranglers, Wolves, Ironsides, Sentinels, Yeti, Huskies, Aurora, Threshers, Grizzlies.
  - Stadiums: Crown Park, Harbourside Park, Lighthouse Road, The Cove, Stade de la Rivière, Stade des Tilleuls, Loon Lake Ground, Wrenmoor Common, Mill Lane, The Foundry, Garrison Park, The Summit, Beckside, Aurora Field, Harvest Park, Sunreach Bowl.
  - Paper: *The Valmere Courier*.
  - Lenders: Harbourline Bank, Greyhollow Capital, Tallow & Finch Credit.
  - Sponsors: Vellicor Telecom, Quorra Air, Halberd Motors, Tidewell Mutual, Ombrine Foods, Corvane Logistics, Pellinore Electric, Copperkettle Brewing, Marrowind Insurance, Bluefen Software, Gallowmere Energy, Stoatley Bakeries.
- **Gaps:**
  - Waiting on others: analytics (waiting on Kelbo); frame-rate numbers from a real phone.
  - Sim drift: the league's average age drifts down; some world generation uses non-deterministic `Math`.
  - Bugs: a two-tab 3D bug.
  - Not built from the design: kit designer, awards, cups, lower divisions and more.
- **Pitches:**
  - The official brand mark and © line.
  - A win-probability readout.
  - End-of-season awards as a *Courier* special.
  - Deterministic world generation for new careers.
  - A kit designer.

### Frontier Lab

- **Status:** the site shows "In development" 0.1.63.0 (`gameVersion` in `package.json`); save schema 39. Live, with post-launch fixes.
- **Lineage:** a fork of Vault Street (a bank tycoon), which was itself a system-for-system remake of the mobile tycoon *Coffee Inc 2*. The upstream remote is read-only. Vault Street save codes are rejected.
- **Pitch:** found an AI lab and grow it into a global company.
- **Loop:**
  - Start: a $1.5M seed and an engraved city map where you open sales offices.
  - Business: the Deal Desk; compute (GPUs, data centres, power); model generations.
  - Oversight: a safety ratio and regulators; HQ floors; a board.
  - Growth: an IPO at $100M ARR; M&A; ventures; travel across 28 cities.
  - Personal: a personal empire and a rich list.
- **Setting and tone:** real cities on procedural maps (20 start cities including Saskatoon; energy sites Fort McMurray, Pilbara, Midland), 2027, with a currency switch. All companies, models and people are fictional.
- **Look:** "Banknote Deco" in 2D canvas and SVG (no three.js). Fonts: Bodoni Moda + Public Sans via `@fontsource`.
  - Palette: vault `#131d33`, deep `#0a1222`, raised `#1c2943`, ivory `#ece8da`, dim `#b3b5ae`, brass `#b8913d` / `#d9be7a`, signal `#3aafbf`, jade `#3e8a73`, oxblood `#9e3d3d`, paper `#dfe7e7`.
  - Each city has its own ink (Saskatoon `#8A6A2C`).
  - Dark only.
- **Platform:** portrait 390×844 first; a side drawer from 900 px.
- **Stack:** TypeScript ~6, Preact + signals, Vite 8, lz-string, Vitest (187 files), ESLint, `npm run balance`.
  - Commits here are authored as Claude (Kelbo's choice for this repo). Auto-merge is on.
- **Saves:** IndexedDB `frontierlab`, with a `frontierlab.*` localStorage fallback.
  - Code `FL<schema>:` (lz-string).
  - Backup file `frontier-lab-backup-YYYY-MM-DD.txt`.
- **Audio:** 4 synth sounds, off by default.
- **Reusable:**
  - Map: `src/art/isoRenderer.ts` + `chunkGrid.ts` / `chunkPainter.ts` / `canvasKit.ts`; `pixelLru.ts`; `citygen.ts`; `lifeLayer.ts`.
  - Engraved art: `engrave.ts`, `guilloche.ts`, `prng.ts`, `logoShapes.ts`, `portraits.ts`.
  - Charts and UI: `src/app/components/` (LineChart, Donut, RadarRosette, Carousel, Toasts).
  - Determinism: `src/sim/detmath.ts`; `src/sim/rng.ts` (sfc32 named streams); cyrb53.
  - Saves: `src/sim/save/slotData.ts`, `backupFile.ts`, `backupReminder.ts`.
  - App shell: `src/app/pwa/`; `#boot` + `boot.ts`; `src/app/tutorial/`.
  - Story and balance: `src/sim/news.ts`; `scripts/balance.ts`.
- **Names:**
  - Paper: *The Weekly Inference*.
  - Rival labs (29): Harbourline AI, Maple Crown Intelligence, Prairie Open Models, Nimbus Labs, Granville Research, Liberty Ridge Labs, Eastgate Intelligence, Copperfield Collective, Fizz, Whitmore Institute, Kingsbury Cognition, Thameside Open Lab, Albion Machine Works, Belgrave Research, Lumière IA, Rheinmark KI, Oranjeburg Labs, Volt, Alpenhaus Research, Helvetic Open Models, Sakuragi Intelligence, Hoshino Labs, Komorebi AI, Southern Cross AI, Wattle Collective, Tidewater AI, Lionport Labs, Jade Harbour AI, Peak Research.
  - Model families: Wren, Lantern, Cobalt, Kestrel, Fathom, Juniper, Halyard, Tessel, Sable, Quarry, Marlin, Ember.
  - Banks: Ashgrove Capital, Whitlock & Rowe, Meridian Partners, Hollis Crane & Co., Sakura Bridge Securities, Southern Gate Advisory.
  - Agencies: Brightwell Creative, Northwind & Pike, Studio Halcyon.
  - Lobbyists: Capitol Bridge Advisors, Parliament Row Partners, Rue Royale Affairs, Harbourline Policy Group.
  - Vendors: Clearline, Northscore Open Voices, Sentinel Guardrails, TrueMark.
  - Jets: Corvid 600, Albatross 8000, Kite 350, Petrel 7500.
  - Universities: Prairie State, Kingsley, Bow River, Pacific Crest, Hudson Polytechnic.
- **Gaps:** no logo or © line.
- **Pitches:**
  - The brand lockup and © line.
  - A scenario mode.
  - Challenge codes.
  - Office renovations.
  - Rename Harbourline (also used by Season Ticket).

### Hull Down (repo `hull-down`)

- **Status:** the site's label is "Prototype", hidden on the studio site. Plan of record `docs/HULL-DOWN-PLAN.md` (staged PRs in section 14); progress in `docs/STATUS.md`.
- **Pitch:** run a state tank design bureau. Design a tank against a weight limit, watch it at trial, read the after-action report, fix it. An engineering game about trade-offs.
- **Setting and tone:** Tarnovia, from the 1980s to today (its own take on the country; Laminar's Tarnovia is separate). No real countries, wars, vehicles, companies or insignia; no gore, crew are status icons. Generic engineering terms are fine.
- **Look:** a drawing office. Paper `#e9ece6`, grid `#c9d0c8`, ink `#1f3558`, pencil red `#b23a2e`, stamp green `#3d6b4f`; "blueprint" is the dark option (`#12305a`). Archivo Narrow, Archivo and Spline Sans Mono, self-hosted. The protection map never relies on colour alone.
- **Stack:** TypeScript (strict), Vite (`base: './'`), Vitest, ESLint, no UI framework. The design office is 2D (DOM, SVG, canvas); trials load three.js only when one opens. Release per `VERSION`.
- **Rules worth knowing:** `src/sim/` is pure and deterministic (seeded RNG, fixed step, `det.ts` maths); every number in `src/data/`; player text in `src/data/strings.ts`; names in `docs/NAMES.md`.
- **Saves:** localStorage `hulldown.*`, IndexedDB `hulldown`, caches `hulldown-`, save code `HD1:`.

### Funded

- **Status:** listed on the site since 12 November 2026, "Polishing". The design spec is `docs/HANDOFF.md`; progress is in the repo's `CLAUDE.md`.
- **Pitch:** a prop-firm trading game. The firm gives you an account and five days: hit the target without breaking the daily loss limit or the drawdown floor. Pass to climb from the stock desk to futures, then options.
- **Loop:** a roguelike career. Pick 1 of 3 edge cards after each day survived, optional mandates (handicaps) for more Reputation, a perk shop between careers; a firing sends the next career back to the first desk.
- **Setting and tone:** a trading firm's desk that changes with the career (back row, mid-floor, window seat, the cardboard box). Fictional tickers only.
- **Look:** Blender-rendered desk backdrops with percentage-placed monitor overlays; Space Grotesk, self-hosted. On the monitors only green `#2FBF71`, red `#E5484D`, ivory and lilac `#B48CE8`; clay stays off them. Every P&L carries a sign and an arrow.
- **Stack:** plain HTML, CSS and ES modules, no build step, no npm. Tests with `node --test`. A CSP meta tag; audio made with ElevenLabs.
- **Saves:** localStorage `funded.*`; no save code and no service worker yet.

### Burn Rate (repo `BurnRate`)

- **Status:** listed on the site since 15 November 2026 (it took Frontier Lab's place), "Released". The plan is `docs/BURN-RATE-PLAN.md`; progress in `docs/PROGRESS.md`.
- **Pitch:** a solid rocket motor design game. Clients bring a spec; you design a motor (grain, nozzle, case, igniter), the predictor draws the curve you expect, then you fire it for real and the real motor never quite matches.
- **Setting and tone:** a two-person startup renting a stand at Aqsor Range, the old state programme's Site 41, on a steppe salt flat in the 2030s. Ruslan Abenov, the Range Safety Officer, signs the incident reports. **Propellants are stat blocks, never recipes**: fictional named grades with performance numbers only.
- **Look:** "Faded state-range", light first: concrete greys, faded state green, stencil red, hazard amber; the startup's own controls in graphite and cobalt. Saira Semi Condensed, Saira Stencil One and Martian Mono, self-hosted. Measured traces red `#C8341E`, predicted blue `#1F5FA8`.
- **Stack:** the PEW shape (classic JS slices, `build.js`, generated `sw.js`), globals `BURN_SIM` / `BURN_VIS` / `BURN_SOUND`. Everything self-hosted, three.js vendored in `lib/`; CI runs the build check, sim tests and the balance bot.
- **Rules worth knowing:** the sim is pure with named RNG streams (`rngStreams`); SI units inside the sim; every physics change comes with an invariant test.
- **Saves:** localStorage `brn-settings`, `brn-save`, `brn-slot1..3`; caches `brn-`; save code `BRN1:`.

### Laminar

- **Status:** the site's label is "In development", hidden on the studio site (added 16 November 2026). 0.8.0.0 on 16 November (`VERSION` file): PRs 0 to 7 of `docs/LAMINAR-PLAN.md` section 14 are built (the aero sim, shaping, the tunnel and its quirks, contracts and bids, failures, the career to the 2040 ending) and PR 8, the rest of sport, has started with speed skating. `docs/STATUS.md` says where it stands.
- **What is in it:** a cycling career from a rented university tunnel: bid for a client's brief, shape the rider's position and kit in 3D, order a scale model, run it on the yaw turntable (smoke wand, rake, tufts, pressure taps), correct for the tunnel's hidden quirks, deliver a prediction, then watch the real event as a 3D replay. Rival firms, your own tunnel, workshop tools, staff, a soft landing when broke, save slots, save codes and backup files.
- **Pitch:** an aerodynamics consultancy game. Shape a fix in 3D, build a scale model, prove it in the wind tunnel, then find out at the real event whether your tunnel told the truth.
- **Setting and tone:** Laminar's own Tarnovia, 2010 to 2040, money in rubles (₽); Mostograd is one of its cities (Lombard owns Mostograd's canon). It is a separate take on the country from Hull Down's and shares none of its names. People are never hurt: riders lose time, pilots abort, models break. Real aero terms (CdA, Reynolds number, yaw); a fictional Tarnovian Cycling Federation, never the real UCI.
- **Look:** "Cobalt lab": a bright, clean wind-tunnel lab, light first with a dark mode, cobalt instruments (`#2456E8`), Instrument Sans and Spline Sans Mono (no other Longlight game uses either).
- **Stack:** TypeScript (strict), Vite, three.js 0.187 from npm, plain DOM UI, Vitest. Pages from Actions, `base: './'`. Release per `VERSION`, titled from the `PR <n>: summary — v<version>` merge.
- **Rules worth knowing:** the sim (`src/sim/`, `src/data/`) is pure and deterministic, with its own `det.ts` maths and named RNG streams; one truth, three views (hidden full-scale truth, the tunnel reading, the field result); the renderer only draws what the sim says. Names live in `docs/NAMES.md`.
- **Saves:** three slots in IndexedDB `laminar` (falling back to `laminar.slot.<n>`), other keys `laminar.*`, save code `LAM1:`, design codes `LAMD1:`. No service worker yet (plan PR 14); its caches will start `laminar-`.

### Outwash

- **Status:** the site's label is "In development", hidden on the studio site (added 21 November 2026). 0.9.0.0 on 21 November (`VERSION` file): PR 0 and PR 1 of `docs/OUTWASH-PLAN.md` section 16 are built (the repo, the car's eight components and setup, yaw, flex and flutter, the circuits with bumps and curbs, wind, the ten teams and twenty drivers, qualifying). The plan lists it publicly on the studio site at PR 7, the first playable. `docs/STATUS.md` says where it stands.
- **Pitch:** a Laminar game. You're head of aerodynamics at a grand prix team: shape parts, prove them in CFD and the wind tunnel, build them, and find out on Sunday whether a car that's fast on its own can race in a crowd. Dirty air is the lead twist; testing is rationed by championship position, under a cost cap.
- **Setting and tone:** Laminar's Tarnovia (the Dolgo Ring, Stavren Park, the Tarnovian Motor Racing Federation, rubles) plus a fictional Grand Prix World Series of twelve rounds, 2026 to 2050. **Laminar owns the canon**: Outwash never contradicts it, and Laminar's teams appear only in news lines and a feeder series. Drivers are never hurt. Grey areas are rule interpretation only, no cheating storyline.
- **Look:** "Pit wall": warm grey and off-white, light first with a graphite dark mode, one accent that becomes the player's team livery (fallback `#C2410C`), Saira and Red Hat Mono.
- **Stack:** TypeScript (strict), Vite, three.js 0.187 from npm, plain DOM UI, Vitest. Pages from Actions, `base: './'`. Release per `VERSION`, titled from the `PR <n>: summary — v<version>` merge. A standalone repo, not a fork of Laminar: code is copied and marked `// Adapted from Laminar <path> (<date>)`.
- **Rules worth knowing:** the sim (`src/sim/`, `src/data/`) is pure and deterministic, with its own `det.ts` maths and named RNG streams; truth, instruments, track, race (the player only sees readings with error bars); every number on the car has one address (`rear-wing.chord`). Names live in `docs/NAMES.md`.
- **Saves:** keys `outwash.*`, IndexedDB `outwash`, caches `outwash-`, save code `OUT1:`, design codes `OUTD1:` (saves arrive with plan PR 7).

### Mainline

- **Status:** the site's label is "In development", hidden on the studio site (added 25 November 2026). 0.13.2.0 on 25 November (`VERSION` file): the whole of `docs/MAINLINE-PLAN.md` (PRs 0 to 11) is built and live, plus the Your jobs tracker, the workshop's job checklist and works liveries.
- **Pitch:** a train-builder career, 2010 to 2040. Start as a small rebuild-and-repower works (a diesel shunter repowered to hybrid is the first job), win railway tenders against rival builders who bid too, design each train part by part, prove it at the test centre, then live with its record in service. Cargo and passenger (commuter, intercity, high-speed; no metro), every modern power type: diesel-electric, electric, hybrid, battery, hydrogen (from about 2026) and bi-mode. Design and watch only, no driving. Hunting is the signature failure, shown as a trace.
- **Setting and tone:** Ardesia, a fresh Atlantic republic with a Portuguese flavour, money in coroas (Cr); the capital Alcarra, the Penhalta Pass, the Trigais plateau, the yearly Alcarra Rail Fair. One country, no exports. Fictional railways, builders and suppliers; real rail terms used as they are.
- **Look:** "Daylight test ring": light first (pale grey and white panels, dark ink), railway signal colours for status, a train's yellow warning nose (`#F2C200`) as the one accent; dark mode follows the phone. Atkinson Hyperlegible Next and Atkinson Hyperlegible Mono (no other Longlight game uses them).
- **Stack:** TypeScript (strict), Vite, three.js 0.187 from npm, plain DOM UI, Vitest. Pages from Actions, `base: './'`. Release per `VERSION`, titled from the `PR <n>: summary — v<version>` merge. Train parts modelled in Blender by script.
- **Rules worth knowing:** the sim (`src/sim/`, `src/data/`) is pure and deterministic (its own `det.ts` maths, named RNG streams, SI units inside); time moves by the month with overlapping programmes; every failure has a cause the player can read and a "where to fix it" jump. Names live in `docs/NAMES.md`.
- **Saves:** keys `mainline.*`, IndexedDB `mainline`, caches `mainline-`, save code `ML1:`, backup file `mainline-backup-YYYY-MM-DD.txt`.

---

## 8. Names already taken

**Before naming anything new (a country, town, company, person, product,
newspaper), search this section.** Kelbo's games are separate worlds unless
noted, so a repeated name reads as a mistake.

**Worlds and settings in use**

| World | Games |
| --- | --- |
| Velmark, an alpine country; the Haldis valley (money in euros) | Scrapline |
| Mostograd, a fictional 2010s Russian river city; rubles | Lombard |
| The prairie, Saskatoon | Prairie Engine Works, the studio site's sky |
| Valmere (Valmeran dollar), Kestrel Football League | Season Ticket |
| Tarnovia (rubles), the town of Stavren; Mostograd borrowed from Lombard | Laminar (its own take on Tarnovia, separate from Hull Down's); Outwash borrows it |
| The Grand Prix World Series (twelve fictional countries and circuits), 2026–2050 | Outwash |
| Tarnovia, a state tank design bureau, 1980s to today | Hull Down |
| Aqsor Range (Site 41), a decommissioned test range on a steppe salt flat, 2030s | Burn Rate |
| A prop-trading firm's floor; fictional tickers | Funded |
| Real world cities on procedural maps | Frontier Lab |
| Ardesia (the coroa, Cr), capital Alcarra; an Atlantic republic, 2010–2040 | Mainline |

**Names used in more than one game** (already clashing; avoid adding more):

| Name | Where |
| --- | --- |
| **Kestrel** | Season Ticket (Kestrel Football League), Frontier Lab (Kestrel model family). **Retire it.** |
| **Harbourline** | Season Ticket (Harbourline Bank), Frontier Lab (Harbourline AI, Harbourline Policy Group) |
| **Hollis** | Prairie Engine Works (Hollis Hot Rods, Dale Hollis), Frontier Lab (Hollis Crane & Co.) |
| **Corvid** | Prairie Engine Works (sponsor), Frontier Lab (Corvid 600 jet) |
| **Tidewater** | Prairie Engine Works (Tidewater Diesel & Marine), Frontier Lab (Tidewater AI) |
| **Northwind** | Prairie Engine Works (Northwind Tyre), Frontier Lab (Northwind & Pike) |
| **V-countries** | Velmark and Valmere: two invented places that sound alike. Pick another starting letter. |
| **"Prairie"** | Prairie Engine Works, Prairie Open Models and Prairie State (Frontier Lab), Prairie Junction (Season Ticket) |
| **Nimbus** | Lombard (Nimbus game consoles), Frontier Lab (Nimbus Labs, Nimbus Health) |

Each game's full name lists are in its profile under **Names**.

**Shared worlds: who owns the canon**

A game owns each world below; any game that borrows from it must not
contradict it. Check the owner's file before adding a place,
date or institution.

- **Mostograd** (Lombard owns it): Lombard `docs/01-GDD.md`, the **Setting**
  and **Brands** sections.
  - Places: Kanatnaya Street (Kanal district), the Old Bridge,
    Lodochnaya Embankment, the Seventh Bridge, the outer ring, the port,
    the Lion Bridge, the Kupetsky drawbridge (opens 1:25 to
    4:50), Sennaya market, the Sukhov Canal; the paper *Вечерний Мостоград /
    Evening Mostograd*; one spring flood each career, in April.
- **Velmark and the Haldis** (Scrapline owns it since Escapement was
  retired on 16 November 2026): Scrapline's `WORLD` table in
  `src/app/state.js` and `docs/DESIGN.md`. Money is euros.
- **Mostograd in Laminar:** Laminar puts Mostograd in its Tarnovia; any
  Mostograd place or institution there follows Lombard's file above.
- **Laminar's Tarnovia** (Laminar owns it): Laminar `docs/NAMES.md` and
  `docs/LAMINAR-PLAN.md` section 12. Outwash borrows the Dolgo Ring,
  Stavren Park, the Tarnovian Motor Racing Federation, Gornova and Zelenia;
  its own names are in Outwash `docs/NAMES.md`.

---

## 9. Genres, looks and open space

**Genres and loops already taken**

| Family | Games |
| --- | --- |
| Craft career: build or make something part by part, test it, compete or sell, in a workshop that grows | Prairie Engine Works (engines), Scrapline (combat robots), Mainline (trains, on a monthly clock) |
| Engineering to a brief: design against a spec, test, read the report | Burn Rate (rocket motors), Hull Down (tanks), Laminar (aerodynamics), Outwash (a grand prix car's aero) |
| Roguelike runs | Funded (prop-firm trading) |
| Tycoon and management | Season Ticket (football club), Frontier Lab (AI lab), Lombard (pawn shop) |

**Shared habits across the line-up** (worth breaking on purpose in a new pitch):

- Almost every game is a **career on a weekly clock** ("act, then Close week").
- Almost every game is **dark-themed** (slate, navy, felt, console green). Only
  the light themes of PEW and Scrapline, and the light-first Hull Down,
  Burn Rate and Mainline, break that.
- Most are **single-player management**; only Scrapline's
  fights are real-time action.
- Three games share a near-identical classic-JS stack (PEW, Scrapline and
  Burn Rate); the TypeScript games each set up their own.
- All three craft careers share a weekly clock, a workshop that grows and rival
  shops. A new craft game should change at least two of those.

**Looks already in use** (pick something visibly different for a new game)

| Look | Game |
| --- | --- |
| Slate and clay "Shop Glass", Chakra Petch / Barlow / IBM Plex Mono | Prairie Engine Works |
| Longlight slate and clay workshop, Space Grotesk / JetBrains Mono | Scrapline |
| Paper tags, receipts, worn plastic, Space Grotesk / IBM Plex Mono (Longlight menus) | Lombard |
| Navy, gold and teal, system fonts, semi-realistic 3D | Season Ticket |
| "Banknote Deco": engraved isometric map, Bodoni Moda / Public Sans | Frontier Lab |
| Drawing-office paper and ink (blueprint as the dark option), Archivo Narrow / Archivo / Spline Sans Mono | Hull Down |
| Rendered trading desk with green, red, ivory and lilac monitors, Space Grotesk | Funded |
| "Faded state-range": concrete, state green, stencil red, Saira / Martian Mono | Burn Rate |
| "Cobalt lab": bright wind-tunnel lab, Instrument Sans / Spline Sans Mono | Laminar |
| "Pit wall": warm grey and off-white, one livery accent, Saira / Red Hat Mono | Outwash |
| "Daylight test ring": light first, signal colours, a yellow warning-nose accent, Atkinson Hyperlegible Next / Mono | Mainline |

**Open space** (observations, not decisions; Kelbo picks):

- Bright, daytime or light-first looks; hand-drawn or painterly 2D; pixel art.
- Genres with no Longlight game yet: puzzle, platformer or action, exploration,
  narrative adventure, city or colony builder, farming, logistics and
  transport (Mainline builds trains but doesn't run a network), fishing or nature,
  cooking, sports other than football (hockey and curling fit the prairie),
  weather and storm chasing, astronomy (the studio site already simulates the
  real sky).
- Shapes that break the weekly career: short daily runs with a shared seed
  (Funded's Daily Challenge has the pattern), pass-and-play or local multiplayer, a game you
  finish in an evening.
- Settings not yet used: the sea, the far north, a
  historical era, fantasy, a city at street level, somewhere warm.

---

## 10. Reuse map: where the best version of each system lives

Paths are as of this snapshot. Classic-JS games (PEW, Scrapline, Burn Rate)
share globals and one `S` state object; TypeScript games are modules.
Pick the source that matches your stack.

| Need | Best source | Path | Notes |
| --- | --- | --- | --- |
| Save code + backup file + persist + reminder, classic JS | Prairie Engine Works / Scrapline | `src/app/savecode.js` + `check-savecode.js` | Atomic restore and node tests with a pretend localStorage. Tied to `S`, `snapshot`/`hydrate`. |
| Compressed save + crash freeze, TypeScript | Season Ticket | `src/game/save.ts`, `saveKey.ts`, `saveCheck.ts` | fflate zlib, 60 MB inflate cap, a backup slot, saving frozen after a crash. |
| Save-safety UI on its own | Season Ticket | `src/ui/career/saveSafety.ts` | Persist, backup file via share sheet, reminder; imports only a JSON config. |
| IndexedDB slots with localStorage fallback | Frontier Lab | `src/sim/save/slotData.ts` | Migrations and `persist()`. |
| Slice build with checks + service worker | Prairie Engine Works (also Scrapline, Burn Rate) | `build.js` + `src/manifest.txt` | Zero dependencies; `--check` catches stale output, compile errors and duplicate functions; content-hashed cache name. Change the prefix. |
| Graphics tiers + auto step-down | Prairie Engine Works | `src/app/perf.js` | Lite/Full/Ultra; drops a tier under about 27 fps for about 8 s. TS: Season Ticket `src/render/quality.ts`. |
| PWA update bar, install, iOS tip | Prairie Engine Works | `src/app/pwa.js` | TS versions: Season Ticket `src/pwa/`, Frontier Lab `src/app/pwa/` (with a `?nosw` escape hatch). |
| Loading screen with real progress | Prairie Engine Works | `#boot` in `src/html/head.html` | TypeScript: Season Ticket's inline loading screen in `index.html` + `src/ui/bootScreen.ts`. |
| Seeded RNG with saveable state | Burn Rate | `src/sim/rng.js` | sfc32 seeded by cyrb128, no imports, one named stream per system. TypeScript: Frontier Lab `src/sim/rng.ts`. |
| Deterministic maths (sin, cos, exp, log, pow) | Season Ticket | `src/sim/spatial/det.ts` | IEEE-exact ops only; its test scans for banned `Math` calls. Also Frontier Lab `src/sim/detmath.ts`. |
| Headless balance bot | Frontier Lab `scripts/balance.ts`; Scrapline `tools/fight-test.js` | | Pick by stack. |
| Sim test harness with named builds | Scrapline (also PEW) | `tools/sim-test.js` | Cuts the sim block from the built page and runs it with `vm`; `--brief` for commit messages. |
| Trophy cards | PEW `src/app/rcard.js` (ghost curve, holographic tilt) | | |
| Photo mode | Prairie Engine Works `src/app/photo.js` + `src/vis/photo.js` | | |
| Scripted Blender props (no Blender UI) | Scrapline `tools/blender-*.py`; Lombard bake in Actions | | Commit the `.glb` output. |
| glTF packer for phones | Prairie Engine Works | `tools/pack-model.py` | Shrinks textures, quantizes vertices; needs Pillow and numpy. |
| Home-screen icons from an SVG | PEW / Scrapline | `tools/make-icons.js` | Needs Playwright. |
| Procedural modular stadium, instanced crowd | Season Ticket | `src/render/stadium/` | |
| GPU weather particles | Season Ticket `src/render/match/weather.ts` | | |
| Engraved isometric city map | Frontier Lab | `src/art/isoRenderer.ts` + `chunkGrid.ts` | With `pixelLru.ts` for iOS canvas memory. |
| Engraved portraits, guilloche, hatching | Frontier Lab | `src/art/portraits.ts`, `engrave.ts`, `guilloche.ts` | |
| Preact charts | Frontier Lab | `src/app/components/LineChart.tsx`, `Donut.tsx`, `RadarRosette.tsx` | |
| Deterministic 2D physics fight + replay log | Scrapline | `src/sim/fight.js` | |
| One input shape from stick, tap, keyboard, gamepad | Scrapline | `src/app/controls.js` | |
| Sparks, flying parts, camera shake | Scrapline | `src/vis/fx.js` | |
| Background sim on Web Workers | Season Ticket | `src/game/matchRunner.ts` + `matchWorker.ts` | Main-thread fallback. |
| Crash screen with save code and report | Season Ticket | `src/ui/career/crash.ts` + `report.ts` | |
| Newspaper and story events from templates | Season Ticket `src/sim/career/news.ts`, `story.ts`; Frontier Lab `src/sim/news.ts` | | Seeded streams. |
| SVG crest builder | Season Ticket | `src/ui/views/career/crest.ts` | |
| First-load size budget check | Season Ticket | `scripts/check-first-load.mjs` | |
| Every asset credited, tested | Season Ticket | `tests/credits.test.ts` | Writes `CREDITS.md`. |
| Engine voice from the build | Prairie Engine Works | `src/sound/profile.js`, `synth.js`, `samples.js` | |
| Save code, TypeScript, deflate | Lombard | `src/game/save/code.ts` | `LMB1.<data>.<checksum>`: raw deflate (fflate), base64url, FNV-1a in base36. |
| IndexedDB career slots + migration fixtures | Lombard | `src/persist/` + `tests/` | Three slots, settings in localStorage, old saves tested. |
| Save safety (persist, backup file, reminder), TypeScript | Lombard | `src/persist/safety.ts` | Explains the shared-origin risk in its header. |
| Lightmaps baked by headless Blender in Actions | Lombard | `bake/` + `.github/workflows/bake.yml` + `scripts/bake-pack.mjs` | Nobody opens Blender; the workflow bakes and packs. |
| Model and texture packing (Draco + KTX2) | Lombard | `scripts/items-pack.mjs`, `street-pack.mjs`, `backdrop-pack.mjs` | Node scripts; PEW's `tools/pack-model.py` is the Python option. |
| Haggling state machine | Lombard | `src/game/haggle/machine.ts` | Pure, seeded, every number in `tuning.haggle`. |
| Story beats with conditions and effects | Lombard | `src/game/story/` | Scripted visits, pledges, specialists. |
| String table + test that fails on hard-coded UI text | Lombard | `src/data/strings/` + `tests/uiStrings.test.ts` | Ready for translation. |
| Headless screenshot tour for self-review | Lombard | `scripts/shots.mjs` | Plays a seeded day and saves PNGs (portrait, landscape, desktop). |
| Sound cues from state changes (pure, tested) | Lombard | `src/audio/cues.ts` + `engine.ts`; sounds made by `art/audio/build.py` | |
| Living room details: sunlight, clock, tea, flood | Lombard | `src/render/life/` | Time of day and weather for an interior. |
| Street outside a window (sprites, weather) | Lombard | `src/render/street/` | |
| Scripted low-poly people | Lombard | `art/customers/build.py` | Blender script; commit the output. |
| Quality tiers by render resolution + `?perf=1` overlay | Lombard | `src/render/perf.ts` | Auto steps down on the median frame rate. |
| Loading screen | Lombard | `#loading` in `index.html` + `src/ui/loading.ts` | |

---

## 11. Parked and older repos

Kelbo has other repos that are private or parked, and this public edition
leaves them out on purpose. Some hold useful code or names that are already
taken, so before reusing a system or settling a new name, ask Kelbo whether one
of them has it.

---

## 12. Studio-wide improvement ideas

Each is a pitch for Kelbo, not a plan. Repo names in brackets.

1. **Fix brand drift** (Season Ticket, Frontier Lab):
   official logo files, the five colours, and the
   `© <year> Kelbo / Longlight Interactive` line on splash and credits (section 3).
2. **Offline for every installed game**: every game should have a service
   worker and self-hosted fonts. PEW and Scrapline show the pattern.
3. **Cache cleanup on the shared origin**: done for the studio site on
   7 November 2026 (section 5). Check each game's service worker follows the
   same rule when it's next touched.
4. **Deterministic maths everywhere replays or shared codes matter**: Season
   Ticket's `det.ts` could become the studio standard (Scrapline replays, Season
   Ticket world generation for new careers).
5. **Daily seeds** like Funded's Daily Challenge and Scrapline's daily
   challenge, for Frontier Lab challenge codes.
6. **One save-code shape**: new games should use a prefixed, compressed
   code with a checksum (PEW's LZW + base64url, or Lombard's deflate for
   TypeScript), never plain base64.
7. **Retire the clashing names** in section 8 (Kestrel first, then Harbourline,
   Hollis) the next time each game is touched.
8. **Publish a GitHub Release on every version bump** so the studio site shows
   the right version (Scrapline still shows 0.1.12.0; others drift too).
9. **Tidy stray screenshots committed by accident**: Scrapline `undefined/`.
10. **Docs drift**: several CLAUDE.md files quote older versions or counts
    (PEW, Season Ticket). A docs refresh each release
    keeps sessions from trusting stale numbers.
11. **Lombard offline**: Lombard has no service worker yet. Add one with a
    `lombard-` cache prefix (PEW's pattern, or Season Ticket's for a Vite build).
12. **The studio site lags Lombard**: Lombard shipped 1.0.0.0, but the site's
    `projects.json` still shows it as "In development" 0.1.1.0 with no GitHub
    Release behind it. Publish a release and update its status.

---

## 13. Keeping this file current

- **The master copy lives in Kelbo.Website** at `.github/LONGLIGHT-STUDIO.md`
  (inside `.github`, so it isn't published on the site). Copies in game repos
  are drop-ins; update the master, then recopy.
- This is the **public edition**: every repo it goes into is public, so it
  never names or describes Kelbo's private repos. Kelbo keeps a fuller copy off
  GitHub.
- Refresh it when a game launches, is renamed or parked, changes its look, or
  adds a storage key or save-code prefix.
- To refresh: read each repo's `CLAUDE.md`, design doc, status file, CSS
  variables, version constant and save code, then update the profile, the
  tables in sections 5, 6 and 8, and the snapshot date at the top.
- Facts here are a snapshot. If this file and a repo disagree, the repo is right.
