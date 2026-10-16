# Handoff: finish Stage 4, then build Stage 4.5 before Stage 5

**Read this whole file before doing anything.** It changes the build order in `CLAUDE.md`. Its instructions apply until Stage 4.5 is finished and the owner has approved it.

---

## Part 1: What changed and why

- The owner has decided the **match engine must carry the game's quality**. The Stage 1 engine is statistical (one outcome rolled per minute, no player positions). It will be replaced by a **spatial engine** in a new **Stage 4.5**, placed between Stage 4 (Stadium builder) and Stage 5 (Match Day viewer).
- This reverses the design-doc decision "highlights engine, not a continuous 90-minute simulation". The full Stage 4.5 spec is in Part 3 of this file.
- The new build order is: **Stage 4 → Stage 4.5 → Stage 5 → Stage 6 → Stage 7.**

### Hard gate
**Do not start any Stage 5 work** (3D players, match-day cameras, the 3D tactics overlay, match audio) until:
1. Stage 4 meets its "done when" in `CLAUDE.md`, and
2. Stage 4.5 meets its "done when" in Part 3, and
3. The owner has given his verdict on the new engine.

If a request seems to need Stage 5 work before then, say so and ask the owner first.

---

## Part 2: Do these in order

### Step A: Make the new order permanent (first commit of this session)
This handoff file may not be read in future sessions, so put its instructions into the repo:
1. Save Part 3 of this file, unchanged, as `docs/STAGE_4_5_SPATIAL_ENGINE.md`.
2. In `CLAUDE.md`, under "Build stages", add **Stage 4.5: Spatial match engine** between Stage 4 and Stage 5. Give it a short summary and point to `docs/STAGE_4_5_SPATIAL_ENGINE.md` for the full spec. Copy the hard gate above into it.
3. In `CLAUDE.md`, change Stage 5's steps to: text feed (exists from Stage 2), 2D top-down viewer (exists from Stage 4.5), 3D replay viewer.
4. In `CLAUDE.md`, in the match engine spec section, add a note that the spatial engine in Stage 4.5 replaces the per-minute tick engine.
5. Commit and push. The build must stay green.
6. After that, this handoff file can be deleted from the repo, or kept in `docs/` for history.

### Step B: Finish Stage 4 (Stadium builder)
- Check the repo against Stage 4's "done when" in `CLAUDE.md`: **buying an upgrade changes the stadium you can see, and the change persists in saves.** Do not assume; look at the code and the live build.
- As of commit `5a95945` ("Stadium tab: 3D ground that changes with every upgrade"), the stadium builder sim, the tappable ground plan and the 3D ground were in. Items from the Stage 4 spec that may still be missing (verify each):
  - Branding applied to the ground: club colours, crest, pitch design, stadium name and naming-rights signage.
  - Crowd density driven by attendance.
  - The office window showing the real modular stadium instead of the Stage 3 placeholder.
  - Stadium state surviving a save export and import.
- The **stadium upgrade catalogue and costs** is an open item in `docs/DESIGN.md` section 16. Propose values and ask the owner to confirm.
- Finish with a playable build on Pages and a report to the owner.

### Step C: Build Stage 4.5
- Follow Part 3 exactly, starting with its section 1 (docs) and section 2 (design proposal).
- **Stop after the design proposal for the owner's review.** Do not write engine code until he approves it.
- Then work through the build steps in Part 3, section 9, one at a time, each ending with a playable build and a report.

### Step D: Stop for the owner's verdict
When Stage 4.5's "done when" is met, stop and ask the owner to play a season and judge the engine. Only start Stage 5 when he says so.

---

## Reminders from CLAUDE.md that matter most here

- The owner is a beginner-plus coder who tests mostly on a phone. Explain changes in plain language and say how to test on a phone after every task.
- `src/sim` stays pure (no DOM, no three.js) and deterministic through `src/sim/rng.ts`.
- Tuning values live in `src/data`, not in logic.
- Saves need a version bump and a migration if the format changes. Never break old saves.
- Small, working commits pushed to `main`. Keep the deploy green.

---

# Part 3: Stage 4.5 spec

*(Save everything below this line, unchanged, as `docs/STAGE_4_5_SPATIAL_ENGINE.md`.)*

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
