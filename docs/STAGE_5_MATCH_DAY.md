# Stage 5: Match Day in 3D

The 3D match viewer for Season Ticket. The owner gave their verdict on the spatial engine (Stage 4.5) on 2026-10-17 ("feels pretty dang good"), which clears the Stage 5 hard gate in CLAUDE.md.

Steps 1 and 2 of Stage 5 already exist: the text match feed (Stage 2) and the 2D top-down viewer (Stage 4.5). This document covers step 3: watching the engine's own positions in 3D.

## What it is

The 3D view plays the same match the 2D pitch shows. It uses the same engine steps, the same speeds and the same pause banners. It only reads positions, so the engine and saves don't change.

- **The ground** is the home club's Stage 4 stadium model: the stands, roof, boards and floodlights the owner has bought, in club colours. Away grounds use the other club's stadium record.
- **The players** are 22 rigged characters. They wear their club's kit, with the keepers in their own colours, and each has a skin tone and hair seeded from the player.
- **The ball** has its real height and a blob shadow.
- **Cameras** follow the ball. Broadcast is the default; others come in step 5.3.
- **Toggles:**
  - The live screen and the replay screen get a 2D/3D toggle.
  - The 3D option only appears when Graphics is not Off.
  - The choice is kept per device, like the quality setting.

The layering rule holds. `src/render/match` never imports the sim. `src/ui/career/match3d.ts` turns the engine state into a plain `MatchFrame3D` snapshot each frame (blended between engine steps the same way the 2D pitch is), the same way `stadiumSnapshot.ts` works for the stadium.

## Build steps

Each step ends with a deploy and a short report.

| Step | What | Done when |
|---|---|---|
| 5.1 | **Scene:** the home ground, pitch and ball, 22 kit-coloured players running on engine positions (idle, walk, jog and sprint blended by speed, turning to face their way), a broadcast camera following the ball, and quality tiers. 3D toggle on the live and replay screens. | A live match plays in 3D on a phone at Medium. |
| 5.2 | **Actions:** passes, shots and clearances as a leg swing timed to the engine's strike, tackles and slides, headers and jumps, keeper set position, dives, catches and parries, throw-ins, celebrations, ball spin. | Every touch of the ball reads as a touch. |
| 5.3 | **Cameras and replays:** broadcast, owner's box, behind the goal, overhead (tactics). Automatic goal and big-chance replays from a ring buffer of frames, in slow motion with two angles. Camera buttons. The highlights option (2D between big moments, 3D for each one). | Every goal gets a replay; cameras switch without a hitch. |
| 5.4 | **3D tactics overlay:** the shape and back line drawn on the grass, tap a player for his name, energy and rating, and the subs and tactics panels over the 3D view. | The owner can manage a match without leaving 3D. |
| 5.5 | **Atmosphere:** weather (rain, snow, wind, heat haze), floodlights at night, crowd density from attendance, crowd and stadium audio that react to chances and goals, the referee's whistle, and a commentary ticker. | The match sounds and looks like a match day. |
| 5.6 | **Performance pass** and the Stage 5 "done when" check on a phone. | A full match can be managed and watched in 3D on a phone at Medium. |

## What 5.1 shipped

- **Files:**
  - `src/render/match/view.ts` builds the scene, camera and loop.
  - `players.ts` holds the 22 rigged players, their kits and gaits.
  - `types.ts` holds the plain frame and scene types.
  - `src/ui/career/match3d.ts` is shared by the live and replay screens, so a match day uses one WebGL context.
  - Tuning is in `src/data/tuning/match3d.json`.
- **Kits** are painted onto the bare base body in the shader, by height on the rest pose. The parts are shirt, collar, cuffs, shorts, socks and boots, plus keeper gloves and long sleeves. One material per player keeps the draw calls low.
- **Gaits:**
  - Idle, walk, jog and sprint are blended by ground speed.
  - The legs are sped up or slowed to match the ground.
  - A player faces his run when moving, and the ball when standing.
- **Broadcast camera:**
  - It sits on a gantry just in front of the main stand (z 39, 20 m up) with a fixed 34 degree horizontal view on any screen shape.
  - It pans with the ball and eases in.
- **Shadows:** the stadium casts real shadows, drawn once. The players and the ball use soft blob shadows.
- **Fallback:**
  - The 2D pitch keeps drawing until the 3D players have loaded.
  - If 3D can't start, or the browser drops it more than twice, the game says so and stays on 2D until the Graphics setting is changed.
- **Measured** at a phone landscape viewport (844 by 390) at Medium: about 70 draw calls and 380,000 triangles. Most of the triangles are the 22 bodies at about 7,000 vertices each. A lower-detail body for Low and for far players is a 5.6 task.

## Budgets

These target a mid-range phone (about a 2022 Android) at Medium.

- **Frame rate:** 30 fps at Medium with the full crowd, measured over the first 10 minutes of a match. Aim for 60 fps at Low.
- **Draw calls:** at most 250 at Medium (a stadium already uses about 120).
- **Download:**
  - Match day adds at most 3 MB over the office and stadium.
  - The player bodies are already in the office's `people.glb`.
  - The match clips (`public/assets/match/anims.glb`) are about 0.6 MB.
- **Engine cost:** none. The 3D view only reads the state the 2D view already reads.
- **Memory:** one WebGL context. The stadium tab and office pause while the match view is open.

## Art and licences

- **Bodies, hair and moves:** Quaternius' Universal Base Characters and Universal Animation Library (CC0), as in the office. They are listed in `CREDITS.md`.
- **No kick clip:** the library has none, so kicks, tackles and dives (step 5.2) are made in code on top of the running clips, by bending the leg and hip bones towards the strike.
- **Kits:** painted on in a shader by body region, the same way the office paints suits. This covers the shirt with collar and cuffs, shorts, socks, boots, and long sleeves and gloves for keepers.

## Owner's decisions (2026-10-17)

1. **Player look:** keep the Quaternius base bodies with painted kits.
2. **How much 3D:** the full live match in 3D with automatic goal replays, **plus a highlights option**. In highlights mode, 2D plays between the big moments and each big moment switches to 3D. It is a per-device setting next to the 3D toggle and comes with the replays in step 5.3.
3. **Audio:** free recorded (CC0) crowd, whistle and ball sounds, each listed in `CREDITS.md`. Synthesized sound is only a stopgap where no good recording exists yet.
4. **Cameras:** broadcast is the default, with owner's box, behind the goal and overhead as one-tap presets (step 5.3).

## Simplifications

- **Kicks and touches** are approximated: the leg swing is procedural, not a captured animation.
- **The body is one shared build.** Height and build don't vary by player yet.
- **Shirt numbers and names** come later in step 5.4. The 2D view and the tap card will show who's who.
