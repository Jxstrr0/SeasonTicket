# Stage 4.5 sketch notes (appendix to DESIGN.md section 17)

**What this is:** the appendix to `docs/DESIGN.md` section 17. It holds the detail that section 17 points to: (A) starting values, (B) what the throwaway sketch measured, (C) how the tests and the tuning lab work, and (D) the formulas. Every value is a starting value for `src/data/tuning`. Nothing here is a final number, and everything is fictional.

Words used below: **depth** is metres from a team's own goal line (0 to 105), **across** is metres from its left touchline (0 to 68). "Attribute ÷ 99" turns a 1-99 attribute into a 0-1 share.

---

## A. Detailed starting values

### A1. Restarts and ball in play

| Restart | Seconds dead | Typical count a match | Total |
|---|---|---|---|
| Throw-in | 12 | 45 | 540 s |
| Goal kick | 20 | 16 | 320 s |
| Free kick, no wall | 20 | 20 | 400 s |
| Free kick with a wall | 38 | 8 | 304 s |
| Corner | 35 | 10 | 350 s |
| Goal and kick-off | 65 | 2.7 | 176 s |
| Substitution (on top of the stoppage it uses) | 20 | 7 | 140 s |
| Injury | 45 | 1.5 | 68 s |
| **All dead time** | | | **about 2,300 s = 38 min** |

A 96-minute match (90 plus about 6 added) then has about **58 minutes in play**. The lab holds it between 55 and 60 by adjusting these delays, since real counts vary by team.

**Time-wasting** adds 0 / 2 / 4 / 7 / 10 s to each of the time-waster's own restarts (dials 1 to 5). The opponents' restarts are not slowed.

**Time-wasting bookings.** At dial 4 each own restart risks a booking 1.5% of the time, and at dial 5 3%. A team has about 50 own restarts a match, about one every 2 minutes.
- The AI coach protects a lead from minute 78 at dial 4. That is about 9 restarts, so a booking comes about 13% of the time (9 × 1.5%).
- At dial 5 for a whole match the team would collect about 1.5 bookings, a real cost for overdoing it.
- A keeper holding the ball over 8 s risks a booking 3% per extra second.
- Today's engine books at 3% per wasted minute, so these numbers are in the same range.

**Stoppage time** adds 30 s per goal, 20 s per sub, 45 s per injury, 15 s per card and all the time-wasting seconds, within 1-6 minutes a half and 0-2 in each extra-time half.

### A2. The live clock

| Text speed | ms per match minute | Times real time | Engine stays ahead by | One chunk |
|---|---|---|---|---|
| Slow | 700 | about 85x | about 43 match seconds | about 8.5 match seconds |
| Normal | 350 | about 170x | about 86 match seconds | about 17 match seconds |
| Fast | 120 | 500x | about 250 match seconds | 50 match seconds |
| 2D viewer, 1x to 8x | — | 1x to 8x | 1 to 4 match seconds | 1 match second (the minimum) |

- The look-ahead is 0.5 real seconds of display time, and a chunk is a tenth of a real second's worth, but never less than 1 match second, because changes apply on whole seconds. In the text feed that makes about 10 messages a second from the worker.
- The worker keeps a snapshot at the start of each chunk. A change throws away everything after the displayed second, goes back to the snapshot before it, replays to that second (same seed, same result), then applies the change.
- **Cost at 500x:** 8.3 fine minutes a real second × about 1.8 ms a minute on the dev machine × 4 for a phone = **about 60 ms of work a real second**, about 6% of one phone core.

### A3. When players rethink

| Who | Fine | Coarse |
|---|---|---|
| The man on the ball | every 0.2 s | every 0.4 s |
| Players within 30 m of the ball | every 0.3 s | every 0.6 s |
| Everyone else | every 1 s | every 1.5 s |

Rethinks are staggered so not everyone thinks on the same step. Some events trigger an extra rethink:
- The man on the ball rethinks as he receives it and whenever a defender closes within 2 m.
- Everyone rethinks at once after a pass, a turnover or a restart.
- A tactics change makes all 11 players on that team rethink at the second it applies.

### A4. Team shape

**Out of possession**
- **Back line height** with the ball at halfway: 24 / 30 / 36 / 42 / 48 m (line dial 1 to 5). It moves 0.4 m for every metre the ball moves in depth and stays between 6 and 58 m.
- **Goal-side gap:** the line stays at least gap = 0.4 × ball depth (our goal to the ball), kept between 4 and 15 m, behind the ball. With the ball 20 m out the gap is 8 m; at 37.5 m or further it is 15 m.
- **Defending the box:** with the ball within about 25 m of our goal, the line holds at 11-14 m. Defenders drop deeper only to attack a cross aimed at the six-yard box.
- **Open or closed ball:** if the passer is free and facing forward, the line drops 3-6 m. If he is pressed, facing his own goal or playing it back, the line steps up 3-5 m together.
- **Reaction time:** each defender reacts to a line move after 0.6 − 0.4 × (positioning + marking) ÷ 198 seconds, that is 0.2 s at best and 0.6 s at worst.
- **The block** is about 30 m long and 36-42 m wide, with the lines 10-14 m apart. Its centre across is 34 + 0.6 × (ball across − 34), so the far winger tucks in.
- **Mentality** moves the whole block −6 / −3 / 0 / +3 / +6 m. The players kept behind the ball and those attacking the box are 6+2 / 5+2 / 5+3 / 4+4 / 3+5.

**In possession**
- **Back line** = line height + 0.5 × (ball depth − 52.5) + mentality shift, kept between 18 and 58 m.
- **The block** stretches to 45-55 m long and slides only 0.3 toward the ball, keeping the far side wide for a switch.
- **Width** between the widest players is 42 / 48 / 54 / 60 / 64 m.

**Blending.** After the ball changes hands, each player's spot moves from the old phase's spot to the new one over 5 s, in a straight line.

**Pressing**

| Press dial | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Press starts with the ball within this of our goal | 35 m | 45 m | 55 m | 70 m | anywhere |
| Engages a carrier within | 4 m | 6 m | 8 m | 11 m | 14 m |
| Players who go | 1 | 1 | 1 + cover | 2 + cover | 3 |
| Chases for up to | 2 s | 3 s | 4 s | 6 s | 8 s |
| Counter-press after losing the ball | none | 2 s | 3 s | 5 s | 6 s |

- **Press triggers** stretch the engage distance 1.5 times and send one more player. They are:
  - a back pass of 5 m or more;
  - a heavy touch running 1.5 m away;
  - a receiver facing his own goal;
  - a ball in the air for over 1 s, or rolling slower than 5 m/s.
- **The touchline** within 8 m of the ball counts as an extra defender. The presser comes from inside and shows the carrier down the line.
- **Cover shadow:** the presser curves his run so the most dangerous inside pass is behind him.
- **The midfield** follows the pressers half the way.
- **Counter-attack on:** after a win, the front 2-3 players sprint into the channels for 5 s. Forward passes in that window get a bonus (D1).
- **Man-marking:** the marker is the player whose slot is nearest the target's usual zone. He stays 1-2 m goal-side of his man, in our half and up to 15 m past halfway.

### A5. Movement

| | Starting value |
|---|---|
| Top speed | 7.2 + 2.3 × pace ÷ 99 m/s (7.2 to 9.5) |
| With the ball | 85% of top speed |
| Acceleration | 3.0 to 4.5 m/s², by pace |
| Turn of over 90° | speed drops to 40% for a moment |
| Walk / jog / run | 1.5 / 3.5 / 5.5 m/s; "sprint" means faster than 5.5 m/s |
| Player size | a 0.4 m circle; players push apart when closer than 0.8 m, except the chosen receiver or interceptor |

### A6. On the ball

**Vision.** He sees team-mates up to 20 + 0.35 × vision metres away: 34 m at vision 40, 55 m at 99.
- Through balls over 20 m need vision 55 or more.
- A switch of play over 35 m needs vision 65 or more.
- Without a scan in the last 1.5 s, he sees only the 200° in front of him. Players scan every 2-4 s, more often with more vision.

**The threat map** is a grid of 5 m squares, 21 long and 14 wide. Each square holds the chance that a possession from there ends in a goal.

| Area | Threat |
|---|---|
| Our own box | 0.003 |
| Our half | 0.006 to 0.010 |
| Middle third | 0.012 to 0.020 |
| Final third | 0.03 to 0.06 |
| Edge of the box | 0.08 |
| Inside the box | 0.12 to 0.25 (penalty spot 0.25, the cap) |

The value is then × 0.6 if the receiver faces his own goal under pressure, × 1.0 facing forward in space, × 1.2 free behind the line. The lab later re-fits the map from the engine's own matches.

**xG straight on**, by distance from the middle of the goal (in between, it is read off a straight line between the two nearest values):

| 6 m | 11 m | 16 m | 20 m | 25 m | 30 m |
|---|---|---|---|---|---|
| 0.38 | 0.22 | 0.09 | 0.05 | 0.03 | 0.02 |

Beyond 30 m it keeps falling (about 0.012 at 35 m), so no open-play shot clears the bar from there.

- **Angle:** multiply by the share of goal he can see, which is (his distance from the goal line) ÷ (his distance to the middle of the goal). Straight on it is 1. Near the byline, 6 m from goal, it is about a third. The minimum is 0.1.
- **Header** × 0.6; a defender within 1 m × 0.7. Blockers and the keeper's position are not in xG; they stop shots physically.

**The shot bar.** He shoots when the shot scores better than his best pass and its xG clears a bar:
- **Inside the box:** 0.035.
- **Outside the box:** 0.025. It drops by 0.0025 for finishing 75 or more and by 0.0025 at mentality 4 or 5, so it reaches 0.02 with both.
- **What that means on the pitch:** straight on, an average player shoots from up to about 27 m. A good finisher in an attacking team shoots from up to 30 m, and nobody shoots from further. The lab checks that 30-40% of shots come from outside the box.

**Direct free kicks** use their own curve for an average taker (set pieces 60), central:

| 18-20 m | 22 m | 25 m | 28 m | 30 m |
|---|---|---|---|---|
| 0.08 | 0.07 | 0.06 | 0.05 | 0.04 |

- **Taker:** multiply by (0.4 + set pieces ÷ 100), so ×1.39 at 99 and ×0.8 at 40.
- **Angle:** multiply by the same goal-share as above.
- **Shoot or deliver:** within 30 m he shoots if the result is 0.04 or more. Otherwise he crosses (wide, within 40 m) or plays it short or long.
- **The wall is not counted twice.** It blocks the ball physically and is not applied to this number.

**Walls** stand 9.15 m back, 2.2 m tall with the jump.

| Free kick | Players in the wall |
|---|---|
| Central, 18-25 m | 4-5 |
| Central, 25-30 m | 3 |
| At an angle | 2 |
| Wide | 0-1 |

### A7. Ball, control, weather and deflections

**Flight.** Rolling, the ball slows by 1.8 m/s² on a dry pitch. In the air, drag is 0.010 per metre with no spin (carry table in D7).

| Ball | Speed | Height |
|---|---|---|
| Short ground pass, 10-20 m | 9-14 m/s | ground |
| Driven ground pass, 20-35 m | 15-20 m/s | ground |
| Through ball | 12-18 m/s, weighted to die near the target | ground |
| Clipped over a line | 14-18 m/s | peaks 3-5 m |
| Long ball, 40-55 m | 24-30 m/s | struck about 35° up |
| Whipped cross | 22-28 m/s | peaks 2-4 m |
| Floated cross | 18-22 m/s | peaks 5-8 m |
| Goal kick, 50-62 m | 28-33 m/s, by kicking | struck 35-40° up |
| Shot | 20-32 m/s | aimed at a point in the goal |
| Clearance | 22-30 m/s | 30-45° up |

A bounce keeps half its upward speed and 70% of its forward speed.

**Control heights.** A player can play a ball within 1.0 m of him.

| Ball height | How he plays it | How often it runs loose |
|---|---|---|
| Below 1 m | foot | 4-18%, by ball speed, pressure, dribbling and composure (D5) |
| 1 to 1.5 m | chest or thigh | 1.5 times the foot figure, plus up to 10 points more for low dribbling and composure |
| Above 1.5 m | head only | reach up to 2.3 + 0.4 × (heading + strength) ÷ 198 m |

When two players arrive within 0.3 s of each other, it becomes a duel. When two go up for a header, heading, strength and timing decide who wins it.

**Weather**, set once per match:

| Weather | Rolling slows by | Loose touches | Other |
|---|---|---|---|
| Clear | 1.8 m/s² | as normal | — |
| Rain | 1.5 m/s² (the ball skids) | ×1.25 | injuries ×1.1, energy use ×1.05 |
| Wind | 1.8 m/s² | as normal | a steady push of up to 0.6 m/s² on balls in the air, one direction all match; lofted landings 1 m less accurate |
| Heat | 1.8 m/s² | as normal | energy use ×1.25, injuries ×1.05 |
| Snow (heavy pitch) | 2.6 m/s² | ×1.3 | injuries ×1.15, energy use ×1.1 |

**Deflections**, decided at the strike. For a shot or cross, every opponent whose body is within 0.5 m of the ball's path, and who can be there in time, is a possible block. The first one in the path decides it:
- About 70% of the time it is a block. The ball loses most of its speed and drops loose 1-4 m from him, or (35% of blocks, `block.behindShare`) goes behind or wide. Most corners from blocks come from here.
- Otherwise it grazes him. Its direction turns 5-15° (at most 25°) and it keeps 60-90% of its speed. If it ends up on target, the keeper's reaction starts again.

If the last touch before a goal was a defender's and the shot was not already on target, it counts as an **own goal**. Miscued clearances under pressure (miss spread × 1.5 with low composure) and back headers add the rest. The target is 0.08-0.12 own goals a match.

### A8. Goalkeeper

- **Spot:** always on the line from the ball to the middle of his goal. How far off his line he stands:
  - ball within 16 m of goal: 1-2 m off;
  - ball within 25 m: 1-3 m;
  - otherwise 0.4 × back-line height − 2 m, kept between 2 and 20 m. That is about 8 m out behind a deep line and 17 m behind a high one.
- **One against one:** an attacker is through when he has the ball within 25 m with no defender goal-side within 3 m of his path. The keeper then comes out along the line towards him, to 0.35 of the way to the ball, but no closer than 4 m to the attacker. So he narrows the angle as the attacker comes in without being chipped from 20 m. His timing error is up to 0.4 × (1 − keeper positioning ÷ 99) s, so good keepers time it better.
- **Sweeping:** he takes balls over the top if he gets there first. He clears outside the box and gathers inside it.
- **Crosses:** he claims a cross if the drop point is within 6 + 4 × (keeper positioning + handling) ÷ 198 m of goal and he can reach it before it falls below 2.6 m. Every body in his way lowers his chance.
- **Saves:** he reacts after 0.24 − 0.12 × reflexes ÷ 99 s (0.18 s for an average keeper). He reaches 2.2 m standing, and a dive covers 3 m in 0.6 s (5 m/s).
- **Hold or parry:**
  - He holds a shot he reaches with chance 0.3 + 0.6 × handling ÷ 99, minus 0.02 for each m/s the shot is faster than 20 m/s.
  - If he does not hold it, low shots (under 0.5 m) are pushed wide at 30-50% of their speed, shots at his body spill 2-6 m in front, and high ones (over 1.8 m) are tipped over.
  - Overall, about 30% of parries go behind for a corner.
- **Distribution:**
  - Goal kicks carry 50-62 m by kicking. Long kicks land with a spread of 2 + 6 × (1 − kicking ÷ 99) m.
  - Throws go 25-35 m.
  - He plays short when a defender is free, his team's directness is 1-2 and the opponents' press is 3 or lower.
- **The back-pass rule:** after a deliberate kick or a throw-in from a team-mate, he plays it with his feet. Pressers know this and press him harder.

### A9. Fouls, cards, advantage and home advantage

**Foul chance per challenge**

| Challenge | Foul chance |
|---|---|
| Standing tackle | 6-10% |
| Sliding, or from behind | 18-25% |
| Aerial duel | 4% |
| Holding at a corner or wide free kick | 1.5% per delivery |

- **Higher with:** aggression (× 0.7 + 0.6 × aggression ÷ 99), tiredness (× 1 + 0.5 × (1 − energy)) and a better dribbler.
- **Lower with:** tackling. In his own box a defender goes to ground 0.6 times as often.
- **Home players** are called for fouls 8% less often (× 0.92).

**Cards**
- **Ordinary foul:** a yellow 15% of the time (35% for sliding from behind).
- **Tactical foul** that stops a promising attack (two or more attackers against the defenders ahead): a yellow 70% of the time.
- **Denying an obvious goal-scoring chance:** the fouler is the last defender, within about 30 m, and the attacker is in control heading for goal. That is a red 85% of the time. In the box, it is a penalty and a yellow if he went for the ball.
- **Second yellow:** a red.
- **The sums:** about 24 fouls a match, about 2 of them tactical, gives 22 × 0.15 + 2 × 0.7 = about 4.7 yellows before tuning. The lab trims it into the 3.5-4.5 target. Reds come to about 0.1-0.2 a match, from second yellows and denied chances.

**Advantage** is played if the fouled team keeps the ball within 1 s and the spot is worth 0.02 or more on the threat map. If nothing comes of it within 3 s, the free kick comes back. Any card is shown at the next stoppage.

**Home advantage**
- **Attributes:** home players gain 2.0 × crowd share attribute points. Crowd share is attendance ÷ capacity, and never counts as less than 0.4 (today's attendance floor).
- **Referee:** the foul lean above.
- **What it replaces:** today's shot-rate boost and its small possession and card edges.

**Penalties:** about 76% go in, from the aim, the keeper's dive and the shot model. The target is 0.25-0.35 a match.

### A10. Fatigue, condition and injuries

- **Energy drain:**
  - 0.00004 per metre up to 5.5 m/s, 0.00012 per metre above it.
  - Then × (1.3 − 0.6 × stamina ÷ 99): 0.94 at stamina 60, 0.7 at 99.
  - Then × the weather figure.
  - **Example:** 9 km at up to 5.5 m/s and 2 km faster is 0.36 + 0.24 = 0.60, × 0.92 (stamina 63) = **about 0.55**. Half-time gives back about 0.07 of it.
- **Effect:** effective attribute = attribute × (1 − 0.35 × (1 − energy)), today's rule. It now also lowers top speed, acceleration and decision quality.
- **Half-time:** gives back a quarter of the energy used in the first half.
- **Condition after the match** falls by 0.12 × (energy used ÷ 0.5), where 0.5 is the typical full-match use (the lab sets it so the league average stays at today's 0.12).
  - A pressing midfielder who used 0.65 loses 0.16.
  - A keeper who used 0.2 loses 0.05.
  - A sub who played 20 minutes and used 0.12 loses 0.03.
- **Injuries** come from duels and from sprints when tired:
  - 0.0012 per duel × (1.5 − durability ÷ 99) × (1 + (1 − energy)). With about 200 duels a match (tackles and aerial challenges) that comes to about 0.3 before tuning.
  - Sprints add a little when energy is below 0.4.
  - The target is 0.10-0.35 a match.
- **Hurt, no subs left:** he moves to the low-demand slot (the deepest wide slot in the 10-man shape) at 70% of his top speed.

### A11. Set-piece takers and throw-ins

- **Named takers** (penalties, free kicks, corners in `setPieceTakers`) take every penalty, direct free kick and corner while on the pitch. If one goes off, `pickTakers` picks again from those still on.
- **A quick, short free kick** in midfield goes to the nearest player.
- **Throw-ins:** in our half they go to the full-back on that side, in the opponents' half to the wide midfielder or winger on that side. If neither is near, the nearest player takes it. Throws go 10-25 m to a free team-mate.
- **Later options:** a named throw-in taker (an optional `throwIns` field) and long throws, once they exist.

### A12. Attribute save names

| Save name | Attribute | Save name | Attribute |
|---|---|---|---|
| pac | pace | mrk | marking |
| sta | stamina | pos | positioning |
| str | strength | cmp | composure |
| dri | dribbling | wrk | work rate |
| pas | passing | agg | aggression |
| vis | vision | ref | reflexes |
| fin | finishing | han | handling |
| hea | heading | kck | kicking |
| crs | crossing | gkp | keeper positioning |
| spk | set pieces | dur | durability |
| tck | tackling | | |

---

## B. What the sketch measured

The sketch was a throwaway engine, about 500 lines, built only to measure speed and determinism. It was untuned: it scored about 100 goals a match and made 2-3 times too many on-ball decisions. Its off-ball work was realistic, about 247,000 decisions per fine match, with about 10,000 on the ball. Treat its timings as rough.

**How it was timed.** The dev machine is a shared 4-core 2.1 GHz server. Its load was 2.8 to 7.75 during the runs, so timings are pessimistic. Each benchmark ran once to warm up, then 5-10 times. Results are min / median / max.

**Today's engine:** a full season of 245 matches takes 825 / 962 / 1,303 ms, so **about 3.9 ms a match**. One match takes 2.05-3.71 ms.

**One sketch match**

| Run | min / median / max |
|---|---|
| Fine, Node main thread (three sets) | 150-168 / 157-185 / 176-224 ms |
| Fine, Node worker | 166 / 186 / 226 ms |
| Fine, Bun main / worker | 134 / 155 / 217 and 132 / 158 / 278 ms |
| Fine, first run (not warmed up) | 285-467 ms |
| Coarse at 0.5 s steps, Node main / worker | 43 / 45.5 / 52 and 44 / 50 / 62 ms |
| Coarse at 0.5 s steps, Bun main / worker | 35 / 45 / 55 and 37 / 38 / 40 ms |
| Fine, with far players held in shape | 147 / 169 / 193 ms (against 157: little saved) |

**From the sketch to the section 17 estimates**
- **Fine:** about 160 ms, about 40 times today's engine.
- **Coarse at 0.25 s steps:** running, team shape and the match loop are paid every step and were about 30% of the coarse time. Halving the step doubles them, so 45.5 ms × 1.3 = about 59 ms. Thinking is paid per rethink and the ball's flight is already worked out every 0.1 s, so neither grows. The sketch's on-ball choices (15% of the time) are 2-3 times too many, which takes back about 4 ms: **about 55 ms**, about 14 times today's engine.
- **League week:** 8 × 55 ms = 0.45 s. **Season:** 245 × 55 ms = 13.5 s.

**Where the time went**

| Part | Fine | Coarse |
|---|---|---|
| Off-ball thinking | 29% | 14% |
| On-ball choices | 17% | 15% |
| Running | 17% | 7% |
| Team shape | 9% | 8% |
| Checking passing lanes | 6% | 16% |
| Match loop | not listed | 14% |
| Memory clean-ups | 4% | 6% |

**A week of 7 coarse matches at 0.5 s steps plus 1 fine match** in workers:

| Workers | min / median / max |
|---|---|
| 1 | 467 / 522 / 554 ms |
| 2 | 297 / 314 / 328 ms |
| 3 | 251 / 327 / 344 ms |

Two workers help. A third did not help on the loaded 4-core machine.

**Memory clean-ups.** The first sketch lost about 10% of its time to 45 clean-ups per fine match, because JavaScript wraps each stored decimal number. A shared scratch array and a whole-number random-number state brought it down to 15 clean-ups, 4-6% of the time.

**Recording positions** did not change the match: the fingerprint stayed 4f3320b2, and timings were 154-229 ms against 159-213 ms. A frame is 47 numbers: 22 players across and depth, plus the ball across, depth and height.

**Checkpoints**
- Re-running from kickoff to 85:00 costs 142 / 159 / 195 ms. Restoring the 85:00 checkpoint and playing to 86:00 costs 9.4 / 9.7 / 10.0 ms, about 40 ms on a phone.
- One fine minute on its own costs 1.6-1.9 ms.
- A checkpoint is 6 KB, one every 5 minutes, so about 120 KB for a match, kept in memory only.
- A 30 s clip at 10 frames a second is 300 × 47 × 2 bytes, about 28 KB. A whole match is about 5.4 MB, never stored.

**Maths across browser engines.** 200,000 inputs were compared between V8 (Chrome, Node) and JavaScriptCore (Safari, Bun). The table shows how often the last digit differed.

| sqrt | sin, cos | exp | log | pow | atan2 | hypot | acos |
|---|---|---|---|---|---|---|---|
| 0% | 3.4% | 9.6% | 3.3% | 9.4% | 16.6% | 35.1% | 7.7% |

- **Today's engine** already differs in xG digits in 44 of 245 matches between the two (all scores matched).
- **`det.ts` versions** of these functions differed in 0 of 200,000, and are accurate to about 15 digits (errors under 1 part in 10^15).
- **Speed:** cost in nanoseconds per call, `det.ts` against built-in.

  | exp | log | sin | pow | atan2 |
  |---|---|---|---|---|
  | 30 / 18 | 60 / 39 | 61 / 32 | 64 / 76 | 42 / 57 |

**How fast tiny differences grow.** One player's position was nudged at kickoff, over 12 seeds. The table shows how many matches ended with a different score.

| Nudge | Fine | Coarse |
|---|---|---|
| 0.000000001 m | 0 | 1 |
| 0.000001 m | 0 | 7 |
| 1 mm | 1 | 11 |
| 10 cm | 10 (the matches split after a median of 14 s) | 11 |

This is why one last-digit difference between phones is not acceptable.

**Fingerprints** were identical in Node, Bun, the main thread and a worker: fine f18b5448, coarse 1c4ffadc, lite coarse 89a5650b.

**Fine and coarse passes.** Seed 1 gave 2,306 passes in fine mode against 1,267 in lite coarse. The two modes drift apart without a test, and the untuned sketch passed about 2.5 times too often.

---

## C. Test and tuning mechanics

### C1. The tuning lab

- `npm run lab -- --matches 400 --mode coarse` plays 400 matches and prints every target with its margin.
- `--sweep key=a,b,c` tries several values of one setting.

**Tuning order** (each step locks before the next):
1. ball in play;
2. passing and possession;
3. getting forward;
4. shots and where they come from;
5. goals;
6. set pieces;
7. fouls, cards and injuries;
8. offsides;
9. results and squad strength;
10. fatigue and distance;
11. fine and coarse agreeing.

If coarse drifts, only the coarse step and rethink rates change. The football settings are shared.

**Main settings and starting values**

| Area | Settings |
|---|---|
| Shooting | `xg.table`, `shot.minXg` 0.035, `shot.outsideMinXg` 0.025, `decisions.shootBias` −0.01 to +0.01 by mentality, `shot.longPenalty` 0.01 |
| Keeper | `gk.reactionS` 0.18, `gk.diveSpeed` 5 m/s, `gk.parryBehind` 0.3 |
| Home | `home.attrBonus` 2.0 × crowd (at least 0.4), `home.foulLean` 0.92; the coach protects a lead from 78' |
| Strength | `duel.slopePer5` 0.03, the execution errors in D5 |
| Passing | `pass.reactionS` 0.25, `decisions.lossWeight` 0.8, `pass.errorScale` 1.0, `touch.looseBase` 0.04 |
| Fouls and cards | `foul.perChallenge` 0.10, `foul.fromBehind` 1.6, `card.yellow` 0.15, `card.promising` 0.7, `card.dogsoRed` 0.85 |
| Corners | `block.behindShare` 0.35, `clear.behindUnderPressure` 0.25 |
| Offsides | `run.timingSdS` 0.30, `pass.readErrorM` 1.0 at vision 50, `line.stepUpSpeed` 1.5 |
| Injuries | `injury.perDuel` 0.0012 |
| Running | walk 1.5, jog 3.5, run 5.5 m/s |

### C2. The agreement test

- **The sample:** 8 seasons × 245 matches = 1,960 fixtures, played in both modes.
- **Why that many:** goals vary by about 1.6 a match. Over 1,960 matches each average is good to about ±0.036, and the gap between two modes to about ±0.05. So the ±0.15 limit is 3 of those steps. Two equally good modes almost never fail it, and an unrelated tuning change will not break it by chance.
- **Limits:** goals ±0.15, shots ±1, completion and possession ±2 points, fouls ±1, passes ±8%, distance ±5%, crosses ±1.

### C3. Tactics tests

- **Set-up:** two equal teams (quality 0.6), and only one dial changes, for one side.
- **Seeds:** 120 shared seeds per setting, in coarse mode on every push and fine mode in the slow job.
- **Pass marks:** each one is about half the effect measured in tuning, and that effect must be at least 3 standard errors.
- **Output:** each test prints its effect and margin. The seeds are fixed and the engine is deterministic, so a test can only change when the engine changes.

Dial 5 against dial 1, unless stated:

| Test | Passes if |
|---|---|
| High line | balls received behind the back line at least 1.5×; opponent offsides at least 1.3× |
| High press, where | the ball is won at least 8 m higher on average |
| High press, cost | energy at 90' at least 0.04 lower; at least 0.4 km more run per player |
| Width | crosses at least 1.4×; corners at least 1.15× |
| Mentality | shots at least 1.2× |
| Tempo and directness 5/5 against 1/1 | possession at least 0.05 lower and completion at least 4 points lower |
| Stronger squad | averages more possession (a 5-point overall gap gives at least +3 points) |
| Counters on | shots within 10 s of winning the ball at least 1.3× |
| Man-marking | his man's touches at most 0.85× |
| Time-wasting | own restarts at least 1.3× longer; more stoppage time |
| Decision quality | midfielders with q 0.8 play forward passes of 10 m or more at least 1.15× as often as q 0.4 |

**Shape and rules tests** (no randomness):
- Line 5 is at least 20 m higher than line 1.
- With the ball 20 m out, the line sits 11-14 m out.
- A 4-3-3 shows four across the back without the ball and two or three with it.
- Every offside case.
- The named taker takes 100% of penalties, direct free kicks and corners while he is on the pitch.
- The keeper never handles a back-pass.
- The sub-queue cases: a queued sub counts, a sent-off player's sub is cancelled, and an injury stoppage is used.

### C4. The slow job and suite time

| Run | Time |
|---|---|
| 8 fine seasons | 8 × 245 × 0.16 s = 314 s |
| The same fixtures in coarse | 8 × 13.5 s = 108 s |
| 8 more coarse seasons | 108 s |
| **Total** | **about 530 s, about 9 minutes on one core; about 2.5 minutes split over the build machine's 4 cores** |

`npm test` keeps to about 90 s: the coarse tactics tests, the shape and rules tests, and the golden matches.

**Counting clean-ups.** In Node, a `perf_hooks` observer counts "gc" entries during one fine match after a warm-up. The limit is 20. Memory growth is the heap after a forced clean-up, compared before and after 50 matches. The limit is 2 MB.

### C5. Swap-over checklist

Before the default flips in build step 7, each of these must work on the new engine:
- `careerHooks.simulate`
- `stepLive`
- `liveSubstitute`
- `liveTactics`
- `setCoachInCharge`
- the 65th-minute `pauseReason`
- the coach modes and `playToEnd`
- `inMatchDecisions`
- `compactResult`
- `lastUserMatch`
- old saves, including one saved mid-match on the old engine

**Save and reload mid-match** at 1', 30', 45+2', 89' and 105', then finish the match: it must be identical to one played straight through.

### C6. Risk register

| Risk | What we do | Checked from build step |
|---|---|---|
| Fine and coarse drift apart | The agreement test; only step rates differ | 3 |
| Too slow on phones | Budgets in CI; the Engine check; the fallbacks in 17.11 | 2 |
| Safari plays a different match | Plain arithmetic, `det.ts`, the golden matches, the Engine check | 2 |
| One number breaks the others | The tuning order; the lab prints every target each run | 3 |
| A mid-match resume goes wrong | The reload test at five points in the match; restart-resume as the fallback | 6 |
| Tactics make no visible difference | The tactics tests; the 2D viewer | 2 |
| It looks wrong to a former player | The viewer watch-list; your verdict before step 7 | 2 |
| The test suite gets too slow | The slow job runs separately; `npm test` stays near 90 s | 3 |
| Luck beats strength | The strength test and the table check | 3 |
| Tuning breaks replays | `ENGINE_REV` and the tuning fingerprint in every record | 2 |

---

## D. Formulas

**D1. Option score.** For each option:

score = p × V(where it ends) − (1 − p) × 0.8 × V_opp(where it is lost) − V(now) + tactic bonus + noise

- **V** is the threat map (A6), and **V_opp** is the same map seen from the opponents' end.
- **The tactic bonus** for a dial at d (1 to 5) is (d − 3) × 0.15 × S. S is the spread defined in D3.
  - Directness counts for passes over 25 m.
  - Tempo counts for first-time passes.
  - Width counts for wide passes and crosses.
  - Counter-attacks count for forward passes within 5 s of a win.
  - Protecting a lead counts for safe passes and the corner flag late on.

**D2. Pass p**, the chance a pass gets through.
- For each opponent within 5 m of the path, find the margin m: when he can get to the nearest point of the path (0.25 s reaction plus his run), minus when the ball gets there.
- His chance of missing it is 0.5 + 0.5 × u ÷ (1 + |u|), with u = 36 × (m − 0.05). So m = −0.2 s (he is early) gives 0.05, and m = +0.3 s (late) gives 0.95.
- p is the product over those opponents, times the receiver's chance of controlling it (D5).

**D3. Decision quality and noise**
- q = (0.4 × vision + 0.4 × composure + 0.2 × positioning) ÷ 99.
- S = best score − the middle (median) score of the top 5, at least 0.001.
- Noise spread = 0.8 × (1.3 − q) × S × (1 + min(0.6, 1 − energy)). That gives 0.32 S at q 0.9 and 0.72 S at q 0.4.
- The noise comes from `Rng.normalDet`.

**D4. Shapes.** The same curve stands in for every smooth "S-shaped" rule: s(x) = 0.5 + 0.5 × x ÷ (1 + |x|). It needs only + − × ÷, so it is the same on every phone.

**D5. Execution errors**
- **Pass aim spread** = distance × (0.02 + 0.10 × (1 − passing ÷ 99)).
- **Under pressure** (a presser within 2 m), every error × (1 + 0.6 × (1 − composure ÷ 99)).
- **Shot miss spread at the goal** = 0.25 + 1.6 × (1 − finishing ÷ 99) + 0.04 × distance, in metres. Set pieces replaces finishing for free kicks and penalties.
- **Cross landing spread** = 1.0 + 4.0 × (1 − crossing ÷ 99) m.
- **Duels:** an equal defender wins 55%, ±3 points per 5 attribute points of difference, kept between 15% and 85%.
- **First touch:** the ball runs loose 4% to 18% of the time, by ball speed, pressure, dribbling and composure.

**D6. Back line and keeper**
- **Out of possession:** line = height + 0.4 × (ball depth − 52.5), kept between 6 and 58 m and no closer than the gap to the ball. Gap = 0.4 × ball depth, kept between 4 and 15 m. Within 25 m it is held at 11-14 m.
- **In possession:** line = height + 0.5 × (ball depth − 52.5) + mentality shift, kept between 18 and 58 m.
- **Keeper:** with the ball beyond 25 m, distance off his line = 0.4 × line height − 2 m, kept between 2 and 20 m.

**D7. How far a lofted ball carries** (drag 0.010 per metre, no spin; 0.012 is 3-5% shorter)

| Struck at | 25° | 30° | 35° | 40° | 45° |
|---|---|---|---|---|---|
| 18 m/s | 22 m | 24 m | 26 m | 26 m | 26 m |
| 24 m/s | 35 m | 38 m | 40 m | 41 m | 41 m |
| 26 m/s | 39 m | 43 m | 45 m | 46 m | 46 m |
| 28 m/s | 44 m | 48 m | 50 m | 51 m | 51 m |
| 30 m/s | 49 m | 53 m | 55 m | 56 m | 56 m |
| 32 m/s | 53 m | 57 m | 60 m | 61 m | 60 m |

A test checks that a long ball at 24-30 m/s carries 40-55 m and a goal kick at 28-33 m/s carries 50-62 m.
