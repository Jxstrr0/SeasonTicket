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
  - **Capital District:** Kingsbridge.
  - **Eastern Shore:** Port Alder, Cape Fenwick, Saltwater Cove.
  - **Rivière Valley:** Sainte-Rivière, Val-Delacroix.
  - **Lakelands:** Lakehaven, Westmere, Blackwater.
  - **Iron Belt:** Stonegate, Fort Sterling.
  - **Highlands:** Silverpeak, Coldbrook, Northolt.
  - **Western Plains:** Prairie Junction, Grandview.
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
| Kingsbridge City FC | the Monarchs | Kingsbridge | Capital District |
| Port Alder Athletic | the Mariners | Port Alder | Eastern Shore |
| Cape Fenwick United | the Gulls | Cape Fenwick | Eastern Shore |
| Saltwater Cove FC | the Orcas | Saltwater Cove | Eastern Shore |
| Olympique Sainte-Rivière | les Voyageurs | Sainte-Rivière | Rivière Valley |
| Racing Val-Delacroix | les Rouges | Val-Delacroix | Rivière Valley |
| Lakehaven United | the Loons | Lakehaven | Lakelands |
| Westmere Wanderers | the Wranglers | Westmere | Lakelands |
| Blackwater Rovers | the Wolves | Blackwater | Lakelands |
| Stonegate Ironworks FC | the Ironsides | Stonegate | Iron Belt |
| Fort Sterling FC | the Sentinels | Fort Sterling | Iron Belt |
| Silverpeak Alpine | the Yeti | Silverpeak | Highlands |
| Coldbrook Town | the Huskies | Coldbrook | Highlands |
| Northolt FC | the Aurora | Northolt | Highlands |
| Prairie Junction FC | the Threshers | Prairie Junction | Western Plains |
| Grandview SC | the Grizzlies | Grandview | Western Plains |

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
- **Highlights engine.** The sim plays the match minute by minute with tactics, fatigue, chances, goals, cards and subs. You watch key moments with a live match feed, rather than a continuous 90-minute simulation.
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
- Highlights match engine (not a continuous 90-minute simulation).
- A fictional country with no real-world tie.

Decided during development (the owner can veto any of these):
- The country is called **Valmere**; club names, nicknames and regions are as listed in section 4.
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

Match engine simplifications (Stage 1):
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

---

## 16. Open items (decide during development)

- Starting cash, debt and squad quality per difficulty tier.
- The stadium upgrade catalogue and costs.
- Wage cap level, luxury-tax rates and the typical fee range for a star.
- Youth intake size by academy level.
- Which tactical presets ship for the concept test.
- The exact owner's fortune per difficulty tier, and whether it grows over time.
