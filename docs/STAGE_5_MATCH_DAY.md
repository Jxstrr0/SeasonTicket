# Stage 5: Match Day in 3D

The 3D match viewer for Season Ticket. The owner gave their verdict on the spatial engine (Stage 4.5) on 2026-10-17 ("feels pretty dang good"), which clears the Stage 5 hard gate in CLAUDE.md.

Steps 1 and 2 of Stage 5 already exist: the text match feed (Stage 2) and the 2D top-down viewer (Stage 4.5). This document covers step 3: watching the engine's own positions in 3D.

## What it is

The 3D view plays the same match the 2D pitch shows. It uses the same engine steps, the same speeds and the same pause banners. It only reads positions, so the engine and saves don't change.

- **The ground** is the home club's Stage 4 stadium model: the stands, roof, boards and floodlights the owner has bought, in club colours. Away grounds use the other club's stadium record.
- **The players** are 22 rigged characters. They wear their club's kit, with the keepers in their own colours, and each has a skin tone and hair seeded from the player.
- **The ball** has its real height and a blob shadow.
- **Cameras** follow the ball. Broadcast is the default, with owner's box, behind the goal and overhead (tactics) one tap away. Replays add a low touchline camera.
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

## What 5.2 shipped

- **Files:**
  - `src/ui/career/match3dTape.ts` watches the engine and writes an action cue for every touch of the ball (who, what, where, when, and how hard).
  - `src/render/match/actions.ts` turns each cue into a move: a pose over time, layered on top of the running clips by bending the bones.
  - Tuning is in the `actions` block of `src/data/tuning/match3d.json`.
- **Cue kinds:** kick (passes, crosses, clearances, shots, goal kicks and punts), touch, header, chest, standing tackle, slide, keeper dive, block, throw (throw-ins and keeper throws), fall (fouled) and goal.
- **The 3D view runs 400 ms behind the engine.** That lets a leg swing back before the engine's strike, so the foot meets the ball on the frame it leaves. The text feed and score are not delayed, and 400 ms is too short to notice.
- **Kicks:**
  - The backswing is longer for a harder strike.
  - 22% of players are left-footed and kick with the left.
  - A lofted ball lifts the kicking leg higher.
- **Headers** jump when the ball is high enough. **Chest** control leans back with the arms out.
- **Tackles:** a standing tackle steps in on the side of the ball. A tackle from further out is a slide. A fouled player falls.
- **Keepers:**
  - A keeper gets set (a low crouch) when the other side has the ball near his goal and he isn't moving much.
  - For a shot, a keeper dives sideways when the ball is wide of him, timed to reach it as it arrives. Otherwise he jumps, scoops or takes it on the chest.
  - A held ball sits in his hands, and goes over his head for a throw.
  - Beaten shots still get a dive if they are low enough to reach.
- **Throw-ins:** the ball goes overhead and the arms come forward. The thrown ball starts 1.9 m up and eases down to the engine's path over 450 ms, because the engine starts a throw at ground level.
- **Goals:** the scorer runs with his arms out like a plane, then pumps a fist. Team-mates within 35 m raise their arms, and the scoring keeper raises one. The other side put their hands on their heads, and their keeper sinks down. An own goal has no scorer celebration.
- **Ball spin:** the ball rolls with its speed on the ground. In the air it keeps a spin from take-off that slowly fades.
- **Measured** on one full match (seed `tape1`):
  - Cues: about 770 kicks, 750 touches, 240 tackles and slides, 70 headers, 30 throws, 12 dives and 9 catches.
  - At 844 by 390, Medium: about 84 draw calls and 410,000 triangles. The moves cost no draw calls; they only bend bones.

## What 5.3 shipped

- **Files:**
  - `src/render/match/cameras.ts` places every camera. Each one eases towards the ball, and switching camera is a cut, as on TV.
  - `src/ui/career/match3dDirector.ts` decides what gets replayed and when. It is plain logic, so the tests can drive it.
  - `src/ui/career/match3d.ts` plays the replays and draws the camera buttons.
  - Tuning is in the `cameras` and `replays` blocks of `src/data/tuning/match3d.json`.
- **Cameras.** Four buttons sit bottom-left of the 3D view: TV (broadcast), Box, Goal and Top. The pick is remembered between matches.
  - **Box** is the owner's seat in the main stand's box row, behind the glass. If the stand has no boxes, it is the back row.
  - **Goal** is high behind the goal. It swaps ends once play is 12 m into the other half.
  - **Top** is high over the pitch, for watching the shape.
  - **Side** is a low touchline camera that only replays use. It zooms in on play across the pitch, and slides back along the line when play is close to it.
- **Replays.**
  - The tape keeps the last 20 seconds of frames.
  - **Every goal** is replayed 3.2 seconds after it goes in. The replay has two slow-motion angles: the touchline at 0.55x, then behind the goal at 0.35x.
  - **Big chances** are also replayed, behind the goal at 0.5x. A big chance is a shot worth 0.25 xG or more that doesn't go in, or one that hits the woodwork.
  - **Great saves** are replayed the same way, with the badge "Replay: save" (the owner asked for these). A great save stops a shot worth 0.1 xG or more, and the keeper had to cover 1.8 m or more from where he stood when it was hit, or move faster than 3.5 m/s over the ball's flight. On 20 test matches that was about 1.2 a match, out of about 6 saves.
  - If a goal follows soon after a chance or save, the goal's replay covers both.
  - **A replay holds the live match** (the owner chose this over replaying on top of live play), then it picks up where it stopped, so nothing is missed. A **Skip** button (top-right) ends it early.
  - Replays play in slow motion from the engine's frames, so the legs slow down too. Nothing is replayed in a penalty shootout.
  - In the replay viewer, a replay starts when the match is paused or stopped at the moment, too.
- **Highlights option.** A Highlights button sits next to 3D on the live screen and the replay screen. With it on, the 2D pitch plays the match, and each big moment plays in 3D:
  - It starts 7 seconds before the moment, at real speed, on the owner's camera, and ends 1.5 seconds after.
  - A goal then gets one slow-motion take behind the goal. A big chance gets its replay too.
  - A moment is a goal, a saved shot, a shot off the woodwork, or any shot worth 0.13 xG or more.
  - The badge reads "Highlight" for the real-speed part, then "Replay", "Replay: goal" or "Replay: save".
  - **Why moments, not "danger":** the first design showed 3D whenever the ball was near a box. But the ball gets near a box about 100 times a match, so the screen flickered between 2D and 3D. Shots are the moments a TV highlights show uses.
- **Measured** on one full match (seed `replay1`):
  - Full mode: 2 goals, both replayed within one engine step of going in, on two angles. There were no big chances in that match.
  - Highlights mode: 9 moments, about 97 seconds of 3D in total.

## What 5.4 shipped

- **Files:**
  - `src/render/match/marks.ts` paints the shape on the grass and the ring under a tapped player.
  - `src/ui/career/match3d.ts` works out the lines (`shapeRows`), draws the Shape button and the player card, and turns a tap into a player.
  - `src/ui/views/career/live.ts` has the full-screen layout; the styles are in `src/ui/base.css`.
  - `ratingSoFar` in `src/sim/match/ratings.ts` gives a player's rating at any point in the match, worked out the same way as the full-time one.
  - Tuning is in the `overlay` block of `src/data/tuning/match3d.json`.
- **Shape.** A Shape button sits next to the camera buttons. With it on, the owner's team has its lines painted on the grass in gold:
  - Each line of the formation is joined player to player, left to right as they stand, so the lines bend and stretch as the team moves.
  - The back line also runs the width of the pitch at its players' depth, and a dashed line shows the depth the team is aiming its back line for (it moves with the Defensive line setting and with play).
  - The lines are the shape the team **defends** in, from the engine's own depths: a 4-3-3 draws 4-5-1 (the wingers drop in beside the midfield), 3-5-2 and 3-4-3 draw a back five, and 4-4-2, 4-2-3-1, 5-3-2 and 4-1-4-1 draw as named. A sent-off player drops out.
  - The lines update as soon as the engine moves on, so a formation change shows once play restarts. They are off during replays. The choice is remembered per device (off at first).
- **Tap a player** (either side) for his card, top-left: name, kit colour, position and overall, energy, his rating so far, and goals, assists, bookings or an injury. A ring marks him on the grass. The card refreshes every second; ✕ closes it.
  - On the owner's own players the card has **Take him off**, which pauses and opens the subs panel with him already picked, so only the player coming on is left to choose.
  - In the replay viewer the card shows the full-time rating.
  - A tap picks the player drawn nearest it, measured along his whole body on screen, within 28 px.
- **Full screen.** A Full screen button on the live screen lays the match (2D or 3D) over the whole screen:
  - The score sits in a pill at the top; Play/Pause, speed (one button, tap for the next speed), Subs, Tactics and Exit stand down the right edge.
  - Subs and Tactics open in a drawer over the right half of the pitch, the same panels as the normal screen. The match pauses while it is open.
  - Phones that allow it also hide the browser's bars (Android Chrome does; iPhone Safari does not, and the layout fills the page there anyway). The choice is remembered per device (off at first).
- **Fix:** the grass in the stadium model is raised 10 cm over the ground, so since 5.1 the players, the ball and the soft shadows under them stood 10 cm into it (the shadows were hidden). Everything on the pitch now stands on the grass.

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

- **Kicks, touches, tackles and dives** are approximated: the moves are procedural bone bends on top of the running clips, not captured animations. Celebrations are arm and body poses on top of the engine's own runs, not set-piece celebrations such as knee slides.
- **The body is one shared build.** Height and build don't vary by player yet.
- **Shirt numbers and names** are not painted on the kits. The tap card (step 5.4) and the 2D view show who's who.
- **The shape overlay** draws the lines the team defends in, even while it attacks; in possession the same groups are joined where the players stand.
