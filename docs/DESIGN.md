# Season Ticket: Design Doc

**Studio:** Longlight Interactive
**Genre:** Soccer club owner/GM management sim with a live, changeable-tactics match engine. Think of a club-ownership game in the spirit of F1 Manager 24, where the business and the football are one system.
**Status:** Stage 0 complete (design locked after the soccer pivot on 2026-10-16). Concept test first; a wider "universe" may follow if the concept holds up.

---

## 1. Vision

You own a professional soccer club in the fictional nation of Valmere. You run the business, build the squad, upgrade the stadium and set the tactics, then watch every decision play out in a living 3D world.

### Pillars
1. **Your world, not a spreadsheet.** Decisions happen in a 3D office, show up in a 3D stadium and play out in 3D matches. Menus exist, but the world is the interface.
2. **Everything you buy, you can see.** Stadium upgrades, branding, crowd size and office growth are visible.
3. **Business and football are one system.** Winning sells tickets, tickets pay for players, overspending brings lenders to your door. Selling a star for a fee is a business decision you feel on the pitch.
4. **Tactics you can change at any moment.** You never steer players directly. You set the shape, the mentality and the instructions, and you can change them whenever the match demands it.

---

## 2. Player role

- **Owner + sporting director.** You control the business (tickets, sponsors, stadium, staff, finances) and the squad (transfers, loans, free agents, youth academy, contracts, lineup and tactics).
- You hire a **head coach** and assistants. They matter whenever you delegate: the head coach picks the lineup and manages the match when you let them.

---

## 3. The world: Valmere

- **Valmere** is an invented northern, temperate republic with sea coasts, lakes, mountains and plains. It has no real-world counterpart. Its people are **Valmerans**. Currency: the Valmeran dollar ($).
- Two cultural strands show up in names and places: an English-flavoured majority and a French-flavoured minority in the Rivière Valley. Everything is fictional.
- **Regions** (used for rivalries, weather and travel flavour):
  - **Capital District:** Crowncaster.
  - **Eastern Shore:** Port Alder, Cape Fenwick, Saltwater Cove.
  - **Rivière Valley:** Sainte-Rivière, Val-Delacroix.
  - **Lakelands:** Lakehaven, Wrenmoor, Inkwater.
  - **Iron Belt:** Cindervale, Fort Sterling.
  - **Highlands:** Silverpeak, Frostbeck, Lumenfell.
  - **Western Plains:** Prairie Junction, Sunreach.
- **Foreign players** come from other fictional nations (Esperia, Kaltland, Marrovia, Sundara, Ostenburg, Caravelle, Vostria, Norrvik). These exist only as nationalities and name flavours for now.

### Season calendar
Spring to late autumn. Pre-season in February and March, league play from April, playoffs in November. Weather follows: spring rain, summer heat, autumn wind, snow for the playoff rounds.

---

## 4. League

- **The Kestrel Football League (KFL):** named for Valmere's national bird. 16 fictional clubs in **one table**.
- Each club has a **market size**, **stadium condition**, **finances**, **fan mood**, and **squad/staff quality**. Together these set difficulty.

### Clubs

| Club | Nickname | City | Region |
| --- | --- | --- | --- |
| Crowncaster City FC | the Monarchs | Crowncaster | Capital District |
| Port Alder Athletic | the Mariners | Port Alder | Eastern Shore |
| Cape Fenwick United | the Gulls | Cape Fenwick | Eastern Shore |
| Saltwater Cove FC | the Orcas | Saltwater Cove | Eastern Shore |
| Olympique Sainte-Rivière | les Voyageurs | Sainte-Rivière | Rivière Valley |
| Racing Val-Delacroix | les Rouges | Val-Delacroix | Rivière Valley |
| Lakehaven United | the Loons | Lakehaven | Lakelands |
| Wrenmoor Wanderers | the Wranglers | Wrenmoor | Lakelands |
| Inkwater Rovers | the Wolves | Inkwater | Lakelands |
| Cindervale Ironworks FC | the Ironsides | Cindervale | Iron Belt |
| Fort Sterling FC | the Sentinels | Fort Sterling | Iron Belt |
| Silverpeak Alpine | the Yeti | Silverpeak | Highlands |
| Frostbeck Town | the Huskies | Frostbeck | Highlands |
| Lumenfell FC | the Aurora | Lumenfell | Highlands |
| Prairie Junction FC | the Threshers | Prairie Junction | Western Plains |
| Sunreach SC | the Grizzlies | Sunreach | Western Plains |

### Career start
- Pick from clubs at different difficulty levels. Difficulty comes from what's under the hood (squad, staff, money, debt, stadium, market, fans), never from branding.
- **Full branding customization on any club:** club name, city name, colours, an in-game crest builder (shape, icon, colours), a kit designer (home, away, third), stadium name and pitch design.
- Branding flows into the 3D world: kits, pitch-side boards, video board, stadium colours, office décor.

---

## 5. Rules (the sim's spec)

- 11 a side; standard pitch (105 m × 68 m).
- 90 minutes in two halves plus stoppage time (1 to 6 minutes per half).
- **Five substitutions** per team from a bench of nine, made at any stoppage. The five include extra time; there is no extra substitute in extra time.
- Yellow and red cards. Two yellows in a match is a red. A red card means playing a player short. Red: one-match suspension. Five accumulated yellows in a season: one-match suspension.
- Offside, fouls, free kicks, penalties and corners exist as match events.
- Injuries happen in matches and training, with weeks out.
- **Fatigue** drains over a match (faster with high pressing and tempo) and recovers between matches.
- Points: 3 for a win, 1 for a draw. Tiebreakers: goal difference, goals for, head-to-head points, then a seeded coin flip.
- **Playoffs:** extra time (two 15-minute halves) then a penalty shootout: five kicks each, then sudden death. Only players on the pitch at the end of extra time take kicks, so a sent-off player never does, and nobody kicks twice until every eligible team-mate has.
- The league season: every club plays every other club home and away (**30 matches**).

---

## 6. Season structure

- **Pre-season:** training camp, friendlies (2, not simulated in the concept test), the **pre-season transfer window** closes the week before round 1.
- **Regular season:** 30 rounds, one per week, with a two-week **mid-season break** after round 15. The **mid-season transfer window** is open during the break and the week after it (3 weeks).
- **Playoffs:** top 6 of the table. Seeds 1 and 2 skip the quarter-finals. Quarter-finals: 3 v 6 and 4 v 5. Semi-finals: seed 1 plays the lowest remaining seed, seed 2 plays the other. **Championship Final** for the Founders' Cup. The higher seed hosts every playoff match, including the final.
- The table winner lifts **the Valmere Shield**; the playoff winner lifts **the Founders' Cup**. Both count as titles.
- **Offseason:** awards, contract renewals, retirements, youth academy intake, free agency, the opening of the pre-season transfer window, training camp, and stadium construction.

---

## 7. Squad and football operations

- **Squad:** up to 28 senior players (minimum 20). A matchday squad is 11 starters and 9 on the bench.
- **Positions:** GK, CB, FB (full-back), DM, CM, AM, W (winger), ST. Players have a main position and can play nearby positions at a penalty.
- **Wage cap:** a soft cap on total wages with a **luxury tax**. Every dollar of wages over the cap is taxed, with higher rates for repeat offenders. The tax pool is shared among clubs under the cap.
- **Transfers:** buy and sell players for fees in the two windows. AI clubs value players by ability, age, contract length and form. Fees are paid from cash (instalments can come later). Players have squad roles and happiness that affect whether they'll move.
- **Loans:** take or send players out for a season or half-season, with a wage split.
- **Free agents:** out-of-contract players, signable outside the playoff weeks.
- **Youth academy:** a yearly intake of 3 to 5 youth players (ages 16 to 19) with potential. Academy level is an upgradeable facility.
- **Homegrown rule:** chosen when starting a career. On: at least **6 Valmeran players** in every starting eleven. Off: pure talent. Every player has a nationality regardless.
- **Contracts, lineup, tactics and set-piece takers** managed by you (or delegated).
- **Staff:** head coach, assistant coach, fitness coach, head scout, academy director. Staff quality affects player development, scouting accuracy and delegated match management.

---

## 8. Business and finances

### Revenue
Tickets (pricing by section), concessions, parking, sponsorships and naming rights, merchandise, the league TV share, luxury-tax shares, player sales and loan fees, playoff gate money.

### Money sources
1. **Club revenue.**
2. **Owner's personal fortune.** A finite amount set by the difficulty tier, so cash injections cannot be unlimited. Cash injected into the club is permanent.
3. **Loans.** Fast money with interest and conditions (for example, a minimum cash balance or a wage ceiling).

### The lender ladder (the fail state)
Breaking loan conditions escalates step by step. Every step can be reversed by fixing the finances.
1. **Warning letter.** A lender visit in your office, with a deadline.
2. **Lender-appointed CFO.** Big spending now needs their approval.
3. **Spending lock.** No contracts above minimum, no transfer fees and no stadium projects.
4. **Forced sales.** You must sell naming rights, a minority stake or star players.
5. **Receivership.** The lender takes the club; the career ends.

---

## 9. Match day and tactics

- **Full tactical control is the default.** Before kickoff you set the formation, the starting eleven, the mentality and the team instructions. During the match you can change any of them and make substitutions at any time. The sim resolves the play and the 3D view shows it. You never steer players directly.
- **Tactical levers:** formation (4-4-2, 4-3-3, 4-2-3-1, 3-5-2, 5-3-2, 4-1-4-1, 3-4-3), mentality (five steps from very defensive to very attacking), pressing intensity, defensive line height, width, tempo, passing directness, counter-attack on/off, time-wasting, set-piece takers, man-marking a danger player.
- **Optional "game plan + big calls" mode.** Set the plan before kickoff, then make only the key decisions when the head coach asks: chasing a goal late, protecting a lead, a sub after an injury or red card, a penalty taker.
- **Pacing tools:** hand control to the head coach at any time; choose viewing speed (extended highlights, key moments, instant result).
- **Spatial match engine (Stage 4.5).** The sim plays the whole 90 minutes with all 22 players and the ball on the pitch, so tactics, fatigue, chances, goals, cards and subs come out of real positions. You still watch at the speed you choose (extended highlights, key moments, instant result), with a live match feed, and every highlight is a replay of the simulated positions. Until Stage 4.5 is finished, the Stage 1 engine still rolls one outcome a minute. The design is in section 17.
- **Tactics overlay:** shape, pressing zones, expected goals and win probability, toggleable during the match.
- **Match day audio:** crowd and stadium sound, with text commentary.

---

## 10. The world you see

### HQ Office (3D)
- The desk is the menu: phone (calls and offers), laptop (finances), TV (league news and highlights).
- A window looking out at the stadium, with construction visible.
- **Visitors walk in with events:** the head coach with a lineup problem, agents with offers, sponsor reps, reporters, city councillors, angry season-ticket holders, lenders.
- The office grows with the club (from a modest office to a tower suite) and the trophy cabinet fills.

### Stadium (3D, modular)
- Stands, boxes, roof, video board, concourses, pitch and pitch design, naming-rights signage, club colours.
- Every purchase appears physically, on match day and through the office window.
- Attendance drives crowd density.

**How a ground is built (Stage 4).** Every club owns a ground made of parts:
- **Four stands:** the Main Stand and East Stand on the sides, and the North End and South End behind the goals. Each goes up one level at a time: grass bank, small stand, single tier, two tiers, three tiers. An end holds 70% of a side stand's seats.
- **Four corners:** filled in once both neighbouring stands are big enough.
- **A roof per stand:** part roof, then full roof. Covered seats draw slightly bigger crowds.
- **Executive boxes:** up to two rows per stand. They earn hospitality money every home match.
- **Six club-wide upgrades:** floodlights, video board, LED advertising, concourses, club shop and pitch.
- **Refurbishment:** restores the ground's condition, which wears down every season.
- **Free, instant branding:**
  - Seat colours: club colours, mixed, or the club's initials picked out in the seats.
  - The mowing pattern, the roof colour and the crest on the pitch.
  - The stadium name, and the sponsors on the boards. Naming rights rename the ground and put the buyer's brand on the boards.

Building takes time:
- Each project takes weeks, and at most three run at once.
- A project bought during the season can start now or wait for the off-season (the winter break between seasons).
  - Starting now closes part of that stand until the work is done.
  - The off-season adds eight building weeks before pre-season.
- Each off-season an AI club refurbishes a tired ground, or adds seats if its crowds were near capacity (the stand or corner with the lowest cost per seat), or else adds a roof, when it can afford it.

Crowds:
- Demand grows with fan mood and trophies, so a bigger stand only fills if the fans are there.
- The 3D crowd follows the last home attendance.

The Stadium tab shows the ground in 3D:
- Swipe to turn, pinch to zoom, and tap a part to pick it.
- Buttons switch the camera between Aerial, Main Stand, Behind goal and Overhead, and the ground between day and night.
- Work in progress shows as scaffolding with cranes.
- A Plan view (the flat diagram) is one tap away, and is the fallback when 3D is off.

**Stadium catalogue and costs (proposed, waiting for the owner's confirmation).**
- Money is in Valmeran dollars. The values live in `src/data/tuning/stadium.json`.
- "Pays back" is a rough guide: the number of seasons the extra income takes to cover the cost.
  - Big club: Crowncaster City, 48,400 seats.
  - Small club: Prairie Junction, 13,600 seats.
  - New seats are assumed 90% full at the fair ticket price.

| Part | Cost per level | Weeks | What it does | Pays back (big / small) |
| --- | --- | --- | --- | --- |
| Side stand (Main, East) | 0.77M, 1.46M, 2.58M, 4.1M | 6, 8, 10, 12 | +2,000, +3,000, +4,000, +5,000 seats (2,000 to 16,000) | 2 to 5 / 4 to 8 seasons |
| End stand (North, South) | 0.61M, 1.17M, 2.08M, 3.32M | 6, 8, 10, 12 | 70% of the side stand's seats (1,400 to 11,200) | 2 to 5 / 4 to 8 seasons |
| Corner | 0.9M, 1.3M | 6, 8 | +1,500, then +1,700 seats. Needs both neighbours at single tier, then two tiers. | 4 to 5 / 6 to 8 seasons |
| Roof (per stand) | 70 per seat + 0.2M, then 110 per seat + 0.35M | 4, 6 | Covers the back rows, then every seat. Up to +5% crowd when the whole ground is covered. | Comfort and noise more than money |
| Boxes (per row) | 80k a box: 1.6M a side row (20 boxes), 0.96M an end row (12 boxes) | 5 | Hospitality money every home match, less 4k a season upkeep per box. Needs single tier, then two tiers for a second row. | 4 / 10 seasons |
| Floodlights | 0.9M, 1.5M, 2.4M | 3, 4, 5 | +250k TV money a season per level | 4, 6, 10 seasons (everywhere) |
| Video board | 0.7M, 1.5M, 2.2M | 2, 3, 4 | +6% sponsor money, happier fans and +1% crowd per level | 3, 7, 10 / 11, 23, 34 seasons |
| LED advertising | 0.6M, 1.4M | 2, 3 | +8% sponsor money per level | 3, 8 / 9, 21 seasons |
| Concourses | 0.8M, 1.7M, 3.2M | 4, 5, 6 | +$1 food and drink money per fan per level, and better condition | 1, 3, 5 / 5, 11, 21 seasons |
| Club shop | 0.5M, 1.1M | 3, 5 | +12% merchandise money per level | 4, 8 / 10, 21 seasons |
| Pitch | 0.4M, 1.1M, 2.0M | 2, 3, 3 | Drainage, hybrid grass, undersoil heating: +5 condition per level | Bigger crowds through condition |
| Refurbishment | 28 per seat (at least 0.25M) | 4 | +25 condition (condition wears 3 points a season) | Keeps crowds up |

In plain terms:
- Seats pay for themselves in 2 to 5 seasons at a big club and 4 to 8 at a small one, but only if demand fills them.
- Upgrades favour big clubs, because their effects scale with sponsor, merchandise and crowd money. A small club should build seats when it sells out and leave the video board for later.
- Building everything costs about 85M, for about 67,000 seats and 128 boxes. The biggest club makes about 5M profit a season at the start, so a full ground is a ten-season-plus project.
- Floodlights levels 2 and 3, video board level 3 and club shop level 2 were made cheaper so that no top level takes much more than ten seasons to pay back at a big club.

### Match Day (3D)
- Broadcast-style cameras and an owner's-box view.
- Weather and seasons (spring rain through to snowy playoffs).
- Sponsors on the boards and video board.

### Planned world extras
- A city view where your brand spreads as popularity grows (billboards, shirts, bars showing matches).
- Press room after matches.
- Transfer deadline day war room.
- Supporters' fan zone that fills before kickoff.
- Owner's box guests: VIPs you court for deals mid-match.
- Newspaper and social feed reacting to your decisions.

---

## 11. Art direction

- **Semi-realistic.** Realistic proportions, physically based materials, real lighting and atmosphere. A dusk night-match look is the reference mood.
- **Rigged, animated GLB player models** (one base model re-coloured per club) with a growing animation library: idle, jog, sprint, pass, shoot, tackle, header, save, celebrate.
- **Quality tiers from day one:** Low, Medium, High. Phone testing targets Medium; PC targets High.
- Level of detail for players and an instanced crowd.

---

## 12. Platform and tech

- Built in **Claude Code** on a **GitHub repo**, deployed to **GitHub Pages**.
- Phone-first testing, played on phone and PC, **landscape** layout, touch-first controls with mouse and keyboard support.
- **Saves:** stored in the browser, moved between devices with an **export/import save code**.

---

## 13. Release

Free web game for now. Possibly donations later. No ads or paid features planned.

---

## 14. Out of scope for the concept test

- The wider "universe" (other seats such as league commissioner or agent, lower divisions, promotion and relegation).
- A domestic cup competition and continental competitions.
- Online or multiplayer features.
- Voice commentary.
- Women's teams (a later ambition, not a concept-test feature).

---

## 15. Decisions log

Decided by the owner on 2026-10-16:
- The sport is soccer, with changeable tactics instead of play-calling.
- One table of 16 clubs plus playoffs (not conferences, not promotion/relegation).
- Transfer windows with fees and a soft wage cap with luxury tax (no draft).
- ~~Highlights match engine (not a continuous 90-minute simulation).~~ Reversed by the owner on 2026-10-16, see below.
- A fictional country with no real-world tie.

Reversed by the owner on 2026-10-16 (handoff from Stage 4 to Stage 4.5, kept in `docs/history/HANDOFF_STAGE_4_TO_4_5.md`):
- The "highlights engine, not a continuous 90-minute simulation" call is replaced by a **spatial engine**: 22 players and the ball have positions on a 105 m by 68 m pitch for the whole match, tactics set the team's shape, and each player decides from his attributes. You still watch highlights at the speed you choose; the difference is that every highlight is a replay of simulated positions. The owner's match and every background match run on the same engine (background matches in a faster, coarser mode). Spec: `docs/STAGE_4_5_SPATIAL_ENGINE.md`. Design: section 17.

Decided during development (the owner can veto any of these):
- The country is called **Valmere**; club names, nicknames and regions are as listed in section 4.
- Seven club names that matched real places were replaced on 2026-10-16: Crowncaster, Wrenmoor, Inkwater, Cindervale, Frostbeck, Lumenfell and Sunreach.
- Pre-season friendlies: 2, not simulated in the concept test.
- Playoff hosting: the higher seed hosts every round, including the final. A neutral, rotating final venue is a candidate business feature later.
- Homegrown minimum when the rule is on: 6 of the starting eleven.
- Matchday squad: 11 plus 9 on the bench, 5 substitutions.
- Squad limits: 20 to 28 senior players.
- Season weeks: 30 league rounds, a two-week break after round 15, three playoff weeks.

Sim simplifications (documented here as the build brief requires):
- Stoppage time is a base draw plus weights for goals, subs, cards, injuries and time-wasting, clamped to 1 to 6 minutes per half (0 to 2 per extra-time half). Wasted minutes are not added one for one.
- Substitution windows are not enforced as three strict stoppages; the sim allows a sub at any dead ball and caps the count at five, including extra time (many real competitions allow a sixth in extra time).
- In a shootout, a side with more players on the pitch does not reduce its kickers to match an opponent reduced by red cards.
- No VAR or offside-line nuance; offside is an event outcome, not a positional check.
- Transfer fees are paid in full from cash in the concept test.

Match engine simplifications (Stage 1). These belong to the per-minute engine that Stage 4.5 replaces. Each entry is deleted or rewritten as the spatial engine takes it over, and the spatial engine's own simplifications are listed in section 17.
- Possession belongs to one side per one-minute tick, and one move is resolved per tick. Passes are counted statistically, not as events.
- Offside is a chance set by the defending side's line height. Penalties are a fixed share of fouls with no box geometry. Free kicks are a direct shot or a cross with no distance model.
- No own goals, advantage rule, handball, dissent cards or cards for bench staff.
- Time-wasting only works when ahead from minute 70: it costs the opponent the minute and carries a small booking chance.
- Fatigue only goes down during a match, with no half-time recovery. An injured player with no subs left stays on at minimum energy.
- A sent-off player's slot stays empty, with a 10% strength penalty per missing player. A spare keeper replaces a sent-off keeper by taking an outfielder's place.
- Man-marking lowers the target's chance of shooting or creating (to 45%) and costs the marking side 2% midfield strength. No individual marker is assigned.
- Counter-attacks only start from turnovers. Their chance depends on the counter tactic, the opponent's defensive line, the pace difference and pressing.
- Shootout order is by set-piece and composure, with the keeper last. The first kicker is a coin flip.
- Home advantage is a shot-rate boost (46%) scaled by attendance, plus small possession and card-leniency edges.
- A side two or more goals up shoots 15% less per extra goal of lead (never below 60%).
- Weather only applies multipliers (passing, xG, accuracy, fatigue, injuries, shot rate).
- The AI coach sets its kickoff mentality from its own lean and the opponent's strength, chases late when behind, protects a lead from minute 78, eases off with a two-goal cushion from minute 60 and tightens after a red card.
- Match ratings are a linear formula over the player's stats.

Season simplifications (Stage 1):
- Tiebreakers: points, goal difference, goals for, then head-to-head points across the whole tied group (applied once), then a seeded coin flip. Before any match the table is ordered by the coin flip.
- Any red card is a one-match ban. Every fifth yellow of the season adds a one-match ban. Bans are served in the club's next match of any stage and carry over the break and into next season. A ban counts as served when the team plays.
- Injuries count down once per calendar week, break weeks included, starting the week after the injury. A new injury on an injured player keeps the longer duration.
- Condition: a player loses 0.12 per 90 minutes played and recovers half the gap to full each week. No training load, travel or fixture congestion.
- Form is the last five match ratings.
- Every playoff tie is a single match hosted by the higher seed, final included.
- The season summary (top scorers, goals per match, result split) counts league matches only.
- Each player has one fictional nationality. First and last names are picked independently. Clubs have a primary and a secondary colour only.
- In Stage 1 the AI coach runs both sides of every match. Pre-season, the offseason, transfer windows and season rollover (aging, contracts, development) arrive in Stage 2.

Career simplifications (Stage 2):
- Transfer and loan fees are paid in full on signing: no instalments, add-ons or sell-on clauses.
- Loans go one way only. The owner can loan players in until the end of the season and pays a chosen share of the wage; the parent club pays nothing for that player while he is away. Loaning your own players out is a later feature.
- AI clubs never go bust. If an AI club's cash drops below zero at the end of a week, its owner tops it back up to zero. Only the owner's club faces the lender ladder.
- If the owner's squad drops below 16 players or two goalkeepers, the league places free agents with the club on one-year minimum deals to fill it. The inbox says who.
- Naming rights are sold for a lump sum paid up front, which fans dislike. The old stadium name returns when the deal runs out.
- Players and staff only age at season rollover, not on birthdays during the season. Players who retire leave the game for good; they do not return as staff.
- A good fitness coach (rating at or above a floor) gives each injured player a weekly chance, scaled by rating, to come back a week sooner.
- To keep saves small, results are trimmed once their week is played. The timeline keeps only goals, red cards and injuries (without commentary), and only scorers, assisters and sent-off players keep a stat line. The owner's latest match is kept in full.
- Match day has three modes:
  - **Full control:** play stops only for the owner's injuries and red cards, half-time and extra time.
  - **Game plan and big calls:** play also stops for goals, an opponent's red card, half-time, the 65th minute, extra time and penalties.
  - **Coach:** play never stops; half-time is a 5-second break with a card on the pitch. The same goes for a full-control match handed to the head coach mid-game.
- In big-calls mode, a tactics change by the owner becomes the head coach's new game plan. The coach makes his usual adjustments (chasing, protecting, after a red card) from that plan instead of undoing it.

HQ Office (Stage 3):
- The desk is the menu. Tapping an object opens a Stage 2 screen:

  | Object | Opens |
  | --- | --- |
  | Laptop | Money |
  | Phone | Market |
  | TV | League table |
  | Whiteboard | Lineup |
  | Clipboard | Squad |
  | Window | Stadium |
  | Trophy cabinet | Club |
  | Door | Inbox |

  The Office tab brings the room back. Every screen is still reachable through the tabs, so nothing depends on finding an object.
- The laptop, TV and whiteboard show live data (cash, the table, the planned eleven) drawn onto canvas textures. The laptop's screen had no texture coordinates in the source model, so the game generates flat ones when it loads.
- Graphics setting: Low, Medium, High or Off (plain menus). It is stored per device, not in the save, so a save code moved to a laptop gets High there. Default is Medium on phones, High on desktop. The tiers control pixel ratio, antialiasing, shadows, bloom (High only), prop detail, the crowd in the window view and the city blocks behind it.
- If the 3D office cannot start, or the browser drops it three times, the game falls back to the plain menus and says so.
- Visitors: the newest unread inbox message of certain kinds brings a visitor to the door (lender for the ladder, agent for bids and transfers, sponsor rep for finance, head coach for staff and youth news, reporter for match and season news). Tapping the visitor opens that message. Visitors walk in and stand; they do not sit yet.
- Visitors are one base body with outfits painted on by colour regions in a shader, not separate clothing meshes.
- The office grows with the club in four levels (see `src/data/tuning/office.json`): the office starts carpeted; a sofa and art after one season, a parquet floor and bigger TV after a trophy or three seasons, the full corner office after three seasons and two trophies. Trophies won fill the cabinet.
- The window shows the club's real ground (the same 3D model as the Stadium tab, with a smaller crowd), so every purchase and branding change appears there. The office sits 72 m up and the ground 330 m away, so the pitch still shows over the window sill when the near stand is three tiers tall. Both values are in `src/data/tuning/office.json`.
- The wall clock shows the device's real time, not the game calendar.
- three.js and the office art only download the first time the office opens, so the plain menus stay light. The office art is about 5.6 MB (Meshopt geometry, KTX2 textures).

Stadium (Stage 4):
- Seat counts, boxes and money come from the sim. The 3D model draws the stands' shapes and a crowd that follows the last home attendance. It does not draw one figure per seat. A full house is drawn with a set number of figures (on High, 9,000 on the Stadium tab and 3,000 through the office window; Medium draws 60% of that and Low 25%), and a part-full ground draws that share of them.
- Building weeks are calendar weeks. Work started during the season closes 35% of that stand's seats (12% for a roof) until it is done. Off-season and pre-season work closes nothing, because there are no home matches.
- Rebuilding a stand keeps its roof and boxes. Roof cost follows the stand's seats when it is ordered, so roofing before rebuilding is cheaper. Real clubs would pay again.
- Naming rights rename the ground to the buyer's first word plus "Arena", and the old name returns when the deal ends.
- Each off-season an AI club picks one project. It refurbishes a tired ground; else, if its crowds were near capacity, it builds the stand or corner with the lowest cost per seat; else it adds the cheapest roof. Each choice needs its cash to cover the cost a few times over (`ai` in `src/data/tuning/stadium.json`). AI clubs do not buy boxes or club-wide upgrades after the start.
- Every club's starting ground (size, roofs, boxes, upgrades) is set from its finances and market by the thresholds in the `start` block of the same file.
- Every club starts with a ground built up to its listed capacity. Roofs, boxes and upgrades follow its finances, market and condition.

Match engine (Stage 4.5 verdict):
- The owner's verdict on the spatial engine: it feels good. Stage 5 can start.
- Team strength: every rating is pulled 28% towards 65 on the day (`skillSpread.keep` 0.72), so the best club no longer runs away with the league as often. Stronger squads still finish higher.
- Fouls: refereed to real top-flight levels, about 10 to 11 a team and 2 yellows.
- Formations: four at the back is the norm. Coaches favour 4-2-3-1 and 4-3-3, then 4-4-2 and 4-1-4-1; back threes and fives are a minority taste (`selection.formationPopularity` in `src/data/tuning/coach.json`).
- Keepers: reflexes speed up the dive, so a good keeper saves noticeably more than a poor one, while an average keeper (65) saves as before.

---

## 16. Open items (decide during development)

- Starting cash, debt and squad quality per difficulty tier.
- The stadium upgrade catalogue and costs: proposed in section 10, waiting for the owner's confirmation.
- The spatial match engine questions (section 17.14): the proposed answers are in use until the owner decides.
- Wage cap level, luxury-tax rates and the typical fee range for a star.
- Youth intake size by academy level.
- Which tactical presets ship for the concept test.
- The exact owner's fortune per difficulty tier, and whether it grows over time.

---

## 17. Spatial match engine (Stage 4.5 design)

**Status:** the owner said to build it ("start on 4.5 and onward") without a separate review, so the build has started. Until the owner answers the questions in 17.14, the engine uses the proposed answer; any of them can still change, and so can anything else here. Detailed values, sketch evidence, formulas, test mechanics and the risk list are in the appendix, `docs/history/STAGE_4_5_SKETCH_NOTES.md`.

**The idea.** 22 players and a ball move on a 105 m by 68 m pitch. Tactics decide where each player wants to stand, each player chooses from what he sees and his attributes, and the referee judges real positions. One engine runs every match: "fine" mode for the match on your screen, a faster "coarse" mode for the rest. A match replays from its seed plus the log of changes made during it, so saves hold no positions.

Every number is a **starting value** in `src/data/tuning`, adjusted in the tuning lab. Everything is fictional. Attributes are named in full; the appendix lists their save names. Terms:
- **Depth:** metres from a team's own goal line. **Threat:** the chance that a possession from a spot ends in a goal. **xG** (expected goals): the chance a shot goes in.
- **Worker:** a background thread, so the screen never freezes. **Fingerprint:** a short code worked out from some data; change the data and the code changes.
- **ENGINE_REV:** the engine's version number, raised whenever a change would make an old seed play a different match. **Golden matches:** fixed-seed matches whose fingerprints are stored, so any change shows.
- **Restart-resume:** the fallback for a saved match that can no longer replay exactly: keep the score, clock, cards, subs and tiredness, put the players back in shape and give the ball to the team that had it.

### 17.1 Time model

**Modes.** Fine mode (a step every **0.1 s**) runs any match shown on screen, in the text feed or the 2D viewer. Coarse mode (every **0.5 s**, raised from 0.25 s in build step 3; see 17.15) runs the rest, including your own match when simmed unwatched. A match keeps its mode from kickoff, so "Play to end" stays fine. The man on the ball rethinks every 0.2 s, players within 30 m of it every 0.3 s and the rest every 1 s (0.4, 0.6 and 1.5 s in coarse); everyone rethinks at once after a pass or turnover.

**Keeping coarse honest.** In both modes the ball's flight is worked out every 0.1 s, so a pass cannot jump a defender, and who wins a pass is settled at the strike (17.5). Per-second chances, such as fouls, scale with step length. Both modes must hit every target and agree (17.10).

**Restarts take real seconds:** throw-in 12, goal kick 20, free kick 20 (38 with a wall), corner 35, goal 65, each sub 20. With a typical match's 45 throw-ins, 16 goal kicks, 28 free kicks, 10 corners, 2.7 goals and 7 subs, about 58 of 96 minutes are in play (the lab holds it at 55-60). Time-wasting adds 0 / 2 / 4 / 7 / 10 s to **your own** restarts only; at dials 4 and 5 each risks a booking (1.5% / 3%), as does a keeper holding the ball over 8 s.

**It plugs in underneath.** A new `stepSeconds` sits under `stepMinute`; today's match functions keep their form and stay synchronous (17.8). A change applies at the next whole second, is logged with it and shows in the shape within 1-2 s. The 2D viewer plays at 1x to 8x; "Key moments" shows the 20 s before each goal, big chance and card.

**The live clock.** The text feed and 2D viewer share one display clock, and the engine runs just ahead of it.
- Text speeds of 700 / 350 / 120 ms per match minute are about 85x, 170x and 500x real time.
- The worker stays about 0.5 real seconds ahead, playing a tenth of a real second's worth at a time, with a snapshot at the start of each chunk.
- A change rewinds to the displayed second and replays from the snapshot before it. In the text feed that is the end of the minute on screen, so nothing you have read changes.
- Events carry their second (17.9) and appear when the clock reaches it. At 500x this is about 60 ms of work per real second on a mid-range phone.

### 17.2 Team shape

Tactics set where each player wants to stand; the ball moves the whole block.

**Two spots per slot.** Each slot in `formations.json` gets an in-possession spot, an out-of-possession spot and role flags: **overlaps**, **inverts** (comes inside) and **drops in** (between the centre-backs). Players blend between spots over the 5 s after the ball changes hands, so a 4-3-3 can defend as a 4-5-1 and attack as a 2-3-5. Only data changes, not saves.

**Out of possession** the block is about 30 m long and 36-42 m wide. The back line sits at the line dial's height with the ball at halfway, moves 4 m for every 10 m the ball moves, stays between 6 and 58 m, and keeps 4 to 15 m goal-side of the ball, more when the ball is far from goal. **Defending the box:** with the ball within about 25 m of goal, the line holds at 11-14 m, dropping deeper only to cover a cross into the six-yard box.

**In possession** the back line moves 5 m for every 10 m, plus the mentality shift, between 18 and 58 m; the block stretches to 45-55 m.

| Dial | Values for 1 / 2 / 3 / 4 / 5 |
|---|---|
| Defensive line: back line, ball at halfway | 24 / 30 / 36 / 42 / 48 m |
| Mentality: block shift | −6 / −3 / 0 / +3 / +6 m |
| Mentality: kept behind the ball + attacking the box | 6+2 / 5+2 / 5+3 / 4+4 / 3+5 |
| Width in possession | 42 / 48 / 54 / 60 / 64 m |
| Press starts when the ball is within this of our goal | 35 / 45 / 55 / 70 m / anywhere |
| Pressers | 1 / 1 / 1 + cover / 2 + cover / 3 |
| Tempo: time on the ball before it should move | 3.0 / 2.4 / 1.8 / 1.4 / 1.0 s |
| Directness: preferred pass length | 12 / 16 / 20 / 25 / 30 m |

**The back line** drops 3-6 m when the passer is free and facing forward and steps up 3-5 m when he is not. Each defender reacts after 0.2-0.6 s (quicker with positioning and marking), so a well-timed run beats the line and a slow defender plays a forward onside.

**Pressing and the line are separate.** The line dial sets the height; pressing sets how many jump out. The midfield follows the pressers half the way, so a high press with a deep line leaves a gap between the lines. **Press triggers** (a back pass, a heavy touch, a receiver facing his own goal, a bouncing ball) send one more presser.

**Transitions.** With counter-attacks on, 2-3 players sprint into space for 5 s and a quick forward pass earns a bonus; off, players recover their shape first. **Man-marking:** the marker stays 1-2 m goal-side of his man, up to 15 m past halfway.

**Short-handed.** `formations.json` also holds 10- and 9-man versions of each formation (a 4-3-3 becomes a 4-4-1 or 4-3-2), replacing today's fallback list. After a red card the AI coach picks the shape and who drops out; you get the same choice, with his pick ready. If a keeper is sent off with no subs left, the outfielder with the best keeper positioning goes in goal. A hurt player who must stay on moves to a low-demand slot at 70% of his top speed.

### 17.3 On-ball decisions

**Options.** About 40: a pass to each team-mate he can see, to feet or into space, on the ground or lofted; a few through balls; 3-5 dribble directions; a shot, cross, clearance or holding it up.

**Weighing.** Each option is worth the threat it creates if it works, less the threat the opponents get if we lose it there, plus a tactic bonus (tempo, directness, width, counters, protecting a lead). Threat runs from 0.003 in our own box to 0.25 on the penalty spot. A pass works if no defender can reach its path in time.

**Marked men and return passes (step 7c2).** Unless it finds a man free in behind, a pass is worth less to a receiver with a marker close: 1 − 0.9 × (1 − d / 6) with his nearest opponent d m away, so a man marked from 1 m keeps about a quarter of his spot's worth and one 6 m clear keeps it all. A pass straight back to the man who just passed is worth 0.6 of its value. Crosses take both discounts too. Before this a striker, tightly marked but standing in the best spots, was picked for 61% of his side's shots and wide players for 5%; the ball now goes to whoever is free (`threat.markWithin`, `markCost`, `returnMul`).

**Vision.** He sees team-mates within 20-55 m, by vision, in the 200° in front of him, plus behind him if he scanned in the last 1.5 s.

**Decision quality (q, 0 to 1)** blends vision 40%, composure 40% and positioning 20%, as there is no decisions attribute (question 1). Random noise is added to each option's worth, sized to the gap between his top options so it bites as hard in his own half as at the edge of the box; lower q means more noise. A q 0.9 player nearly always picks his best or second best; a q 0.4 player often picks the third. Tiredness adds up to 60% more noise.

**Execution is where technique shows:** passes by passing, crosses by crossing, shot spread by finishing, first touch by dribbling and composure, holding it up by strength, duels by dribbling or pace against tackling (an equal defender wins 55%). Pressure hurts low-composure players most.

**Shooting** depends on how much of the goal he can see.
- xG is a value for the distance times the share of the 7.32 m goal he can see square-on. Straight on: 6 m 0.38, 11 m 0.22, 16 m 0.09, 20 m 0.05, 25 m 0.03. Near the byline he sees about a third. Header ×0.6; a defender within 1 m ×0.7.
- Blockers and the wall stop shots physically, so xG ignores them, but a crowded lane makes the shot a worse choice.
- He shoots when the shot beats his best pass and clears a bar: 0.035 xG in the box, 0.025 outside, lowered to 0.02 for good finishers and attacking mentality. Target: 30-40% of shots from outside the box.
- **Direct free kicks** have their own curve by set pieces: about 0.05-0.07 from central spots 22-28 m out.
- Goals come from the physics (aim, keeper, blockers). xG guides the choice and the stats but never rolls a goal.

### 17.4 Off-ball logic

**Attacking.** One or two players offer a short pass 8-15 m away that no defender blocks. Players near the ball read the next pass, giving one-twos and third-man runs. A run in behind starts only when it is on: the carrier free and facing forward, space behind, the runner on the shoulder. He holds 0.5-1.5 m onside, then goes; positioning and composure sharpen the timing and work rate sets how often. A flagged full-back overlaps when his winger comes inside. For crosses, 2-5 players (by mentality) fill the near post, far post, penalty spot, cut-back zone and edge of the box, when the ball is wide and deep or held centrally at least 78 m up the pitch (`box.centralFrom`, step 7c2), so a side building through the middle has men in the box to find.

**Defending.** Zones 8-12 m apart, the cover 2-4 m behind and inside the presser. The nearest defender tracks a run into his zone, as tight as his marking. In the box: zones, plus tight marking on the 3-4 biggest aerial threats. A defender facing a dribbler stands off 1.5-2 m and shows him outside (question 3).

**Goalkeeper.** He stands on the line from the ball to the middle of his goal.
- Up to 20 m off his line with the ball far away, sweeping behind a high line; 1-3 m off with it within 25 m. One against one he comes out to narrow the angle, better timed with keeper positioning.
- He claims crosses landing within 6-10 m (keeper positioning, handling); reflexes set his reactions.
- Handling decides hold or parry: low shots are pushed wide, shots at his body can spill, high ones are tipped over.
- Kicking sets distance and accuracy; he plays short when defenders are free and directness is low.

**Movement.** Top speed 7.2-9.5 m/s by pace, 85% of that with the ball. A sharp turn costs speed, so turning a defender works.

### 17.5 Ball model

**Flight.** Rolling, the ball slows by 1.8 m/s² on dry grass, so a firm 20 m pass takes about 1.4 s. In the air the drag is **0.010 per metre**, like a real ball (0.01-0.015): a long ball struck at 24-30 m/s carries 40-55 m and a goal kick at 28-33 m/s carries 50-62 m, both checked by a test. No spin.

**Control.** A player plays a ball within 1.0 m of him: below 1 m high with his foot; from 1 to 1.5 m on his chest or thigh, which runs loose more often with low dribbling and composure; above 1.5 m only with his head, up to 2.3-2.7 m by heading and strength. Two players arriving together go to a duel. The last touch decides the restart.

**Settled at the strike.** When a pass, cross or shot is struck, the engine works out who reaches it first, the receiver or an interceptor. He runs to the meeting point; everyone else keeps 0.5 m clear of the ball's path. The only other touch is a **deflection**, also decided at the strike, when a shot or cross runs into a defender. Viewer check: no ball passes within 0.5 m of a player who does not touch it.

**Own goals** come from deflections, miscued clearances under pressure (more with low composure) and back headers: 0.08-0.12 a match.

**Weather works through physics:** rain skids the ball and spoils first touches, a heavy pitch slows it, wind spoils lofted balls, heat drains energy.

### 17.6 Rules on real positions

**Offside.** When a team-mate plays the ball, a player is offside if he is in the opponents' half, ahead of the ball and ahead of the second-last opponent (the keeper counts); level is onside. He is penalised only if he gets involved, with an indirect free kick where he got involved, as in today's law. Throw-ins, goal kicks and corners are exempt. Linesman errors are off (question 4).

**Fouls** are rolled per challenge at the real spot: more from sliding tackles, challenges from behind, and tired or aggressive players; fewer from defenders in their own box. A foul in the box is a penalty.

**Cards.** A yellow for 15% of ordinary fouls and most tactical fouls that stop a promising attack. Denying an obvious goal-scoring chance is a red; in the box it becomes a penalty and a yellow if he went for the ball. **Advantage** is played while the attack stays dangerous; if nothing comes of it within 3 s, the free kick comes back.

**Home advantage has a cause.** Home players play 2 attribute points better at a full stadium, less with a smaller crowd, and the referee calls home fouls 8% less often, replacing today's shot-rate boost and its possession and card edges.

**Set pieces.** The wall stands 9.15 m back. Within 30 m the taker shoots if the free kick's xG is at least 0.04. Corner routines come from data, with 4-6 attackers up. About 76% of penalties go in.

**Who takes them.** The named taker takes every penalty, direct free kick and corner while on the pitch; if he goes off, `pickTakers` picks again from those still on. A quick, short free kick in midfield goes to the nearest player. Throw-ins go to the full-back or wide player on that side.

**Back-pass rule.** The keeper cannot pick up a deliberate kick or a throw-in from a team-mate, so he plays it with his feet.

**Stoppage time** adds 30 s per goal, 20 s per sub, 45 s per injury, 15 s per card and any time-wasting, within 1-6 minutes per half (0-2 in extra time).

**Still left out**, none needed for believable results: handball (players have no arms yet); the keeper's 8-second limit (holding on only risks a booking); dropped balls (after an injury the team that had the ball restarts unopposed, as happens in practice); retaken penalties and encroachment; dissent and bench cards; quick free kicks taken before the wall is set.

### 17.7 How existing systems plug in

Everything around the match keeps its rules (section 5, `coach.json`, `match.json`), now fed by real running.

**Fatigue** comes from distance and sprints, scaled by stamina and weather: a midfielder covering 11 km, 2 km of it fast, loses about 0.55 energy, close to today. Pressing and tempo cost energy because players run more; tired players lose speed and sharpness. **Half-time** gives back a quarter of the first half's energy use (today, none). **Condition** after the match falls with the energy he used (0.12 for a typical 90 minutes), not a flat 0.12, so a pressing midfielder loses more than his keeper.

**Injuries** come from duels and tired sprints, more with low durability: 0.10-0.35 a match.

**Substitutions** wait for a stoppage, as in real football.
- Five from nine, extra time included. Your requests and the AI coach's join one waiting list per team (`pendingSubs`), saved with the match.
- A sub counts towards the five once queued and goes on at the next stoppage of any kind, whichever team restarts, including one for an injury.
- If the player coming off is sent off first, the sub is cancelled and stops counting.
- The log records the second you asked, so a replay finds the same dead ball. The screen shows "Sub waiting" with a cancel button (question 2).

**AI head coach.** He thinks once a minute: `inMatchDecisions` runs at each minute boundary on his own random stream and logs its actions at that second. The `coach.json` chances stay per minute (planned sub 0.07, booked player 0.4, impact sub 0.12, defensive sub 0.1). Big calls and coach modes are unchanged; their pauses, including the 65th minute, land on minute boundaries.

**Extra time** is two 15-minute halves in the same engine; the shootout is kick by kick at minute 121, players on the pitch only.

**Stats.** Possession becomes share of time on the ball (question 6). Passes, completion and offsides are real. New fields (a shot list with spot, xG and body part; distance and sprints; crosses) are optional, so old saves load. Ratings and commentary use the same code.

**Tune causes, never results.** There is no "goals" knob: if goals are low, we change finishing or the keeper's reach.

**The Stage 1 match entries in section 15:**

| Stage 1 entry | Spatial engine |
|---|---|
| One move a minute; passes and offsides as chances | Real passes; offside judged at the pass |
| Penalties as a share of fouls; free kicks at no distance | Fouls at the spot; walls; the free-kick curve |
| No own goals, advantage, handball, dissent or bench cards | Own goals and advantage added; the rest left out (17.6) |
| Time-wasting only when ahead from minute 70; shots cut two goals up | Slower own restarts with a booking risk; shot cut removed |
| No half-time recovery; a flat 0.12 condition loss; a hurt player with no subs stays on at minimum energy | Half-time recovery; loss by energy used; the low-demand slot |
| Sent-off slot left empty with a 10% penalty | 10- and 9-man shapes; the keeper rule (17.2) |
| Man-marking cuts involvement; counters only from turnovers | A real marker; real runners |
| Home advantage as a shot boost; weather as multipliers | Attribute points and referee lean; ball physics |
| Stoppage time, dead-ball subs, AI coach rules, shootout order, ratings; results trimmed after their week | Stay; trimming also drops the new fields (17.9) |

### 17.8 How the game calls the engine

- The engine (`src/sim/spatial`) stays synchronous, so tests and Node call it directly.
- A new async **MatchRunner** in `src/game` posts match setups to the worker and gets results back; in tests it runs in-thread.
- `advanceCareer` splits in three: **prepareWeek** (weekly books, coach checks, a `MatchSetup` per fixture), **runWeek** (the MatchRunner plays them, reusing any pre-simulated result) and **settleWeek** (results, `settleMatch`, player tallies, `lastUserMatch`, `compactResult`, recovery, the calendar).
- While you browse menus the worker **pre-simulates** next week's background matches, each keyed by a fingerprint of its whole `MatchSetup`: seed, selections, injuries and bans, attendance (from ticket price and stadium) and weather. If anything changes, it re-runs.
- The screen shows "Playing the week..." and ignores taps until the week is settled.
- `careerHooks.simulate` and the headless `runSeason` keep a synchronous path.

**As built (step 7b).** The season's `advanceWeek` is now `prepareWeek` (every fixture's setup) and `settleWeek` (the results and the calendar); each club plays once a week and every match has its own seed, so playing all the setups first and settling after gives exactly the same week as the old one-match-at-a-time loop (checked on a whole career). On top of that, `prepareCareerWeek` and `settleCareerWeek` in `src/sim/career/advance.ts`; `advanceCareer` still plays a week in one call on the main thread, for tests and Node. In the game, `src/game/week.ts` plays the week: setup, the background matches in the two workers, then the user's live match seen out (if one is on) and the week settled. "Playing the week..." covers the screen with a bar of matches played; nothing else takes a tap and nothing saves until the week is settled, so a closed tab comes back at the start of the week. "Sim to end" keeps the card up all the way, with "Stop after this week". Pre-simulation starts 0.4 s after the screen settles, once a week: the coming week is set up on a copy of the career and its matches go to the workers. Each is kept under its whole input as text (the setup plus every player and club in it), compared exactly, not by a short hash, so a match whose input changed (a new lineup, a ticket price) plays again and the rest are used as they are. A match the workers fail on plays on the main thread instead. Measured in Chromium at phone size: a week takes about 0.1 to 0.15 s when its matches were played early and about 0.8 s when not; with the processor slowed four times, 0.65 s and 1.05 s, where the main thread's share is mostly drawing the screen and writing the save (about 45 ms on a laptop).

### 17.9 Replays and saves

Saves keep the recipe for a match, not the film: the seed, the line-ups and every change.

**Every change is an action.** `liveTactics` goes through `applyAction` but also overwrites the coach's plan, and `setCoachInCharge` and the walk-away path in `advance.ts` set `aiControlled` directly. Two new logged actions fix that: `setPlan {side, tactics}` and `setControl {side, ai}`. `MatchEvent` gains an optional `second`; the text feed still groups by minute.

**The replay record** (about 3 KB compressed) holds the seed, mode, `ENGINE_REV` and tuning fingerprint; all 40 players' attributes, positions, condition, kickoff energy, shirt numbers and display names, as these change later; both line-ups, benches, setup tactics and plans; and the full action log, AI included, with a result checksum. Your club's records are kept all season, others' for the latest round only (question 8). `replayFrames(record, fromSecond, toSecond, fps)` rebuilds frames on demand from the nearest 5-minute checkpoint in memory, as positions in whole centimetres (an `Int16Array`).

**Stored results stay small.** Once a week is played, `compactResult` also drops the shot list and the new per-player fields; `lastUserMatch` and the replays keep them. A test checks a career save stays under 1.5 MB after three seasons.

**Saving mid-match** stores the record and the current second. On load the game re-runs to it: up to about 1.5 s on a mid-range phone at the 90th minute. If `ENGINE_REV` or the tuning has changed, it uses restart-resume.

**Old saves.** `CAREER_VERSION` goes from 2 to 3; the migration converts an old-engine match saved mid-way with restart-resume. Old matches keep their results without replays (question 7). CI (the automatic build checks) plays the golden matches; a change that alters them must bump `ENGINE_REV`.

**As built (step 7b).** The live match runs through `src/sim/career/live.ts`. `career.liveRecord` holds the setup at kick-off, the engine revision and a tuning fingerprint, the number of minutes played, and a log of the owner's changes, each stamped with the minute it was made: `action` (a substitution or tactics), `plan` (the coach's game plan) and `control` (owner or head coach on the touchline). Minutes are the unit because the match screen steps a minute at a time and every change lands between steps, so replaying the minutes and the log gives the same match exactly; the AI coach's own decisions are not logged, as they are worked out again. On load the record replays in fine mode and is checked against the saved state (score, clock, events, subs); if anything differs, or the revision or tuning has changed, or the save has no record, the match restarts from the saved state instead: the score, clock, cards, subs, tiredness and the events and stats so far carry on, the periods already played count at their regular length, the players line up in shape and the side that had the ball kicks off. A shootout under way starts again (very rare: it needs a save in the middle of one and an engine update). The restarted match keeps that state as its record's base, so it saves and replays too. The version 2 to 3 migration only adds the empty record; the restart happens the first time the match is opened. The watched match now keeps its team and player stats current every minute, so the stats strip moves during play. The other matches of the week play in coarse mode in the workers (17.8). Owner-loop tests that play whole seasons (career, stadium and save tests) play the matches nobody watches on the Stage 1 engine (`tests/helpers/quickCareer.ts`), as the spatial engine under the test runner's module transform takes several seconds a week; the live match in those tests, the engine tests and the benchmarks all use the spatial engine.

**As built (step 7b3a).** Every match played from kick-off on the spatial engine carries a `replay` on its result: the engine's record (seed, mode, setup and every action, the AI coach's and the owner's), the tuning fingerprint, and a check, the engine's fingerprint at the final whistle, so a replay that comes out differently can tell. When the week settles, the replays move to `career.replays` (the club's matches all season under `club`, the latest round of the others under `round`) and come off the results; the off-season clears them. A match restarted part-way (restart-resume) has no replay. A replay made under another engine revision or tuning is refused with "played by an older version of the match engine". Sizes: one record is about 14 KB of JSON, 3.7 KB compressed; a full season of the club's replays takes a save code from about 175 KB to 260 KB. The minute loop now steps frame by frame (`stepSpatialFrame`), so the 2D viewer can draw each step; it plays exactly the same match. Golden matches (`tests/golden.test.ts`, two in each mode, played as playoff ties) store their score and fingerprints under `engineRev`; after an engine or tuning change, raise `engineRev` in `src/data/tuning/spatial.json` and run `npm run golden`, which refuses to store new outcomes under the old revision. `CAREER_VERSION` is 4; the 3 to 4 migration adds the empty replays.

**As built (step 7b3b).** Two 2D views share one drawing module (`src/ui/pitch2d.ts`, also used by the Engine Lab). *Replays:* "Watch in 2D" on the last-match card and on any match report that has a replay opens the replay screen. Opening one plays it through once in the background (about half a second for a coarse match) to check it ends where the real match did and to list its moments (goals, red cards, penalties, half-time, the shootout); a replay that comes out differently is not shown. Playback runs at 1x to 32x match speed (8x to start), with ±1 minute, next moment and a time slider; going back plays again from kick-off, quickly, to that moment. Jumping to a moment plays it at 1x from 8 seconds before. *Live:* the live match screen shows the 2D pitch by default (a "2D pitch" button turns it off, remembered per device). On the pitch, play runs step by step at 2x to 16x match speed; the rest of the screen updates once a minute, when the minute's events come in, and pauses for big moments work as before. A change made with the pitch on lands from the next engine step (a tenth of a second), not the next minute, so a new shape shows straight away. The live record notes the frame of each change (`LiveEntry.frame`) and how far into the current minute play has gone (`LiveRecord.frames`), so a match saved part-way through a minute replays exactly; both fields are optional, so older saves need no migration.

**Swap-over.** The engine is built in `src/sim/spatial/` behind the same names. Until build step 7, `?engine=spatial` runs on its own save slot (a copy of your career), never touching your real save. In step 7 the default flips and the migration ships; `tick.ts` goes one deploy later.

### 17.10 Targets and tests

**Targets,** in both modes:
- goals 2.4-3.1 a match, 85%+ from inside the box; home wins about 45%, draws about 25%;
- shots 9-16 per team, 30-40% from outside the box;
- passes 800-1,100 a match; completion 70-88%; possession 35-65%, the stronger squad averaging more;
- fouls 9-15 per team; yellows 3.5-4.5, reds 0.1-0.2, penalties 0.25-0.35 and own goals about 0.1 a match;
- corners 3-7 and offsides 1-4 per team; injuries 0.10-0.35; ball in play 55-60 minutes;
- stronger squads finish higher.

**Agreement test:** about 2,000 fixtures in both modes, enough to measure a goals gap fairly. The modes must agree within ±0.15 goals, ±1 shot, ±2 points of completion and possession, ±1 foul, ±8% passes, ±5% distance run and ±1 cross.

**Four layers of tests** (pass marks in the appendix):
1. **Shape, no randomness:** line 5 at least 20 m higher than line 1; the line 11-14 m out with the ball 20 m out; a 4-3-3 shows four across the back without the ball, two or three with it.
2. **Rules, no randomness:** every offside case (a backward pass to a man beyond the line is onside; with the keeper out, the two deepest outfielders set the line); the named taker takes every penalty, direct free kick and corner while on the pitch; no back-pass is handled; the sub-queue cases.
3. **Tactics, one test per dial on 120 shared seeds:** a high line means more balls in behind and offsides; a high press wins the ball higher and costs energy; width brings crosses, attacking mentality shots, slow short play completion and possession, counters fast breaks, time-wasting stoppage time; man-marking cuts his man's touches; high-q midfielders play more forward passes.
4. **Believability seasons** in a slow job: 8 fine seasons, the same fixtures in coarse, and 8 more coarse seasons; about 9 minutes of work, 2.5 on the build machine's 4 cores. `npm test` stays at about 90 s.
   *As built (step 7c1):* `npm run test:slow` (`tests/slow/`) plays 6 whole coarse seasons (one twice, to check it comes out the same) and 2 fine seasons, playoffs included, and checks each against the same bands as the Stage 1 season tests (`tests/helpers/believability.ts`): goals, results split, shots, xG, cards, fouls, corners, offsides, top scorers, and squad strength against the table. About 105 s on the build machine. It runs as its own CI job, `believability`, beside the build. The deploy does not wait for it, so a miss shows red there but does not hold back the site; the known misses are in 17.15.

**What you judge first in the viewer:** no bunching, few passes straight back, few shots from beyond 30 m, nobody standing still, the back line moving as one, keepers sweeping behind a high line, no ball passing through a player.

### 17.11 Performance budgets

The engine runs in a worker and makes no new objects in its main loop, avoiding the memory clean-ups (garbage collections) that make phones stutter.

**Cost.** Today's engine takes about 3.9 ms a match on the dev machine. The sketch puts a fine match at about 40 times that (160 ms) and a coarse one at about 14 times (55 ms).

**Phone factor ×4:** on public single-core benchmarks a mid-range Android phone runs JavaScript 2-3 times slower than the dev machine, and 30-50% slower again when warm or busy. A budget phone is about ×8, a recent iPhone about ×1. The **Engine check** in Settings times your real phone.

**Limits.** A tap answered within about 2 s feels responsive; past that you need a progress bar. Each CI limit is the phone budget ÷ 4, doubled for slack.

| Benchmark (what it covers) | Mid-range phone budget | CI limit (dev machine) | Sketch estimate (dev machine) |
|---|---|---|---|
| League week: 8 coarse matches ("Next week", nothing pre-simulated) | 2.0 s on one worker (0.25 s a match), 1 s on two | 1.0 s | 0.45 s |
| One fine match ("Play to end", reloading a live match) | 1.5 s | 0.75 s | 0.16 s |
| Season: 245 coarse matches, playoffs included ("Sim to end of season") | 61 s on one worker, 31 s on two, with a progress bar | 31 s | 13.5 s |

**Other checks:** one fine minute within 15 ms on a phone (the live match at 500x); a replay jump to 85:00 within 0.1 s; at most 20 garbage collections per fine match, counted in Node; memory growth under 2 MB over 50 matches.

**If the engine is slower:** distant players rethink less often, then 0.5 s coarse steps (about half the cost), then a second worker.

**How the budgets are measured (changed in build step 3).** The benchmarks live in `tests/perf/` and run on their own (`npm run test:perf`, a separate CI step) instead of alongside the other test files, which run in parallel and were competing for the same CPU. Each timing is the fastest of a few runs: best of 3 league weeks, best of 2 fine matches. The limits in the table are unchanged; only the way they are timed changed.

### 17.12 Determinism

The same seed must give the same match on every phone and browser; replays and bug reports depend on it.

**Separate random streams** for match events, player generation, the AI coach and commentary. Today commentary and in-match AI share the match stream, so a new commentary line could change a match.

**Plain arithmetic only.** + − × ÷ and square root give identical answers everywhere; built-in sin, cos, exp, log, pow, atan2, hypot and the `**` operator may not, and in a spatial engine tiny differences grow into different matches.
- Directions use vectors, not angles; curves use lookup tables or simple shapes.
- Any real curve comes from `det.ts`, built from those five operations only: bit-for-bit the same everywhere and accurate to about 15 digits.
- The engine uses a new `Rng.normalDet`; `Rng.normal` stays for player generation, so existing worlds do not change.
- A lint rule (an automatic code check) and a test ban the built-ins and `**` in `src/sim/spatial/**` and the shared files the engine calls (`match/clock.ts`, `match/strength.ts`, `match/ratings.ts`, `rng.ts`). `Rng.normal` is the one marked exception; the engine may not call it.
- Players run in a fixed order, inputs land on whole seconds, and nothing reads the system clock.

**Proof so far:** the sketch gave identical golden fingerprints in Node, Bun (Safari's engine family), the main thread and a worker. CI will play a golden match in Chromium, Firefox and WebKit, on Linux only; the **Engine check** plays it on your real iPhone and shows "matches" or "differs". You tap it once.

### 17.13 What we simplify, and why

- **No spin or curl:** a whipped cross is a lower, faster flight.
- **No stronger foot yet** (question 5): it needs a new attribute and a save change.
- **Players are 0.4 m circles** that push apart instead of planning paths, and face the way they move.
- **A perfect referee:** no diving or video review, linesman errors off unless you want them, plus the rules left out in 17.6.
- **One weather per match, a fixed threat map, a kick-by-kick shootout.**
- **Fine and coarse** may differ in a given match but hit the same averages.
- **Ends never change.** The home side attacks the same way all match, extra time included. The pitch is symmetric and there is no wind or slope yet, so it changes nothing but the picture; the 3D viewer can mirror the second half when it arrives.
- **Home advantage is the crowd's.** Up to 3 points on the home side's technical and mental attributes at a full ground and a referee lean on fouls and yellows (step 7a, 17.7); nothing physical changes and a match with no crowd is neutral.
- **The Stage 1 engine is a test-only stand-in.** It lives in `tests/helpers/stage1/`. Owner-loop tests that play whole careers use it for the matches nobody watches, because the spatial engine under the test runner is several seconds a week. `src/data/tuning/match.json` stays unchanged, so the tuning fingerprint and stored replays are not disturbed.
- **The match keeps its coach's minute.** The AI head coach looks at the match once a minute of match time, as in the Stage 1 engine; his changes then go in at the next whole second.

**Cut order if the schedule slips:** set-piece routines, aerial bounce detail, first-touch variety, player separation, facing separate from movement. **Never cut:** offside at the pass, fouls by location, outcomes settled at the strike.

### 17.14 Questions for the owner

1. **Decisions attribute.** Add one (a save migration), or is the blend of vision, composure and positioning enough?
2. **Your substitutions.** On at the next stoppage of any kind (proposed), or only at your own restarts?
3. **Jockeying.** Show attackers outside (to the touchline) or inside (into cover) by default? A team instruction later?
4. **Linesman errors.** Off, or about 3-5% of very tight calls (within 0.5 m) wrong?
5. **Stronger foot.** A new attribute now, or later?
6. **Possession.** Share of time on the ball (proposed) or share of passes?
7. **Old replays.** After an engine update, older replays show only their text timeline. Acceptable?
8. **Which replays to keep.** Your club's all season, others' for the latest round only?
9. **Pressing at dial 5.** Man-for-man (each presser takes a man) or zonal (press the ball, cover the lanes)?
10. **Waiting times.** About 2 s for "Next week" (usually instant) and up to 60 s, with a progress bar, for "Sim to end of season"? Which phone do you test on? Tap the Engine check there once it exists.
11. **The cost of pressing.** *Answered: keep it physical.* Energy follows distance run, so pressing high costs only the extra running (about 0.02 energy over an hour, out of about 0.3 used). There is no extra direct cost.
12. **The engine's feel, strength spread, referee and formations.** *Answered: it feels good; strength spread, coach tactics and fouls are ours to tune (17.15 step 7d); four at the back should be the norm.*

### 17.15 Build notes

What the build actually did, step by step, where it differs from or adds to the plan above.

**Step 7d: tuning after the owner's verdict (done).** The owner judged the engine "pretty good" and left the strength spread, the AI coaches' tactics and the referee to us, and asked for back fours.
- **Strength spread.** `skillSpread.keep` 0.8 to 0.72. Tried 0.66, which let the weakest club finish mid-table.
- **Fouls.** Front-on tackles 0.081 to 0.093, from behind 0.213 to 0.245, loose-ball duels 0.056 to 0.064, aerial 0.05 to 0.057. Fouls went from 8.9 to about 10.5 a team, yellows from 1.8 to about 2.
- **Formations.** A new head coach draws his preferred shape by `formationPopularity`, and a coach choosing between shapes that suit his squad about equally weights them by it too. Same number of random draws, so nothing else shifts.
- **Corners.** More shots deflected behind by blockers (`blockBehind` 0.3 to 0.4 and 0.4 to 0.5) and more parries out (0.35 to 0.4), as corners were just under 3 a team.
- **Keepers.** A 50-point keeper gap changed the share of open-play shots on target that go in by about 1 point; real football is nearer 10. Faster reactions alone did little, because most shots arrive after even a slow keeper has finished his dive. Now dive speed follows reflexes too (`diveV` 5 m/s at reflexes 65, `diveRef` 3 m/s per 99 points), reactions count for more (`reactRef` 0.3) and positioning for more (`gkpBonus` 0.4), with `reach0` and `reactBase` set so a 65 keeper is where he was. Standing reach went up 4 cm overall (`reach0` 1.495) to bring goals back to about 2.5 a match. A keeper of 88 now lets in about 21% of open-play shots on target against 28% for a keeper of 38.
- **Tests.** The named-taker test only counts shots while the taker is on the pitch. The red-card test allows a second red. The keeper test compares open-play goals per shot on target, since a penalty beats almost any keeper. Two tests use bigger samples (possession 6 matches, coarse even-sides goals 24). `engineRev` is 12.
- **Season numbers** (6 coarse seasons / 2 fine seasons): goals 2.50 / 2.83; home wins 43% / 45%, draws 22% / 22%; shots 14.2 / 12.2 a team, 36% / 38% on target; fouls 10.5 / 10.4, yellows 1.97 / 2.13; corners 3.4 / 3.5; offsides 3.1 / 2.6; pass completion 77%; top scorer 15 to 28 goals; squad strength against final position 0.61 to 0.90.

**Step 7: tuning and swap-over (done; the owner's verdict: it feels good).**
- **7a, tuning.** Coarse steps now follow the ball's path, so a player meets it where it actually passed him (no ball through a player at half-second steps); coarse receivers stop just past the meeting point. The in-possession shape is wider and dead balls take longer. Home advantage comes from the crowd (17.13). Every rating is pulled 20% towards 65 before a match (`skillSpread`), as a 25-point gap between squads decided too many matches. Fouls are up 12% and keeper reach is 1.52 m. Pressing costs only the extra running (question 11, kept as it is).
- **7b, the swap-over.** The career plays every match on the spatial engine: the live match in fine mode, the rest in coarse mode on two Web Workers, with pre-simulation of the coming week. Replays, the 2D viewer, live 2D and golden matches are covered under 17.8 and 17.9. Saves are version 4, migrated from 2 and 3. A full season of the club's replays takes a save code from about 175 KB to 260 KB.
- **7c1, every match.** Season defaults (league and playoffs) are the spatial engine. The Stage 1 engine moved to `tests/helpers/stage1/` as a test-only stand-in (17.13). The slow season suite and its CI job are new (17.10). Unit tests have 20 s each on CI, where the runner is slower; this changes how tests are measured, not a performance budget.
- **7c2, chances spread out.** Strikers took 61% of shots, wingers 5%, one striker took 361 shots in a season, and top scorers reached 46 to 52 goals. Three changes: the marked-man and return-pass discounts (17.3), filling the box from central possession (17.4), and runners holding 1.5 m onside instead of 1 m, with passers reading the line to 1.5 m at vision 50 instead of 2.5 m. Shots were tuned back to target (coarse `shot.valueMul` 1.45, `errBase` 0.09). Strikers now take about 42% of shots, and the season's top scorer has 17 to 32 goals. `engineRev` is 10.
- **Season numbers** (6 coarse seasons / 2 fine seasons, playoffs included; targets in 17.10):
  - goals 2.70 / 2.82 a match; home wins 44% / 41%, draws 22% / 26%;
  - shots 14.2 / 11.8 a team, 36% / 38% on target; xG 1.51 / 1.31 a team;
  - pass completion 77%, passes 8 to 9 a minute;
  - yellows 1.71 / 1.88 and fouls 8.9 a team;
  - corners 3.0 / 3.1, offsides 3.1 / 2.7 a team;
  - squad strength against final position (rank correlation) 0.62 to 0.88.
- **Benchmarks (dev machine):** fine match 251-286 ms (budget 750), league week 694-744 ms (budget 1,000), season about 21-23 s (budget 31), 3 garbage collections a fine match (budget 20).

**Known gaps after step 7d** (the slow suite shows this red; it does not hold back the deploy):
- **7+ goal matches** are 1.0% in coarse but 3.5% in fine mode, against at most 2%. Almost all come from one of the two fine seasons (5.4%), where the champions scored a lot. Fine mode also beats its xG (2.83 goals from 2.70 xG a match, where coarse scores 2.50 from 2.98), so the watched match is a little more open than the background ones. Worth a look with more fine seasons in the balance pass (Stage 7).
- **Smaller misses inside test bounds:** centre-backs run 7.5 to 8 km (real 9 to 10); passes are 8 to 9 a minute (real 8 to 10); throw-ins are about 9 a team (real about 20); the ball is in play about 61 minutes (55 to 60).

**Step 6: systems hookup (done).**
- **Periods.** Two halves of 45 minutes, each with 1 to 6 minutes added (from goals, cards, subs, injuries and time-wasting), and the whistle waits for the ball to be safe. Cup ties level after 90 minutes play two halves of 15 minutes, then a kick-by-kick shootout: the named penalty taker first, then by set pieces plus composure, keepers last, five each then sudden death.
- **Substitutions** wait for the next dead ball (or half-time), five at most, and a queued one can be taken back. A sub comes on from the touchline by halfway. A keeper coming on while an outfielder is in goal goes in goal.
- **Fatigue** drains by what each player runs and sprints, scaled by stamina and weather, and lowers his attributes. Fine matches end at about 0.57 energy after about 11 km. A side pressing high with a fast tempo ends the hour only about 0.02 more tired than one sitting deep, because energy follows distance and the extra running is a few per cent (question 11).
- **10- and 9-man shapes** come from formations.json: a 4-3-3 down to ten becomes 4-4-1 (the holding midfielder goes), down to nine 4-3-1. A hurt player with no subs left moves up front.
- **The bridge** (`src/sim/spatial/bridge.ts`) puts the new engine behind the season's match API. A classic match state is kept in step with it, minute by minute, so the AI head coach, the commentary, the ratings and the match result work unchanged. The engine's logs become match events, the AI coach decides once a match minute for the sides it runs, and your tactics and substitutions become engine inputs. `simulateSpatialMatch` plays a whole match headless.
- **The MatchRunner** (`src/game/matchRunner.ts`) plays matches on two Web Workers and gives the results back in order. It sends each worker only the two clubs and the players named for the match. Where workers are missing or fail to start, it plays them on the main thread, one at a time, so nothing breaks. In Chromium a league week takes 0.44 s on two workers against 0.87 s on one thread, after a first run of about 1.1 s while the workers warm up. The results are identical either way.
- **Engine Lab: "Play a league week in the background"** plays week 1 of the lab's league on the workers, then again on the main thread, and shows both times, the scores and whether the results match. Tap it on your phone: it is the real-device check that the worker and the screen agree.
- **The career still uses the Stage 1 engine.** The swap (`prepareWeek` / `runWeek` / `settleWeek`, 17.8) comes in step 7 with the tuning.
- **Coarse against fine.** On league sides, 48 matches each: coarse 3.2 goals and 13 shots a team, fine 2.5 goals and 15 shots, with coarse having 22 throw-ins a team against fine's 5 and 7 offsides against 3 (real football is nearer 20 and 2). Earlier figures of 4 to 5 goals in coarse were small samples. Braking that never overshoots a spot at 0.5 s steps was tried and made it worse (4.7 goals, because defenders reached their spots later), so it was left out. Closing the gap is step 7 work, against the agreement test in 17.10.
- **Benchmarks (dev machine):** fine match 283 ms (budget 750), league week 679 ms (budget 1,000), season about 21 s (budget 31), 3 garbage collections a fine match (budget 20). A league week was about 420 ms at step 2; the budgets still hold, with less room than before.
- **Fixes on the way.** A set-piece taker with nobody in range held the ball for ever (it stalled whole coarse matches); now the nearest team-mate comes short, and after 4 s he plays it to anyone. Nobody is offside from a throw-in. The half-time whistle showed as minute 46. A scrambled goal with no shot is now a shot on target for the scorer. One save line named the keeper twice.

**Step 5: rules and set pieces (done).**
- **A referee** (`src/sim/spatial/rules.ts`) handles offside, fouls, advantage, cards, sendings-off, injuries and who takes each set piece. Every decision is logged as a match event (fouls, offsides, advantage, cards, penalties, injuries), with the player and the spot.
- **Offside.** Judged the moment a team-mate plays the ball. A player is offside if he is in the opponents' half, beyond the ball and beyond the second-last opponent (the keeper counts, so with the keeper up the pitch the two deepest outfielders set the line). Level is onside. Nobody is offside from a throw-in, a corner or a goal kick. It is only given if he then touches the ball before an opponent plays it: an indirect free kick where he stands. Passers read the line with an error (2.5 m at vision 50, none at 99), so better passers find runners who are just on.
- **Fouls.** Any tackle, loose-ball duel or aerial challenge can be a foul. Fouls are more likely from aggressive players, when the man on the ball dribbles better than the tackler tackles, and in midfield. They are less likely in the tackler's own box (`foul.ownBox`, which sets how many penalties there are) and when he is already on a yellow. Holding in the box as a corner comes in is called too, mostly against the attacker.
- **Advantage.** If the fouled side still has the ball somewhere promising, play goes on. If it loses the ball within 3 s, the free kick comes back.
- **Cards.** A yellow for 8% of front-on fouls, 15% from behind, and 50% of tactical fouls (from behind, stopping a counter or a player going forward in the attacking third). A second yellow is a red. Denying an obvious goal-scoring chance (through on goal, nobody but the keeper goal-side) is a red 85% of the time outside the box; inside it, it is a penalty and a yellow, as in the current laws. 0.4% of fouls are straight reds.
- **Sendings-off.** The player leaves the pitch and waits by the halfway line. If it is the keeper, the outfielder best in goal takes over. The most advanced player drops into the spot left empty if it is deeper than his. The side plays on with ten. Proper 10- and 9-man shapes come in step 6.
- **Injuries.** Any challenge can hurt someone: 0.08% per challenge, doubled for a foul, and more for players with low durability. Play stops for 45 s, then the side that had the ball restarts with a dropped ball. Until substitutions arrive in step 6, the injured player stays on at 70% of his top speed.
- **Set-piece takers.** The taker named on the tactics screen takes every penalty, every free kick within 35 m of goal and every corner while he is on the pitch. Otherwise it is the best at set pieces (with crossing for corners and composure for penalties). Throw-ins go to the full-back on that side in our half or the wide player in theirs. The keeper takes free kicks in his own box.
- **Free kicks.** Within 35 m of goal it is a set piece (a 38 s wait). The wall is 2 to 5 players, by distance and angle, 9.15 m away. He shoots if he is within 30 m and the chance is worth at least 7% (curve in `freeKick.xgVal`, better for good takers). Otherwise he crosses into the box from within 40 m of the goal line, or passes. A shot can hit the wall (less often for good takers) or beat it, in which case the keeper sees it late. Further out, free kicks are taken quickly (14 s).
- **Penalties.** From the spot, with everyone else outside the box and the arc. The taker picks a corner; the keeper guesses a side 85% of the time and leans that way. About 7 in 10 go in.
- **Corners.** 4 to 6 attackers go up by mentality, best headers first, into set zones: near post, far post, six-yard box, penalty spot and edge of the box. The rest stay back.
- **Crosses and box play** (changes to step 4):
  - Box runners now time their runs: when the cross is struck each one is already going at 60% of top speed.
  - A defender near the crosser can block the cross, often out for a corner or a throw-in.
  - An attacker in the box who doesn't go for goal knocks it down towards goal instead of cushioning it.
  - A tackle near a touchline or the goal line often knocks the ball out.
  - A pass that clips an opponent deflects off him and keeps some of its pace.
- **Keepers set themselves.** With the ball within 30 m of his goal, a keeper moves to his spot at up to 5 m/s (`keeper.setSpeed`). Before, he used the outfield walking pace for short distances, so after a cut-back he was left stranded: foot shots soon after a cross went in 51% of the time and he saved 13%. Now it is 39% and 23%, and fine-mode goals fell from 4.2 to 3.9 a match.
- **Own goals.** A defender who meets a cross or a low ball within 12 m of his own goal can turn it in, more often with low composure.
- **Ball in play** is now counted.
- **Engine Lab.** A list of the latest cards, penalties and injuries; rows for crosses, fouls, offsides, free kicks, penalties and cards; a "booked" note on the selected player. Sent-off players leave the pitch view.
- **Numbers** (even 65-rated sides; targets from 17.10 in brackets):
  - Fine, 40 matches: 3.95 goals a match (2.4 to 3.1), xG 4.7, 16.8 shots a team (9 to 16). Fouls 10.9 a team (9 to 15), offsides 1.4 (1 to 4), yellows 3.95 a match (3.5 to 4.5), reds 0.20 (0.1 to 0.2), penalties 0.33 (0.25 to 0.35), injuries 0.15 (0.10 to 0.35). Corners 1.4 a team (3 to 7), throw-ins 5 a team, crosses 6 a team. Ball in play 69.5 minutes (55 to 60). 1,227 passes a match (800 to 1,100), 79.7% completed (70 to 88).
  - Coarse, 80 matches: 3.61 goals a match, 12.2 shots a team. Fouls 13.1 a team, offsides 5.1 (1 to 4), yellows 4.7, reds 0.25, penalties 0.26, injuries 0.25. Corners 1.0 a team, throw-ins 24 a team. Ball in play 61 minutes. 929 passes a match, 78.9% completed.
- **Speed.** A fine match takes about 236 ms (budget 750 ms) and a league week about 604 ms (budget 1 s), so a season is about 18.5 s (budget 31 s). A fine match causes 3 garbage collections (budget 20).
- **New tests** (`tests/spatial.test.ts`): every offside case (beyond the line, level, a backward pass to a man beyond the line, own half, keeper out of goal so the two deepest outfielders set the line, throw-ins, corners and goal kicks, and the call itself); the named taker takes every penalty, free kick near goal and corner, and strikes every set-piece shot; no keeper ever handles a pass or clearance from a team-mate (both modes); a sent-off player never touches the ball again and stays off the pitch, and a sent-off keeper is replaced in goal; foul, card, offside, penalty, injury and corner rates within broad bounds, with the stats matching the event list; and the same seed gives the same events.
- **Test changes, reported as measurement changes, not looser targets:**
  - The finisher test compares open-play goals with open-play xG. Penalties and free kicks are taken with the set-piece rating, not finishing, so they only blurred it. The finisher and keeper tests now run 16 matches each instead of 10, with the same thresholds: 10 matches could no longer tell the effect from luck. Over 60 matches, good finishers (88) score 1.22 times their xG and poor ones (38) 0.76; a good keeper concedes 0.35 goals per shot on target, a poor one 0.49.
  - The whole-match sanity test skips sent-off players, and only checks a keeper's distance if he started in goal.

**Known issues after step 5** (rechecked in the step named):
- **Too many goals.** 3.95 a match in fine and 3.61 in coarse, against 2.4 to 3.1. A shot is about as likely to go in as in real football (about 1 in 10 from open play); the problem is that there are too many good chances (4.7 xG a match in fine, against a real 2.6 or so). Play is too central: the ball spends only about 3% of the time in the outer 7 m of the pitch, and wide players stay about 10 m in from the touchline. So defences get opened up through the middle, and there are few corners, throw-ins and crosses. Set pieces now add their real share on top (penalties alone are about 0.25 goals a match). Step 7.
- **Too few corners and throw-ins, too much ball in play.** In fine mode there are 1.4 corners and 5 throw-ins a team, against about 5 and 20. The ball is in play for 69.5 minutes (55 to 60). This is the same central play. Step 7.
- **Too many passes in fine** (1,227 a match against 800 to 1,100), the tight pressing from step 4. Step 7.
- **Coarse mode runs hot on the referee:** 5.1 offsides a team, 4.7 yellows and 0.25 reds. Half-second steps probably let runners drift further past the line between decisions, and the coarse receiver overshoot (step 4) puts more balls out for throw-ins (24 a team). Step 6, with the coarse fixes.
- **Results.** No home advantage yet, and fine draws were only 10% in 40 matches (coarse: 27.5% in 80). Step 7.
- **Own goals** are noisy (0 to 0.18 a match against about 0.1). Step 7.
- **Injured and sent-off players.** Injured players can't come off and ten men keep their eleven-man shape minus one until substitutions and the AI coach arrive in step 6.
- Step 4's worry about tackling in the box giving away too many penalties is settled: penalties are 0.26 to 0.33 a match.

**Step 4: attacking and shooting (done).**
- **Shooting is an option like any other.** The man on the ball weighs a shot against his passes and carries (`src/sim/spatial/shot.ts`). He shoots when the chance is worth at least 3.5% in the box or 2.5% outside it, from no further than 35 m. A good finisher (75 or more) in an attacking mentality (4 or 5) takes chances down to 2%. A shot's value is its xG less what a defender in the lane is likely to block, plus a small bonus that grows with mentality.
- **Expected goals (xG).** Each chance is valued from a curve by distance to the centre of the goal (`shot.xgDist`/`xgVal`: 0.55 at 2 m, 0.22 at 11 m, 0.05 at 20 m), times how much of the goal the shooter can see compared with standing straight in front of it. A header is worth 0.6 of that, and a shot with a defender within 1 m 0.7. xG is only the label: nothing rolls a dice on it.
- **Goals come from the ball's flight.** When the ball is struck its whole flight is worked out (`planShot`). The shooter aims inside a post, low or high, with aim error that grows with poor finishing, pressure within 3 m and headers. Defenders who can get a body into the line in time block it, after a short reaction. The keeper reaches 1.15 m standing, plus a 5 m/s dive once he has reacted (faster with better reflexes), with less reach high up. His handling decides whether he holds the ball or parries it, and a parry can drop for a rebound. Shots can hit the woodwork and bounce back into play. Better finishers convert more of their chances and better keepers save more; tests check both.
- **Keepers come out one on one.** A keeper who sees a runner through on goal with nobody goal-side of him comes off his line to narrow the angle, stopping short of the runner.
- **Runs in behind** (`src/sim/spatial/attack.ts`). A player on the shoulder of the last defender runs in behind when the man on the ball is free and facing forward. Better work rate means he goes more often. At most two run at a time, each run lasts about 2.5 s, and the next waits 4 s.
- **Filling the box and crosses.** When the ball is wide and deep, 2 to 5 players (by mentality) attack the near post, far post, penalty spot, cut-back and edge of the box. Crosses are flatter lofted passes that land just beyond the runner, so he meets them at head height. Defenders head crosses away from their own box.
- **Defending near goal.** Within 30 m of its own goal a side always closes the ball down, whatever the pressing dial says. Defenders pick up runners tightly in and around the box, a step goal-side and shaded towards the ball so they reach a pass first. The back line holds against runners still in front of it, drops with those who go past, and keeps goal-side of the ball once it is in the box. The block gets shorter and narrower when defending the box, and the midfield drops into it. Midfielders stay goal-side of the ball. A side that loses the ball now reshapes in about 2.5 s (5 s after winning it; it was 7 s both ways), and players drop back in step with how far out of position they are.
- **Tackling in the box.** In his own box a defender commits to the tackle (4.5 times as willing, `tackle.boxMul`) because nobody is behind him. Fouls arrive in step 5, so this needs a second look then: it could give away a lot of penalties.
- **Dead balls (some are stand-ins).** A goal puts the ball in the net, and the side that conceded kicks off. The ball going over a goal line gives a goal kick or a corner. Over a touchline it gives a throw-in to the other side from whoever touched it last. Each restart waits a realistic time: 55 s for a kick-off (the celebration), 25 s for a goal kick, 32 s for a corner and 12 s for a throw-in. The ball stays where it went out for 3 s before it is put on the spot. Corners and throw-ins are simple stand-ins until step 5. For a corner, the nearest attacker plays on from the flag with opponents 9.15 m away. For a throw-in, the nearest outfielder can only pass, to a team-mate within 25 m, and can't be tackled while he does. Own goals go to the defender. An assist goes to whoever played the scorer in.
- **Tested along the path, not just at the end of a step.** Blocks, saves and touches on a shot are checked along the ball's path within each step, so the half-second steps of coarse mode don't skip them.
- **Fine and coarse aligned.** In fine mode the man on the ball now decides every 0.5 s (was 0.4 s), a player off the ball decides early at most once a second, and a first touch takes 0.5 s (was 0.3 s), the same as coarse. This brought the two modes' shot and goal numbers close together.
- **Engine Lab.** The score is in the top bar. A GOAL banner shows for 3 s with the scorer, assist and xG, and a goals list and a shot map overlay (size = xG, filled = goal) are added. A label says which restart is coming. Stats now show shots, on target, blocked, xG, corners and throw-ins. New rings show runs in behind (green) and players attacking the box (pink).
- **Numbers** (even 65-rated sides; real football in brackets):
  - Fine, 24 matches: 2.83 goals a match (2.4 to 3.1) and 15.6 shots a team (9 to 16). 67% of shots come from inside the box (about 60%), 40% are on target (about 33%) and 28% are blocked (about 25%). Goals run at 0.73 of xG.
  - Coarse, 80 matches: 3.04 goals a match and 12.1 shots a team. 69% of shots come from inside the box, 43% are on target and 23% are blocked. Goals run at 0.92 of xG.
  - Results: even sides show no home bias. 60 fine matches went 24 home wins, 15 draws and 21 away wins; 150 coarse matches went 51, 48 and 51. There is no home advantage yet, which is a step 7 job.
- **Speed.** A fine match takes about 209 ms (budget 750 ms) and a league week about 649 ms (budget 1 s), so a season is about 20 s (budget 31 s). A fine match causes 3 garbage collections (budget 20).
- **Test changes, reported as measurement changes, not looser targets:**
  - The pressing test now counts only open play outside the danger zone, because near goal everyone presses by design.
  - The man-marking test measures from 2 s after a change of possession, when the marker has had time to get back to his man. Once settled he is about 2.4 m away.
  - The pass-rate bound is now 9 to 19 a minute (was 12 to 19). Dead balls now take up time, and coarse matches sit at about 12.
  - The distance cap is 17.5 km (was 16.5), because the busiest outfielder runs about 16.5 km. Steps 6 and 7 bring this down and tighten it.

**Known issues after step 4** (rechecked in the step named):
- **Too few throw-ins in fine matches.** Fine matches have about 12 throw-ins against real football's 40 to 50; coarse matches have about 48, for the wrong reason (next item). Real throw-ins mostly come from tackles, blocks and headers knocking the ball out near the touchline, which step 5 adds.
- **Coarse receivers overshoot.** In half-second steps, a player running onto a pass can go past the meeting point before the ball arrives and can't turn back in time, so passes to wide players run out of play. Coarse passing is also slower than fine (about 2.6 s from pass to control, against 1.7 s). The cause: a receiver plans to brake harder (8 m/s²) than he can actually slow down (about 4 m/s²). Fixing that is step 6 work (coarse mode). It changes fine play too, so the step 3 and 4 numbers will be rechecked.
- **Pressing is tight.** About 77% of passes are played with an opponent within 2.5 m, which is part of why there are about 15.7 passes a minute in fine (real: about 10). Step 7.
- **Distance run.** About 13 km per outfielder (real: 10 to 11). Fatigue in step 6 and tuning in step 7.
- **Few corners and headers.** About 1 corner a team (real: about 5), and about one headed shot a match. Real corners and set pieces arrive in step 5.
- **Too many shots on target** (40 to 43%, against about 33%), and too many goals are assisted (88-95%, against about 75%). Step 7.

**Step 3: passing and possession (done).**
- **Real on-ball play.** The ball script is gone (`src/sim/spatial/onball.ts` replaces it). The man on the ball scores his options (short, long, through and switch passes, a carry, or holding the ball) by how much each one improves the team's position, minus the risk of losing it. He picks the best one with a little noise, more noise when he is tired or pressed. He only sees passes inside his field of view, which comes from his vision rating and how recently he scanned. To save time he scores his best few options in detail (5 in fine mode, 3 in coarse) and skips the rest.
- **Tactics nudge choices.** Directness favours long passes over short ones and tempo shortens how long players hold the ball (`decision.tacticBonus`, raised from 0.15 to 0.3 so the dials are clearly felt). At default settings patient, short passing (tempo 1, directness 1) keeps about 52-56% of the ball and completes 86-88% of passes; direct, quick play (5, 5) completes 82-83%.
- **Passing error.** Every pass has aim and length error from the passer's passing rating and the pressure on him. Lofted passes are less accurate. Passes can be cut out by any player who reaches the line in time, including the intended receiver's marker stepping in front of him. Players block passes with their body, and a carrier is blocked by defenders in his path.
- **Controls, tackles and loose balls.** Receiving a fast ball under pressure can spill it loose (first touch, chest and head each have their own chance). Defenders tackle more readily front-on than chasing from behind, and pressers go in more readily still; tackles win the ball, poke it loose or get beaten, from tackling against dribbling. Loose balls are chased by the players who can reach them first. Keepers claim balls within hand reach in their area.
- **Shape changes.** The focus point now moves at up to 4 m/s and eases over 2 s, so shapes shift smoothly when the ball travels fast. The defending back line follows the ball's depth, not just the focus point. Out-of-position players run back goal-side when the ball goes the other way. Defenders zonally pick up runners near their own goal, tighter the nearer the runner is to goal and the better a marker the defender is. Possession changes blend each player's spot over about 7 s rather than snapping. Players walk, jog, run or sprint depending on how far they are from their spot (gait bands in `move`).
- **Stand-in shots.** Shooting arrives in step 4. Until then, a side that carries or passes into a zone near goal gets a "shot (stand-in)" counted and the keeper takes the ball. Box entries count possessions that reach the penalty area.
- **Speed work.** Coarse mode now steps every 0.5 s instead of 0.25 s (17.11's first fallback), saves position frames at 2 per second, and lets a player off the ball decide early at most once a second. Other speedups that don't change any results: separating players with a sweep along the pitch instead of checking every pair, working out facing only when needed, skipping square roots where a squared distance answers the question, and only checking tracking for players who could be tracking. Dev machine: a fine match takes about 194 ms (budget 750 ms) and a league week about 550-610 ms (budget 1 s), so a season is about 17-19 s (budget 31 s). A fine match causes 3 garbage collections (budget 20).
- **Simplifications.** No dead balls yet: passes and carries are aimed inside the lines, nothing is given if a loose ball crosses one, and there are no throw-ins, goal kicks, corners or fouls until step 5. No real shots or goals until step 4. Headers are a simple control check, not aimed.

**Known issues after step 3** (rechecked in step 7 tuning):
- **Distance run.** Outfielders cover about 13.5 km, more than the real 9-13 km, because the ball never goes dead. Rechecked in step 5.
- **Box entries and stand-in shots are high** (about 55 box entries and 38 stand-in shots a side in a match). The stand-in zone is generous on purpose, so step 4 has plenty of chances to turn into real shots.
- **Better sides keep only a little more of the ball.** A 70-rated side against a 60-rated one has about 51-52% possession (75 against 55: about 53%), though it completes more passes. Real gaps are wider; step 7 tunes this.
- **Coarse and fine differ.** Coarse matches have about 15 passes a minute against about 18 in fine. Parity is a step 7 target.
- **Phone speed.** A coarse match takes about 70-80 ms of dev time, so a league week on a mid-range phone (×4) is about 2.2-2.6 s against the 2.0 s budget. The CI limit still passes. Ways to close the gap: a second worker (halves it), simulating the next week's other matches in the background while the owner is on menus, or a short progress bar on "Next week".

**Step 2: shape and movement (done).**
- **The ball follows a script.** There are no real passes, shots, goals, halves, stoppage time or dead balls yet. A temporary driver (`script` in `src/data/tuning/spatial.json`) moves the ball around and swaps possession so that shapes, pressing and runs can be judged. Step 3 replaces it with real on-ball decisions.
- **Focus point.** Team shapes follow a smoothed "focus point" that eases towards the ball (or where a pass is heading) over about 1 s, rather than the ball itself, so the block slides instead of jerking. The offside cap still reads the real ball.
- **Distance run.** Outfielders cover about 14 km a match, roughly 25% more than real players. Expected: there are no stoppages yet, and the scripted ball never rests. Rechecked in step 5.
- **Deep centre-backs.** With the defensive line at 1 and the ball at 57 m in possession, centre-backs sit about 26 m from their own goal. Believable for a low block, but on the deep side; flagged for step 7 tuning.
- **No new objects in the main loop.** Pressing reuses its arrays, so a fine match triggers no garbage collections in Node.
- **Benchmarks run on a bundled build.** Vitest's import transform makes the engine about six times slower than in a browser, so the benchmark test bundles `tests/bench/spatialBench.ts` with Vite and runs that. Node-only helpers live in `tests/helpers/node.mjs` (the project has no Node types). Dev machine: a fine match takes about 105 ms (budget 750 ms) and a league week about 420 ms (budget 1 s), so a season is about 13 s (budget 31 s).
- **No lint tool.** The project has no ESLint, so the determinism ban is enforced by a test that scans the engine files.
- **Engine Lab** (`#engine-lab`, linked from the title screen) is the 2D top-down viewer from Stage 4.5 §5: both teams as numbered dots in kit colours, play/pause, 1-8× speed, a one-minute skip, tap a player to follow him, and either side's formation, mentality, pressing, line, width, counter-attacks and man-marking changeable live. Overlays show pressing, cover, marking and counter runs, each back line and its aim, shape spots and movement. The watched match runs on the main thread; "Play a league week in the background" (step 6) checks the worker pool against it. `#engine-lab/<seed>` fixes the league seed so a match can be reported and replayed.
