# Stage 7: Polish and Launch (plan)

**Status:** plan written 2026-10-18, waiting for the owner's answers to the questions at the end. Nothing in this plan is built yet.

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

1. **7.1 First season guide (tutorial).**
   - A short guided first week for new careers, told by the assistant coach (see question 1): the office, the phone, the laptop, the TV, the inbox; setting the line-up; ticket price; playing the first match.
   - It is a run of small cards pointing at one thing at a time. It can be skipped at any step and replayed from settings.
   - First-time tips: the first time you open a screen (transfers, contracts, the stadium, finances, deadline day, a press conference), one card explains it in two or three lines.
   - A **Help** screen: short plain-language answers ("How do I lose the club?", "What is the wage cap?", "What does mentality do?"), reachable from settings and the plain menus.
   - It works the same with graphics Off.
2. **7.2 Audio pass.**
   - The office: a soft room tone, and match-day crowd noise drifting in through the window.
   - Taps and feedback: a soft tap on buttons, a knock when a visitor arrives, a phone ring for offers and deadline-day calls, a page turn for the newspaper, camera clicks at a press conference, a clock tick in the war room.
   - Match day: home and away chants and a louder crowd at derbies.
   - Music: see question 2.
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
   - **Report a problem:** copies the game version, the device and the save code, ready to paste wherever the owner wants reports to go (question 5).
   - **Install as an app:** see question 4.
   - **Text and screens:** a read-through of every player-facing line for typos, tone and consistency; empty states ("No offers yet"); a check of every screen at the smallest phone size.
   - **Version number** shown in settings, with a short "What's new".
6. **7.6 Credits and title screen.**
   - An in-game Credits screen built from the same list as `CREDITS.md` (assets, sources, licences, libraries), with Longlight Interactive at the top.
   - A title screen and a link preview (the picture and text that appear when the link is shared in a chat app). See question 6.
   - A test that every file in `public/assets` is listed in `CREDITS.md`.
7. **7.7 Launch audit.**
   - The large audit and fix round: several reviewers across the sim, the saves, the UI, the 3D scenes and the deploy, each finding checked before it is fixed.
   - A scripted browser run that plays two seasons on a phone-sized screen through the real UI with no console errors.
   - Fixes, final numbers, and a launch checklist for the owner to tick off on their phone.

## Tests (how "done when" is checked)

- **New player:** a scripted browser run follows the guide from career start to the end of the first match, and the guide can be skipped and replayed.
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

## Questions for the owner

1. **Tutorial style.** Proposal: a guided first week told by your assistant coach (small cards pointing at one thing at a time, skippable, replayable), plus first-time tips on each screen and a Help screen. The alternatives are tips only, with no guided week, or a separate practice career.
2. **Music.** Proposal: a radio on the office shelf that plays a few CC0 tracks when tapped, off at first, and no music on match day (the crowd is the soundtrack). The alternatives are a title-screen theme, or no music at all.
3. **How hard should it be to lose the club?** Proposal: on Easy, only a reckless owner loses the club, and only after three or more seasons; on Normal, about half of reckless owners lose it within five seasons and careful owners never do; on Hard, careful owners can survive but some don't, and reckless owners lose it within two or three seasons. The do-nothing owner survives on Easy and Normal.
4. **Install as an app.** Proposal: yes. "Add to Home Screen" gives an app icon and full-screen play, and the game works offline after the first visit. The downside is that people sometimes see the old version for one extra visit after an update; the game will say when an update is ready.
5. **Where should problem reports go?** The game can copy a report (version, device, save code) for the player to paste. Where should they paste it: GitHub issues on this repo, an email address of the studio's, a Discord or other community, or nowhere for now (a copy button only)?
6. **Title screen and branding.** Do you have a Longlight Interactive logo or colours you want used? Proposal: a simple text logo, the Season Ticket name over a slow camera move around your stadium at dusk (the plain-menu version uses a still picture).
7. **Analytics.** Proposal: none. The game sends nothing anywhere, and the credits screen says so. If you want to know how many people play, a privacy-friendly page counter is the only option we'd suggest, and it would be your call.
8. **Launch extras.** Is anything missing that you want before sharing it publicly (a second save slot, a "new game plus" with a richer owner, a share-your-season card)? Proposal: none of these for launch; list them as ideas for after.
