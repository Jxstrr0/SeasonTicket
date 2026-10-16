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

Add any new asset to `CREDITS.md` with its source and licence before committing it.
