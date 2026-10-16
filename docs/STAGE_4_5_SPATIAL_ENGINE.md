# Stage 4.5: Spatial match engine

Insert this stage between Stage 4 (Stadium builder) and Stage 5 (Match Day viewer). Do not start it until Stage 4 meets its "done when".

**Why this stage exists:** the owner wants the match engine to carry the game's quality. The Stage 1 engine is statistical: one outcome rolled per minute, with no player positions. This stage replaces it with a spatial engine where 22 players and the ball have positions, tactics set the team's shape, and each player makes decisions from his attributes. Stage 5's 3D viewer then replays real engine data instead of inventing movement.

---

## 1. Documentation updates (do these first)

- `docs/DESIGN.md`, decisions log: record that on the owner's decision the **"highlights engine, not a continuous 90-minute simulation"** call is reversed in favour of a **spatial engine**. You still watch highlights at chosen speeds; the difference is that every highlight is a replay of simulated positions.
- `docs/DESIGN.md`: as each Stage 1 match engine simplification is removed (offside as a chance, penalties with no box geometry, free kicks with no distance model, one move per minute, no individual marker), delete or rewrite its entry. Add new simplifications as they are made.
- `CLAUDE.md`: add this stage to the build stages. Move **2D top-down highlights** from Stage 5 into this stage. Stage 5 becomes: text feed (exists), 2D viewer (exists from this stage), 3D replay viewer.

## 2. Before writing code: the design proposal

Write a short engine design (add it to `docs/DESIGN.md` as a new section) and stop for the owner's review. It must cover:

- The time model: how often positions update and how often players make decisions, in fine and coarse modes.
- The team-shape model: how formation, mentality, defensive line, width, pressing, tempo and directness turn into positions.
- On-ball decision logic: how options are found and scored.
- Off-ball logic: shape, runs, marking, pressing and covering.
- The ball model.
- How offside, fouls, penalties, free kicks, corners and throw-ins use real positions.
- How the existing systems (fatigue, cards, injuries, substitutions, stoppage time, AI head coach, extra time, shootouts) plug into the new engine.
- Performance budgets (section 8).
- Anything you recommend simplifying, and why.

Explain the proposal in plain language. The owner is a former high-level football player and will judge whether the logic matches how the real game works.

## 3. Engine spec

### Pitch and time
- Pitch: 105 m by 68 m, coordinates in metres. The ball has height; players do not jump in the model except to contest headers.
- Suggested starting point (the proposal may change it): positions update several times per second in fine mode, players re-decide a few times per second, and the player on the ball decides when he receives it or when his situation changes. Coarse mode uses fewer steps through the **same code**.
- Match structure, rules, substitutions, cards, stoppage time, extra time and shootouts stay as specified in `docs/DESIGN.md` section 5.

### Team shape from tactics
- Each formation defines home positions for each role, expressed relative to the ball and the team's phase (in possession, out of possession, transition).
- The block slides with the ball and compacts or stretches by tactic:
  - **Defensive line** sets how high the back line holds and how far it steps up.
  - **Width** sets lateral spread in possession.
  - **Mentality** shifts the whole block up or down and changes how many players join attacks.
  - **Pressing** sets the trigger distance, how many players press and how long they chase.
  - **Tempo** and **directness** bias on-ball decisions toward quick or patient, short or long.
  - **Counter-attack** on: players break forward on winning the ball instead of resetting shape.
  - **Man-marking:** one assigned marker tracks the target player instead of holding his zone.
- A tactic change takes effect within a second of match time and should be visible in the shape.

### On-ball decisions
- The player on the ball considers: pass (to each reachable team-mate, including through balls into space), dribble or carry, shoot, cross, long ball, clear, and hold up.
- Each option gets a score from: the chance it succeeds (distance, pressure, passing lanes, receiver's position), the value of the outcome (how much more dangerous the ball becomes), and the team's instructions.
- Attributes affect both the choice and the execution. Vision changes which options a player sees; decisions changes how well he weighs them; technique, passing, finishing and composure change execution; pace and strength decide duels.
- Some randomness through the seeded RNG so players are not perfectly predictable, scaled down for better decision-makers.

### Off-ball decisions
- Attackers: hold shape, offer short options, make runs in behind (timed against the defensive line), overlap and underlap.
- Defenders: hold the line together, step up, track runners, mark in the box, press when triggered, cover a team-mate who has been beaten.
- Goalkeepers: positioning against shots and crosses, claiming, sweeping behind a high line, distribution.

### Ball model
- Ground passes and carries, lofted passes, crosses, shots and clearances with believable speed and flight.
- Passes can be intercepted along their path; loose balls are contested by whoever reaches them first.
- No full physics. Simple, consistent flight that looks right in 2D and 3D.

### Rules from positions
- **Offside:** a real line check at the moment of the pass.
- **Fouls:** happen in a tackle or duel at a location. Inside the box means a penalty. Card chance depends on the challenge, its location and whether it stopped a clear chance.
- **Free kicks:** distance and angle decide shot versus cross versus short pass. Defending teams form a wall for close free kicks.
- **Corners and throw-ins:** delivery by the set-piece taker, with planned runs and marking.
- Add own goals and the advantage rule if they come naturally from the model; record any rule still left out.

### Fatigue
- Players tire from distance covered and sprints, so high pressing and tempo cost more because players actually run more.
- Fatigue lowers pace, acceleration and decision quality during the match and feeds the existing between-match condition system.

### AI head coach
- The existing AI coach logic (formation and tactics choice, substitutions around 60 to 80 minutes, chasing or protecting a result, reacting to red cards) drives the new engine through the same tactic inputs the owner uses.

## 4. Output

- Keep the **existing match result interface**: result, team and player stats, scoring summary, event timeline with one-line commentary, and per-player match ratings. Career, the live match, delegated matches and saves must keep working with no other changes.
- New stats to add: possession share, passes and pass completion, shot locations, distance covered, offsides.
- **Replay data on demand.** Because the engine is deterministic, do not store position frames in saves. A match can be replayed from its seed, the starting lineups and tactics, and the log of tactic changes and substitutions. Add a replay function that regenerates position frames for any stretch of a match.
- If the save format changes, bump the save `version` and add a migration. Old saves must load.

## 5. The 2D top-down viewer

- A top-down pitch with player dots (club colours and numbers) and the ball, driven by replay frames.
- Playback controls: play, pause, speed, jump to the next event. Works in landscape on a phone with touch controls.
- Available from the live match screen and for any match the owner played this season.
- Build it early. It is the main tool for judging the engine. It also becomes the "Low" or plain-menus fallback for match day in Stage 5.

## 6. Non-negotiable rules for this stage

- `src/sim` stays pure: no DOM, no three.js, runs headless in tests and Node.
- All randomness through `src/sim/rng.ts`. The same seed and the same inputs must produce the same match, in the browser, in a Web Worker and in tests.
- All tuning values (decision weights, speeds, shape distances, probabilities) live in `src/data/tuning`, not in logic.
- **One engine.** The owner's watched match and every background match use the same code. Coarse mode is a setting of that engine, not a separate engine.
- Keep the old engine only until the new one passes every test, then remove it.

## 7. Tests and believability targets

Keep every existing believability test:
- 2.4 to 3.1 goals per match.
- Home win about 45%, draw about 25%.
- 9 to 16 shots per team.
- Stronger squads finish higher.

Add these as starting targets (tune them with the owner if the game feels off):
- Possession: most matches between 35% and 65% for each side; stronger and more possession-minded teams average more.
- Pass completion: roughly 70% to 88% per team, higher for short-passing, patient teams.
- Shot locations: most shots and the large majority of goals come from inside the box.
- Fouls about 9 to 15 per team, corners about 3 to 7 per team, offsides about 1 to 4 per team.
- Tactics matter: tests confirm that a high line concedes more balls in behind, high pressing wins the ball higher up and tires players faster, and wide play produces more crosses.
- Fine and coarse modes both pass every target over several simulated seasons.
- Determinism: the same seed and inputs produce an identical match, including in a worker.

## 8. Performance requirements

- Run match simulation in a **Web Worker** so the 3D office and stadium never stutter while matches simulate.
- No per-step object allocation in the engine's hot loop; reuse arrays and objects.
- Add **benchmark tests with time budgets** for: advancing one league week (8 matches, coarse mode), one full match in fine mode, and one full season headless. Propose budgets based on a mid-range phone and explain the choice to the owner.
- Report the benchmark numbers after every step so any slowdown is visible.
- The owner's live match must keep up with the fastest viewing speed without lag.

## 9. Build steps

Each step ends with a playable build deployed to Pages and a short plain-language report.

1. **Docs and design proposal** (sections 1 and 2). Pause for the owner's review.
2. **Shape and movement.** Players hold formation shape, slide with a scripted ball, and respond to tactic changes. The 2D viewer shows it. *Done when* the owner can watch shapes change on a phone when tactics change.
3. **Passing and possession.** On-ball decisions, passes, interceptions, loose balls and pressing. No shooting yet. *Done when* possession and pass completion look believable in the 2D viewer.
4. **Attacking and shooting.** Runs in behind, crosses, shots, goalkeepers, goals. *Done when* goals and shots per match are close to target.
5. **Rules and set pieces.** Offside line, fouls by location, penalties, free kicks, corners, throw-ins, cards and injuries in play.
6. **Systems hookup.** Fatigue, substitutions, AI head coach, stoppage time, extra time and shootouts running in the new engine. Coarse mode and the Web Worker.
7. **Tuning and swap-over.** Pass every believability, determinism and benchmark test in both modes. Switch career, the live match and delegated matches to the new engine, migrate saves if needed, and remove the old engine.

## 10. Done when

- Every league and playoff match in a career uses the spatial engine.
- All believability, tactics, determinism and benchmark tests pass in fine and coarse modes.
- The owner can watch any of his matches in the 2D viewer on a phone, and changing tactics during a match visibly changes how his team plays.
- Old saves load.
- Pause for the owner's verdict on the engine before starting Stage 5.

## 11. How to report back after each step

1. What changed, in plain language.
2. How to test it on a phone (the Pages URL and what to tap).
3. Benchmark numbers and believability results.
4. Anything the owner needs to decide.
