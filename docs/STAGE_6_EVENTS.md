# Stage 6: Events and Story Layer (plan)

**Status:** plan approved by the owner (2026-10-18). Steps 6.1 and 6.2 built; next is 6.3.

**Done when (from CLAUDE.md):** a season produces varied, consequential events.

## What it is

Today the club talks to you through the inbox: about 25 kinds of plain notices ("Signed X", "Luxury tax", "Youth intake"). Nothing asks you to decide anything, and nothing you say comes back later. Stage 6 turns the club into a place with people in it:

- **People walk in with problems and you choose what to do.** Each event is a short scene with two or three choices, and each choice changes something you can see: cash, fan mood, a player's mood, a sponsor, a rival, the press.
- **Choices are remembered.** Some events lead to follow-ups weeks later (a promise to a player, a deal with the council, a feud with a rival owner).
- **The world talks back.** A newspaper and a social feed react to results, signings and your decisions.
- **Rivalries and derbies** make some matches matter more.
- **Press conferences** before big matches and after notable results.
- **Deadline-day war room** on the last day of each transfer window.

Everything stays in `src/sim` (pure, seeded, headless), so a season simulated in the background produces the same story as one played on screen. The story text lives in `src/data`, not in code.

## How it works

### Events

- An **event** is a data entry in `src/data/events/*.json`: who brings it (a visitor role), when it can happen (conditions on the career: phase, results, cash, fan mood, a player's mood, a rival, an earlier choice), how likely it is, and its choices.
- A **choice** has a label, a one-line hint of what it costs ("Costs $250k. Fans will like it."), and its effects. Effects are a small fixed set: money, fan mood, player mood, squad mood, reputation with the press, a sponsor's goodwill, a rival's heat, a flag for later events, a follow-up event in N weeks.
- Each week the sim checks which events can happen and draws from them with the career's seeded random stream. A **pacing budget** keeps it from feeling spammy: about one or two decisions in a normal week, more in transfer windows, none in some weeks. The same event doesn't repeat within a season unless it's meant to (a repeat offender, say).
- **Every event has a deadline** (usually the next match). If you don't answer, or the season is simulated to the end, the head coach or assistant picks the sensible choice. So "sim to end" and the headless tests play the same story layer, never stuck waiting.
- **"Let the staff handle it"** is on every event, so you can wave things off. Staff quality decides how well they handle it.
- Notices that don't need a choice stay plain inbox messages, as now.

### New things the sim tracks

- **Player mood** (per player, 0 to 1): playing time against squad role, contract talks, promises kept or broken, results, how you treated team-mates. Low mood leads to transfer requests, poor contract talks and dressing-room trouble. Mood also gives a small edge or penalty on match day (see question 1).
- **Press standing** (club-wide): how the press sees you. It colours headlines and some event odds.
- **Rival heat** (per pair of clubs): starts from geography (same region means a derby) and grows from playoff knockouts, big wins, poaching players or staff, and what you say in press conferences.
- **AI club owners** as light characters: a name, a temperament (calm, showman, penny-pincher, gambler) and a memory of how you've dealt with them. They come up in bids, rivalries and the news.
- **Story flags and timers** for follow-ups ("promised Okafor a starting place until week 20").

All of it goes in the save with a version bump and a migration. Old saves start with neutral moods, geographic rivalries and no flags. The news is trimmed each season, so saves stay small.

### Where you see it

- **The office:** the visitor at the door brings the event. Tap them and the scene opens over the office with their line and the choices. There are new visitor roles: a player, a fans' group rep, a city councillor, a rival owner, a VIP guest. Visitors are the existing bodies with new outfits.
- **The inbox** keeps every event and what you chose. Unanswered ones are pinned to the top with their deadline.
- **The TV** shows the newspaper front page: the main headline, two smaller stories, and the table. Tap it to read the paper.
- **The phone** gets a social tab: short fan posts whose tone follows fan mood and results, from made-up handles, plus rumours.
- **Plain menus (graphics Off)** get the same scenes as a card, and a "News" tab.

## Build steps

Each step ships a playable build to Pages, like Stage 5.

1. **6.1 Event core.**
   - Event data format, the weekly draw with its pacing budget, choices and effects, deadlines with automatic staff answers, and the save migration.
   - Player mood and press standing.
   - About 15 everyday events: a fringe player wants minutes, a star wants a new deal, a sponsor wants an appearance, a local charity asks for help, a fan complains about ticket prices, the head coach asks for a signing.
   - Scenes in the office and in plain menus.
2. **6.2 Newspaper and social feed.** Headlines from results, streaks, transfers, the table, records and your choices, with varied templates so the same story reads differently. Fan posts and rumours on the phone. TV front page.
3. **6.3 Press conferences.**
   - Before big matches (derbies, playoffs, top-of-the-table) and after notable results.
   - Two or three questions, each answered calm, bold or deflecting, which moves mood, press standing and rival heat. Your quotes show up in the paper.
   - The assistant can stand in.
   - About a minute each on a phone.
4. **6.4 Rivalries and derbies.**
   - Region derbies and rivalries that grow from history.
   - Derby day: bigger crowds and a louder build-up, bigger fan-mood swings, a derby badge on the fixture and in the match ticker, and rivalry events (a rival owner's jibe, a poaching attempt, a fan clash).
   - AI owners get their temperaments here.
5. **6.5 Crises and story chains.**
   - Multi-step stories:
     - dressing-room fall-out;
     - transfer request from an unhappy star;
     - injury crisis;
     - sponsor scandal;
     - floodlight failure before a home match;
     - fan protest (ticket prices, naming rights, a losing run);
     - council permit fight over stadium building;
     - a rival club trying to poach your head coach;
     - lender visits in the ladder told as scenes.
   - Promises with timers, and consequences when they're broken.
6. **6.6 Deadline-day war room.**
   - The last day of each window becomes a session in the office: a clock runs from 09:00 to 23:00 in tap-to-advance hours.
   - Calls arrive with short deadlines: late bids for your players, clubs panic-selling, agents with free agents, a rival hijacking a deal.
   - The whiteboard shows targets and the cash and wage room left. It ends with a "deadline-day ins and outs" front page.
7. **6.7 Variety and balance pass.**
   - Tune frequencies with headless seasons.
   - Fill gaps in the event list (target: 60 or more events across all steps).
   - Docs, screenshots, report.

## Tests (how "done when" is checked)

- **Headless seasons with a scripted owner** who picks choices at random. Over several seasons and seeds:
  - each season has at least 25 decisions and at least 20 different events;
  - no single event is more than 8% of them;
  - every visitor role appears;
  - quiet weeks exist.
- **Consequences are real:** for each choice effect, a test that it changes the state it says it does. For follow-ups, a broken promise produces its consequence.
- **Determinism:** same seed and same choices give the same story, live or headless.
- **Saves:** old saves migrate; a save made mid-event restores the open scene; the save code stays within budget.
- **No real names:** the existing name check covers the new text files (handles, newspaper names, AI owners).

## Budgets

- Weekly event check: under 5 ms for the whole league on a phone.
- Save growth: no more than 15 KB compressed after five seasons, compared with a Stage 5 save.
- Event text: loaded with the career screens (JSON, a few hundred KB at most), no new 3D assets except visitor outfit colours. A newspaper or phone prop, if added, comes from CC0 sources and is listed in `CREDITS.md`.

## Build notes

### 6.1 Event core (built 2026-10-18)

**Event data format.** Events live in `src/data/events/*.json` (6.1 ships `everyday.json`, 21 events). Each event:

- `id` (unique), `role` (the visitor who walks in: player, agent, coach, sponsor, reporter, fans, councillor, vip, staffer and the older office roles; labels and outfits are in `src/data/tuning/office.json`).
- `when`: conditions. `phase` (preseason/season), `weekMin`/`weekMax`, `window`, `subject` (who the event is about: any, benched, starExpiring, unhappy, young, captain), `hasSponsor`, `priceOverFair`, `homeNext`, `lostRun`/`wonRun`, `fansBelow`/`fansAbove`, `pressBelow`/`pressAbove`, `flag`/`noFlag`.
- Optional `amount` (written for a mid-sized club, scaled by market size), `deadline`, `cooldown`, `maxPerSeason`, `weight` (defaults in `story.json`).
- `title`, `text`, and per-choice `label`, `hint`, `result`, all filled from `{player}`, `{first}`, `{club}`, `{city}`, `{coach}`, `{amount}`, `{half}`, `{double}`, `{sponsor}`, `{opponent}` and the rest listed in the file's `_about`.
- `staff`: the choice the staff make if the owner doesn't answer by the deadline.
- `choices[].effects`: `cash` (times `amount`, booked to a named income or spending line), `fans`, `mood` (the subject player), `squad`, `press`, `goodwill`, `flag`, `price` (ticket price share), `promise` (starts or a signing, with weeks and a target; broken promises hit mood and press), `later` (effects that land some weeks later).

The loader checks every event on start: known role, the staff choice exists, ids are unique, and cash lines are real ledger lines.

**How a week works.** After the week's matches, a seeded draw (its own stream, so the story never changes match results) picks 0 to 3 events from the pace table, more in transfer windows, with at most 3 open at once. An event is eligible when its conditions hold, its cooldown has passed, it hasn't hit its season limit and a subject can be found. Each new event sends a Decision mail. At the deadline the relevant staff member answers with the event's staff choice; a better-rated staff member gets more of the good effects and less of the bad. Money is never scaled.

**Mood, press and goodwill.** Player mood drifts toward a target set by playing time against squad role and by recent results. On match day the starting eleven's average mood moves every attribute (not aggression) by up to ±3%. This applies to your club only, so AI-vs-AI matches and the engine fingerprints are unchanged. Press standing nudges fan mood each week; sponsor goodwill scales the next sponsor offers by up to ±10%. All three drift back toward neutral.

**Where you see it.** A visitor walks into the office for the first open decision; tapping them (or the inbox) opens the scene over the office with its choices and a "Let {staff} handle it" button. In plain menus, Home shows the first waiting decision and links to the rest, and the inbox pins decision mails with a "Waiting on you" tag. The Club screen has a Standing card (dressing room, press, sponsor goodwill), player pages show mood, and the menu has the Story pace setting (Calm / Normal / Busy).

**Saves.** Save version 5 adds `story` (open and past events, timers, press, goodwill, pace) and an `other` income line. Older saves migrate with a fresh story.

**Numbers so far.** A headless season with a scripted owner gets about 28 decisions across 16 different events (about 0.8 a week). That is below the 6.7 target of 25+ decisions from 20+ events at under 8% each, because 6.1 has only 21 events; the 6.1 test uses looser limits (20 decisions, 12 kinds, 15% each) until 6.7 fills the pool.

### 6.2 Newspaper and fan feed (built 2026-10-18)

**The paper.** *The Valmere Courier* prints one edition at the end of every week (pre-season weeks, each round, the mid-season break and each playoff round). An edition has 2 to 4 stories, the biggest first. Stories come from:

- your result (the tone follows your press standing), with playoff, final and shootout versions;
- the round: a record win, a rout, or an upset between clubs 8 or more places apart;
- winning and losing runs (at the threshold, then every 2 more games);
- the table: a new leader once 3 games are played, and crossing the playoff line after 5;
- the shield and the champions;
- a pre-season preview from each club's best 16 players;
- hat-tricks and scoring milestones;
- transfers (yours always; the biggest AI deals, without repeating a player), money trouble when the lender ladder rises to level 2 or more, finished building work;
- your decisions: 15 event choices in `everyday.json` now carry a `news` line, and broken promises make the paper.

Templates are in `src/data/news/newspaper.json` (several per story, so the same story reads differently); weights and caps are in `src/data/tuning/news.json`.

**The fan feed.** About 4 posts a week from made-up fans, with handles built from parts (at most 20 characters, never "official"). Posts react to your result, mood, signings and sales, ticket prices, rival fans after you play them, transfer-window rumours, and the odd pie complaint. A post line is not reused within the last 12 posts. Lines are in `src/data/news/social.json`.

**Where you see it.** A News tab (Paper / Fan feed, with "‹ Older" and "Newer ›" to read back issues). Home shows the lead headline with a "Read the paper" button. In the office, the TV shows the front page next to a mini table, and the desk phone shows the feed when there are no offers (with offers it still shows them, and tapping it opens the Market). Tapping the TV opens the paper; tapping the phone with no offers opens the feed.

**Determinism and saves.** News has its own seeded stream, so it never changes a match or an event. Save version 6 adds `news` (the last 60 stories and 40 posts); older saves start with an empty paper. A full season adds about 5 KB to the save code.

## Owner's decisions (2026-10-18)

1. **Mood affects matches:** yes, up to about ±3% (a happy squad plays a little better, an unhappy one a little worse).
2. **Story pace:** a per-career setting, Calm / Normal / Busy. Normal is the default: one or two decisions a week, more in transfer windows.
3. **Press conferences:** only big matches (derbies, playoffs, top-of-the-table) and notable results.
4. **Deadline day:** tap-to-advance hours (taken as approved with question 3: "your thinking is correct as is").
5. **Fail state:** the lenders are the only way to lose the club. The game is about managing money and keeping your club; fans and shareholders can make life hard but cannot force you out.
6. **Rival owners:** light characters (name, temperament, memory).
7. **Tone:** mostly grounded and believable, with a touch of humour sprinkled in here and there (some odd visitors, the occasional cheeky fan post), never slapstick.

## Questions for the owner (as asked)

1. **Should player mood affect matches?** Proposal: yes, small. A happy squad plays up to about 3% better and an unhappy one up to 3% worse. Without it, mood only matters off the pitch.
2. **How busy should the story be?** Proposal: a per-career "story pace" setting (Calm, Normal, Busy), default Normal: one or two decisions a week, more in windows.
3. **Press conferences:** only big matches and notable results (proposal), or every match?
4. **Deadline day:** tap-to-advance hours (proposal, phone-friendly), or a real-time clock that runs whether you tap or not (more tense, roughly 5 minutes)?
5. **Fail states:** keep receivership as the only way to lose the club (proposal)? The alternative is fan or minority-shareholder pressure that can also force you out.
6. **Rival owners as characters** (proposal: yes, light: name, temperament, memory). Or keep rivals to clubs only?
7. **Tone:** grounded and believable (proposal), or allow some light humour in the social feed and odd visitors (a mascot strike, a pitch invader goat)?
