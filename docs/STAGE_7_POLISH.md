# Stage 7: Polish and Launch (plan)

**Status:** plan written 2026-10-18. The owner answered the questions the same day (see "Owner's answers" at the end), and chose GoatCounter for analytics (the site code is to come). 7.1 and 7.2 are built (see "Build notes").

**Done when (from CLAUDE.md):** ready to share publicly as a free web game.

## What it is

Stages 1 to 6 built the game. Stage 7 makes it ready for strangers: someone who has never heard of Season Ticket opens the link on a phone, understands what to do within a few minutes, plays several seasons without hitting a bug, a dead end or a stutter, and can see who made it and what it is built from.

The work in CLAUDE.md is: tutorial, audio pass, balance pass, performance pass, credits. This plan adds two things that a public launch needs: a crash and feedback safety net, and the large audit and fix round the owner asked for "later in the project".

## Where things stand

- **New players:** the career starts with no guidance. Each screen has a line or two of help text, but nothing tells a new owner what a week looks like, what the office objects do or what matters most (cash and the lenders).
- **Audio:** match day only (crowd, whistles, kicks: 14 CC0 sounds). The office, menus, events, press conferences and deadline day are silent. One on/off setting.
- **Balance:** the match engine meets its targets (2.55 goals a match, 45% home wins, 23% draws). Two known gaps: the watched match is a little more open than background matches, and coarse and fine mode disagree on throw-ins and offsides (DESIGN.md 17.15). The economy and the difficulty tiers have never been tested over long careers.
- **Performance:** first load downloads about 325 KB of compressed script before the title screen (1.0 MB uncompressed); 3D scenes load their own files later. The 3D match aims for 30 fps at Medium. The owner reports it "running very well" on their phone; the frame rate numbers are still to come.
- **Credits:** `CREDITS.md` lists every asset and library, but there is no credits screen in the game.

## Build steps

Each step ships a playable build to Pages, like Stages 5 and 6.

1. **7.1 First-time tips and Help (tutorial).** The owner chose tips and a Help screen, with no guided week.
   - First-time tips: the first time you open a screen or meet a feature (the office and each object in it, the squad, line-up and tactics, transfers, contracts, the stadium, finances, a visitor, a press conference, the newspaper, deadline day, match day and its viewers), one card explains it in two or three lines. Tips can be turned off, and reset from settings to see them again.
   - A **Help** screen: short plain-language answers ("How do I lose the club?", "What is the wage cap?", "What does mentality do?"), reachable from settings and the plain menus.
   - It works the same with graphics Off.
2. **7.2 Audio pass.**
   - The office: a soft room tone, and match-day crowd noise drifting in through the window.
   - Taps and feedback: a soft tap on buttons, a knock when a visitor arrives, a phone ring for offers and deadline-day calls, a page turn for the newspaper, camera clicks at a press conference, a clock tick in the war room.
   - Match day: home and away chants and a louder crowd at derbies.
   - Music: office only (the owner's answer). A radio on the office shelf plays a few CC0 tracks; tap it to switch on or off. Off at first, and it remembers your choice. No music on match day or in the menus outside the office.
   - Settings: a volume control for each of crowd, effects and music, plus mute. iPhone's silent switch still applies.
   - All sounds CC0, listed in `CREDITS.md`, cut and compressed with the existing `build-audio.py`. They load per scene, not up front.
3. **7.3 Balance pass.**
   - **Long careers.** Headless 10-season careers on every difficulty with scripted owners: a careful one (keeps a cash buffer, sells to buy), a reckless one (spends everything on wages and fees), and a do-nothing one. Check how often each loses the club, how fast cash and debt move, whether a big club runs away with every title, and whether a small club can climb. See question 3 for the targets.
   - **Economy.** Transfer fees, wages, the wage cap and luxury tax, sponsor and ticket money, stadium upgrade payback times, youth intake quality, player ageing and retirement, measured over those careers.
   - **Match engine.** More fine-mode seasons to settle the "watched match is more open" gap; the AI head coaches' subs and mentality changes.
   - **Story.** The events that never turned up in test seasons are checked to make sure they can happen when their trigger does.
   - Results go in `docs/DESIGN.md` with before-and-after numbers, and slow tests guard them.
4. **7.4 Performance pass.**
   - **First load:** split the first download so the title screen shows sooner (the 3D code, the match engine's 2D viewer and the career screens load when needed). Target in Budgets.
   - **3D:** the owner's phone numbers decide how much work goes here. A long session check (office to match and back ten times) for memory growth.
   - **Long careers:** save size, save and load time, and week-advance time after 10 seasons, with trimming where something grows.
   - Performance budgets are not weakened without the owner's OK.
5. **7.5 Safety net and finish.**
   - **Crash screen:** if something breaks, the game shows a calm screen with "Copy save code" and "Reload" instead of a blank page. The save is never lost to a crash.
   - **Contact:** a "Report a problem or send feedback" screen (settings, the crash screen and the Credits screen). It copies a short report (game version, device, season and week, ) and opens the contact form on the studio website, https://jxstrr0.github.io/Kelbo.Website/#contact-heading, which already sends through Web3Forms to the studio email (the owner's answer, 2026-10-18). The game sends nothing itself. The website's message box takes 5,000 characters and a save code is 100,000 or more, so the report never carries the save; the screen says how to download it as a file instead (changed while building, see 7.5 notes).
   - **Install as an app:** yes (the owner's answer). "Add to Home Screen" gives the Longlight icon and full-screen play, and the game works offline after the first visit. When an update is ready the game says so and offers "Reload".
   - **Text and screens:** a read-through of every player-facing line for typos, tone and consistency; empty states ("No offers yet"); a check of every screen at the smallest phone size.
   - **Version number** shown in settings, with a short "What's new".
6. **7.6 Credits and title screen.**
   - An in-game Credits screen built from the same list as `CREDITS.md` (assets, sources, licences, libraries), with Longlight Interactive at the top.
   - **Branding** (the owner's logo and colours): the Longlight mark is a copper half-sun resting on a bar, on purple (or on near-black with a purple bar). Colours sampled from the owner's pictures: Longlight purple `#6F45B8`, deep purple `#583696`, copper sun `#C2826A`, ink `#1C1820`, warm paper `#E1DED7`, white. Wide, spaced capitals for headings.
   - A title screen: the Longlight mark and "presents", then the Season Ticket name over a slow camera move around your stadium at dusk (the plain-menu version uses a still picture in the same colours). The app icon and link preview (the picture and text shown when the link is shared in a chat app) use the mark.
   - A test that every file in `public/assets` is listed in `CREDITS.md`.
7. **7.7 Launch audit.**
   - The large audit and fix round: several reviewers across the sim, the saves, the UI, the 3D scenes and the deploy, each finding checked before it is fixed.
   - A scripted browser run that plays two seasons on a phone-sized screen through the real UI with no console errors.
   - Fixes, final numbers, and a launch checklist for the owner to tick off on their phone.

## Tests (how "done when" is checked)

- **New player:** a scripted browser run from career start to the end of the first match sees each first-time tip once, never twice, and sees them again after "Reset tips".
- **Long careers:** the 10-season careers in 7.3 run in the slow suite and check the targets agreed in question 3.
- **No dead ends:** the two-season browser run in 7.7 finishes with no console errors, and every screen it visits fits a 740 by 360 screen.
- **Crash safety:** a test forces an error mid-week and checks that the save is intact and the crash screen offers the save code.
- **Credits:** every shipped asset file is in `CREDITS.md`, and the in-game Credits screen shows every entry.
- The existing believability, story, save and performance tests stay green.

## Budgets

- **First load:** title screen showing in under 3 seconds on a mid-range phone on 4G, with at most 200 KB of compressed script before it (4.1 KB since 7.4).
- **Audio:** new sounds under 1.5 MB in all, loaded per scene.
- **Frame rate:** unchanged: 30 fps at Medium on the 3D match, 60 fps aimed for at Low.
- **Saves:** a 10-season save loads in under 1 second and its save code stays under the current limit.
- **Site size:** stays well under 1 GB (about 10 MB today).

## Build notes

### 7.1 First-time tips and Help (built 2026-10-18)

**Tips.** 21 tips in `src/data/help/tips.json`: club pick and branding, a welcome, the office, a visitor's card, a press conference, each of the nine hub tabs (Squad to League), deadline day, match day, the 2D pitch and the 3D view, replays and the season review. A tip is a small card at the bottom-left corner with **Got it** and **No more tips**; it never blocks the screen. Each shows once per device: it counts as seen when you tap Got it or move to a screen where it no longer applies. The welcome is the exception: it follows you round the hub until you tap Got it, so a new owner doesn't miss it. On a screen with a visitor or press card, the card's tip comes before the screen's. Tips wait while the menu is open or a week is playing. A tap that lands within half a second of closing a tip is ignored, so a double tap on Got it never presses the button underneath.

**Settings.** The menu has a **Tips** section: "Show first-time tips" on or off, and **Show tips again**, which clears the record. The record is kept in the browser (`seasonticket.tips`), not in the save, because tips belong to the person on the phone, not the career.

**Help.** A Help screen with 29 short answers in six groups (getting started, money and the lenders, players and transfers, match day, the club and the story, phone and settings), from `src/data/help/help.json`. Numbers in the answers (the wage cap, tax rates, the lenders' deadline, squad limits, the homegrown minimum) are filled from the tuning files, so they stay right after the balance pass. Tap a question to open it. It is reachable from the menu (Help, at the top) and from the title screen (How to play), and works the same with Graphics Off.

**Tests.** `tests/tips.test.ts` (13 tests): every tip and hub tab is covered, the order of tips on a screen, once-only and reset, the stored record survives garbled storage, and every help answer is filled with no `{name}` left over and no "click" or "hover". Checked in the browser at 740 by 360 (plain menus) and 844 by 390 (3D office and match): every tip showed once, a second visit showed none, reset and No more tips worked, no console errors.

### 7.2 Audio pass (built 2026-10-18)

**A bug fixed first.** The match-day sounds from Stage 5.5 were asked for at the wrong address (`audio/...` instead of `assets/audio/...`), so on the live site the crowd, whistles and kicks never loaded. They now do, and a test checks that every sound file the game asks for exists.

**One sound system.** Everything now plays through one shared audio context (`src/render/audio/hub.ts`), because phones allow only a few and only start one inside a tap. It has three volume buses, crowd, effects and music, and a mute. It runs while a scene needs it (the match, the office) and for three seconds after a one-off sound, and sleeps otherwise, so quiet menus cost no battery.

**Settings.** The old Off/Low/Medium/High match sound is replaced by **Sound on** plus three sliders in the menu: **Crowd** (the match crowd and the office), **Effects** (whistle, ball, taps, knocks, the phone) and **Music** (the office radio). They are heard as you drag and kept per device (`seasonticket.audio`). A player who had the old setting keeps it: Off becomes muted, and Low/Medium/High set the crowd and effects sliders. The live match's **Sound** button now mutes and unmutes everything.

**The office.** Soft room air (made in code, a six-second loop) whenever the office is on screen. On a home match week the match crowd drifts in through the window, muffled.

**The radio.** A cream radio on the credenza under the TV, labelled **Radio**. Tap it to switch it on or off (also a switch in the menu); its dial glows while it plays and it remembers your choice (`seasonticket.radio`). It starts off. It plays three CC0 songs from OpenGameArt in turn (76, 66 and 97 seconds, each cut on a whole phrase and faded out) through a small-speaker filter. The songs only download when the radio is first switched on, and it only plays while the office is on screen. If sound is muted, switching the radio on says so.

**Menu sounds.** Made in code, so they cost no download (`src/render/audio/synth.ts`): a soft wooden tap on every button, two knocks when a visitor arrives, a desk phone ringing for a new offer or deadline-day call, a page turning when the News tab opens, a few camera shutters when the press conference opens, and a wall clock ticking in the war room. They play on the effects slider. While a week is playing they wait, so the week's offers ring once at the end, not in a rush.

**Match day.** Between the big moments the home end sings, every 30 to 70 seconds of play while the crowd isn't already roaring, and now and then (three in ten) the away end answers from across the ground, quieter and muffled. A fuller ground sings louder. At a derby the crowd is a quarter louder and sings more often; against a rival, a little louder. The same match always sings at the same moments, so a replay sounds like the live match. The chants are cut from the same CC0 stadium recordings as the crowd, from stretches with no words.

**Size.** New sound files: 1.24 MB in all (three songs 0.94 MB, three chants 0.26 MB), under the 1.5 MB budget, loaded only by the scene that uses them. All the game's sound together is 2.36 MB.

**Tests.** `tests/audio.test.ts` (14 tests): the made sounds are finite, never clip and are the same every time, and the room tone loops without a click; every sound file exists; the referee and ball are on the effects bus; chant timing, the away share, the derby boost and loudness by crowd; the mix is kept, carried over from the old setting, mended when garbled and survives blocked storage; the menu cues for visitors, offers, calls, the paper and the press. Checked in the browser at 740 by 360 and 844 by 390: the radio shows and plays, the sliders and mute work and are kept, the menu sounds play, no console errors.

### 7.3 Balance pass (built 2026-10-18)

**How it was measured.** A headless career bench (`tests/bench/careerBench.ts`) plays ten-season careers with a scripted owner who lets the staff answer every visitor: a **careful** owner (keeps a cash buffer, sells to buy, borrows little), a **reckless** one (spends every pound and every loan on wages and fees, and pours in the fortune) and a **do-nothing** one (never touches anything). Each was played at all 13 Easy, Normal and Hard clubs on three seeds, 117 careers a round, on the quick Stage 1 engine (the targets are about money; a spatial-engine career is many times slower and was spot-checked by hand). Before the pass the lenders were toothless: on Normal no reckless owner lost the club before season 7, and on Hard none before season 5.

**Losing the club, before and after** (careers lost, out of the careers played):

| | Before | After | Target |
|---|---|---|---|
| Easy, careful | 0 of 8 | 0 of 12 | never |
| Easy, reckless | 5 of 8, seasons 7 to 10 | 4 of 12, seasons 4 to 8 | only reckless, never within 3 seasons |
| Easy, do-nothing | 0 of 8 | 0 of 12 | never |
| Normal, careful | 0 of 8 | 0 of 12 | never |
| Normal, reckless | none within 5 | 6 of 12 within 5 | about half within 5 |
| Normal, do-nothing | 0 of 8 | 0 of 12 | never |
| Hard, careful | 0 of 10 | 2 of 15 (seasons 8, 9) | some don't survive |
| Hard, reckless | none within 3 | 12 of 15 within 3 | within 2 or 3 seasons |

**The lenders, harder.** The ladder works as in section 8 of `DESIGN.md`, with these changes:
- The deadline is now per difficulty: 6 weeks on Easy, 5 on Normal, 4 on Hard and Very hard.
- A week or two back in the black no longer stops the clock: the deadline lifts after 4 clean weeks in a row, and slipping back into breach after it has passed climbs a rung at once. Stepping down a rung takes 10 clean weeks (was 8).
- From the lender-appointed finance chief (step 2) up, nobody lends, so a club in trouble can't borrow its way back into the spending that caused it.
- Forced sales: the lenders now take the whole fee against the dearest loans, so a sale pays debt rather than buying the club out of trouble.
- Forced sales happen only once. Back at that step within 2 seasons (Easy, Normal) or 3 (Hard, Very hard) and the club goes straight into receivership. The lender letter and Help say so. Saves move to version 11 (the ladder remembers the season of the rescue).

**Money.** Running costs now grow with the club's market as well as its seats (0.5M + 0.8M per unit of market size + 15 per seat, was 0.9M + 15 per seat), so a small-town club is cheaper to run than a big-city one. Crowd demand can grow to 1.8 times the club's starting capacity (was 3), and it grows only once fan mood is above 0.62 (was 0.55), so a bigger stadium has to be earned.

**Fans and press.** Results move fan mood a little more (a win +0.03, a loss -0.03), and it settles faster. At each season end every club's baseline fan mood moves with where it finished and with how that compared to its squad's strength, then eases back a fifth of the way to the club's own starting level. The press standing now drifts toward a point set by the table (higher near the top, lower near the bottom), and an answer at a press conference moves it half as much as before, so a run of calm answers can't lift it above where results put it. Staff answering for the owner do a little less good than before.

**Youth and AI squads.** Academy intakes are better at the low levels (quality 0.32 to 0.56 by level, was 0.2 to 0.6) with a bigger potential bonus (6, was 4): a typical intake is now about 37 overall with 60 potential (was 31 and 52). AI clubs keep players to 34 (was 32), and any AI club with room signs a free agent who would walk into its eleven, so good players don't sit unsigned.

**A crash fixed.** A squad with fewer than 11 fit players (an injury crisis plus suspensions) could not field a side and stopped the week. Now the user's club and every AI club are topped up from free agents on one-year deals at their market wage whenever they have fewer than 13 fit players or no fit keeper. A test injures a squad down to nine and plays on.

**Clubs swapped.** Silverpeak Alpine moved to Hard and Racing Val-Delacroix to Normal. Silverpeak's staff bill (1.33M) is bigger than its ticket money (1.07M), so careful owners bled their fortune and do-nothing owners lost the club, which Normal must not do; Racing plays like a Normal club.

**The league over ten years.** The strongest squad wins the table about a third of the time and one of the four strongest about 75% of the time. The league's average best eleven goes from 64.9 to 70.7 over ten seasons (was 65.2 to 68.8), mostly the better youth. The average age drifts from 26.5 to 24.2 (was 26.6 to 23.8), which is young for a real league: flagged for the 7.7 audit.

**Match engine.** Four more full fine-mode seasons (the watched match): 2.52 goals a match (2.40 to 2.71 by season), 2.72 expected goals, 1.2% of matches with 7 or more goals, home wins 43%, draws 23%, 11.8 shots a team. This is inside every target, so the "watched match is more open" gap is settled and the engine is unchanged. The AI head coaches make all five subs in nearly every match, all between minutes 46 and 90 (half of them by minute 62, nine in ten by minute 80), and change mentality about 2.8 times a match, about half of those after minute 76.

**Story.** 66 of the 76 events turned up in the balance careers. The other ten only follow an owner's choice (a follow-up, or a flag such as "the council is annoyed"), which the scripted owners never make. A new test walks the event data and proves every event can be reached.

**Easy riches.** A do-nothing owner at an Easy club ends ten seasons with about 69M in the bank while finishing bottom, because the wage bill shrinks to almost nothing. Harmless (nobody plays that way), so left as it is.

**Tests.** `tests/storyReach.test.ts` (every event reachable) and an emergency-signing test in `tests/career.test.ts` run with `npm test`. The slow suite (`npm run test:slow`) has four new files: `careers-easy`, `careers-normal` and `careers-hard` check the targets above on fewer seeds, and `careers-league` checks the league over ten seasons (no more than 7 points stronger, average age 23 to 28, youth intake in its band, strong squads winning, happier fans in good seasons, crowds not always full).

### 7.4 Performance pass (built 2026-10-19)

**First load.** The title screen now comes from a tiny starter script (4.1 KB compressed, was 344 KB before the title). The rest of the game downloads behind it. A tap made while it is still loading is remembered and carried out once the game is ready, and the button says "Loading…" meanwhile. The Continue card reads a small summary stored next to the save, so it shows straight away. three.js only loads when a 3D scene opens. A check in the deploy (`npm run check:first-load`) fails the build if the starter script grows past 200 KB.

**A bug fixed on the way.** A guard against double taps ignored every tap in the first half second after the page opened.

**Saves after ten seasons.** On the quick engine the save code is about 106 KB at the start of each season and 208 KB at the end of season 10. Only the history grows (about 220 bytes a season), so nothing needs trimming. With real match replays for season 10, the code is 286 KB (the limit is 400 KB) and it loads in 34 ms (budget 1 second).

**Week time.** Playing a week's matches on the real engine in one thread takes 1.1 seconds (median; 1.5 s at most). It does not grow over the seasons, and the game spreads the matches over two background workers.

**Long session.** Ten trips from the office to a 3D match and back, with memory measured in the office after each. Memory goes up 30 MB on the first trip, because the 3D match scene is built once and kept for next time. After that it adds only 2.2 MB over nine more trips (110.2 to 112.4 MB), mostly the longer match log. Geometries (59), textures (37), shader programs (17), page elements and event listeners stay flat. No console errors.

### 7.5 Safety net and finish (built 2026-10-19)

**Crash screen.** If the game hits an error it cannot get past, a calm screen shows "Something went wrong" with Reload, Copy save code and Report the problem, instead of a blank or frozen page. The game saves after every action, so the stored save is from just before the problem; once the crash screen is up nothing saves again, because the career in memory may be half way through the action that broke. Reload carries on from the stored save. Browser noise (other sites' scripts, blocked sounds, a cancelled full screen) is ignored. The start-up script installs this before the rest of the game downloads.

**Report a problem.** From the title screen, the menu and the crash screen. Copy report gives a short text (version and build, device and screen size, club and week, the error if there was one) to paste into the contact form on the studio website, which opens in a new tab. The game sends nothing itself.

**Changed from the plan: no "Include my save".** A save code is 100,000 characters or more and the form takes 5,000, so it could never fit. The screen says to use Menu → Save code → Download .txt if we ask to see a save.

**Version and What's new.** Version 0.9.0, shown on the title screen, in the menu and in reports. "What's new" lists the changes; the list lives in `src/data/meta/version.json`.

**Install as an app.** A manifest, the Longlight icon (copper half-sun on a bar, on purple) and the iPhone home-screen tags. "Add to Home Screen" opens the game full screen and landscape. A service worker, written at build time, stores the game's code, page and icons on the first visit, so the game opens and plays offline. Models, textures and sounds come from the network when there is one and are kept for when there is none. A new version waits until the player taps Reload on a small "A new version is ready" banner, so a match in progress is never cut off; the game checks for updates each time it comes back on screen. Checked in a browser: installed, reloaded offline to a working title screen and club picker, then a rebuild showed the banner and Reload switched to the new version with no errors.

**Text and screens.** Every screen checked at 640 × 360 and 667 × 375 (title, Help, Report a problem, What's new, club pick, branding, every tab, the menu, a played week, the league after a round, match day): nothing wider than the screen and every button at least 44 px. A read-through of the player-facing text found one slip ("Seeds 1 to 2"), now "Seeds 1 and 2". Empty states (no mail, no newspaper yet, no results, no appearances) all say what will fill them.

**Still to come: analytics.** GoatCounter waits on the owner's site code.

## Owner's answers (2026-10-18)

1. Tutorial: first-time tips on each screen and a Help page. No guided week.
2. Music: office only.
3. Losing the club: the proposal below is fine for now.
4. Install as an app: yes.
5. Problem reports: Web3Forms, through the contact form already on the studio website; the game sends players there.
6. Branding: use the Longlight logo and colours (see 7.6).
7. Analytics: GoatCounter (follow-up B), answered 2026-10-18. The owner will send the site code.
8. Launch extras: none.

## Open follow-ups

- **A. Where the contact form sends.** Settled: the studio website's contact form (Web3Forms).
- **B. Where analytics go.** Settled: GoatCounter, as proposed; waiting on the owner's site code, so it is built last in 7.5. The proposal was: GoatCounter (free for small, non-commercial sites, open source, no cookies, so no consent banner). It counts page visits, plus a few game moments with no personal data: career started, season finished, club lost. Settings get a "Send anonymous play counts" switch, on by default, and the Credits screen says what is sent. Alternatives: Cloudflare Web Analytics (free, visits only), or none.

## Questions for the owner (as asked)

1. **Tutorial style.** Proposal: a guided first week told by your assistant coach (small cards pointing at one thing at a time, skippable, replayable), plus first-time tips on each screen and a Help screen. The alternatives are tips only, with no guided week, or a separate practice career.
2. **Music.** Proposal: a radio on the office shelf that plays a few CC0 tracks when tapped, off at first, and no music on match day (the crowd is the soundtrack). The alternatives are a title-screen theme, or no music at all.
3. **How hard should it be to lose the club?** Proposal: on Easy, only a reckless owner loses the club, and only after three or more seasons; on Normal, about half of reckless owners lose it within five seasons and careful owners never do; on Hard, careful owners can survive but some don't, and reckless owners lose it within two or three seasons. The do-nothing owner survives on Easy and Normal.
4. **Install as an app.** Proposal: yes. "Add to Home Screen" gives an app icon and full-screen play, and the game works offline after the first visit. The downside is that people sometimes see the old version for one extra visit after an update; the game will say when an update is ready.
5. **Where should problem reports go?** The game can copy a report (version, device, save code) for the player to paste. Where should they paste it: GitHub issues on this repo, an email address of the studio's, a Discord or other community, or nowhere for now (a copy button only)?
6. **Title screen and branding.** Do you have a Longlight Interactive logo or colours you want used? Proposal: a simple text logo, the Season Ticket name over a slow camera move around your stadium at dusk (the plain-menu version uses a still picture).
7. **Analytics.** Proposal: none. The game sends nothing anywhere, and the credits screen says so. If you want to know how many people play, a privacy-friendly page counter is the only option we'd suggest, and it would be your call.
8. **Launch extras.** Is anything missing that you want before sharing it publicly (a second save slot, a "new game plus" with a richer owner, a share-your-season card)? Proposal: none of these for launch; list them as ideas for after.
