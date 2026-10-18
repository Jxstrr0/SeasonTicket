# Stage 7: Polish and Launch (plan)

**Status:** plan written 2026-10-18. The owner answered the questions the same day (see "Owner's answers" at the end), and chose GoatCounter for analytics (the site code is to come). 7.1 is built (see "Build notes").

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
   - **Contact:** a "Report a problem or send feedback" screen (settings, the crash screen and the Credits screen). It copies a short report (game version, device, season and week, and the save code if the player ticks "Include my save") and opens the contact form on the studio website, https://jxstrr0.github.io/Kelbo.Website/#contact-heading, which already sends through Web3Forms to the studio email (the owner's answer, 2026-10-18). The game sends nothing itself. The website's message box takes 5,000 characters, so a save code that is longer is left out of the copied text and the screen says "Your save is too long to paste; describe the problem instead".
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

- **First load:** title screen showing in under 3 seconds on a mid-range phone on 4G, with at most 200 KB of compressed script before it (325 KB today).
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
