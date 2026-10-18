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
