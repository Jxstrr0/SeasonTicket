# Asset tools

Offline tools that turn downloaded CC0 source art into the compressed files in
`public/assets/`. The game build and CI never run them; the compressed output is
committed instead (no Git LFS, every file well under 100 MB).

## HQ Office (`public/assets/office`)

1. Install the tools here: `npm install` (in this folder).
2. Install KTX-Software so `toktx` is on your PATH.
3. Download the Poly Haven art: `python3 fetch-polyhaven.py <source-dir>`, then the
   ambientCG carpet: `python3 fetch-ambientcg.py <source-dir>`.
4. Download and unzip the two Quaternius packs into `<source-dir>`:
   - "Universal Base Characters [Standard]" into `<source-dir>/ubc/`
   - "Universal Animation Library [Standard]" into `<source-dir>/ual/`
5. Build: `node build-office.mjs <source-dir>`.

The output is:

| File | What it holds |
| --- | --- |
| `props.glb` | Every prop as a named root node. Meshopt geometry, KTX2 textures. |
| `people.glb` | Two base bodies and a few hairstyles on one shared rig. |
| `anims.glb` | Only the animation clips the office plays, with no mesh. |
| `*.ktx2` | Carpet, parquet and wall textures (colour, normal, AO/rough/metal). |

## Match players (`public/assets/match/players.glb`)

The players are the office's base body wearing a kit modelled in Blender. Nothing is
downloaded: the body comes from `public/assets/office/people.glb`.

1. Install the tools here (`npm install`) and Blender as a Python module in a virtual
   environment: `python3 -m venv .venv && .venv/bin/pip install bpy` (Blender 5.3 wants
   Python 3.13).
2. `node build-players.mjs extract <work-dir>` writes the body in its rest pose.
3. `.venv/bin/python players-kit.py <work-dir> --preview` models the outfield and keeper
   kits and renders pictures of each into `<work-dir>` to look at.
4. `node build-players.mjs pack <work-dir>` puts the two dressed bodies back on the
   body's own skeleton and writes `players.glb`.

Shapes (hem heights, how loose the shirt hangs, sleeve lengths) are the numbers at the top
of `players-kit.py` and in each garment's function. Each vertex's colour tells the game
which part it is (`PART` there, `KIT_PAINT` in `src/render/match/players.ts`): add a part
in both places. Colours come from the clubs and `src/data/tuning/match3d.json` (`kit`).

## The town (`public/assets/stadium/scenery.glb`)

The houses, shops, flats, church, works, trees, cars and lamps round the ground are
modelled from scratch by a Blender script. Nothing is downloaded.

1. `.venv/bin/python scenery-kit.py <work-dir> --preview` models every piece and renders
   `<work-dir>/scenery.png`, all of them in a row, to look at.
2. `node build-scenery.mjs <work-dir>` packs them into `scenery.glb`.

A piece is a function in `scenery-kit.py` built from boxes, roofs, panels, cones and
blobs, listed in `PIECES`. Each face has a colour and a zone (fixed, wall tint, roof tint
or window); the game colours the tinted zones per building and lights the windows at
night. To add a piece: write its function, add it to `PIECES` there and to `PIECES` in
`src/render/stadium/town.ts`, then place it in `layoutTown`. Where things stand, how many,
and every colour are in `src/data/tuning/scenery.json`.

## Match-day sound (`public/assets/audio`)

1. Install FFmpeg (with `libmp3lame`) and NumPy.
2. Build: `python3 -I build-audio.py <source-dir>`. It downloads the CC0 Freesound
   recordings it needs into `<source-dir>/audio/` (skipping any already there), then
   cuts, fades, levels and encodes each sound.

The output is mono MP3 (the game pans the kicks itself):

| File | What it holds |
| --- | --- |
| `bed.mp3`, `swell.mp3` | The crowd murmur and the swell for attacks. Both loop without a seam (a crossfade is baked in). |
| `roar-*.mp3`, `ooh-*.mp3`, `groan.mp3`, `boo.mp3` | Crowd reactions to goals, chances, away goals, fouls and cards. |
| `whistle*.mp3` | The referee: one short blast, two for half-time, three for full-time. |
| `kick-*.mp3` | Ball kicks. |

Which sound goes where and how loud is in `src/data/tuning/atmosphere.json`. Before
adding a crowd recording, listen to it (or run it through a speech-to-text model) for
chanted club or player names: none may be audible in the game.

Add any new asset to `CREDITS.md` with its source and licence before committing it.
