# Credits

Season Ticket is made by Longlight Interactive.

## Third-party assets

Every asset shipped with the game is listed here with its source and licence.

| Asset | Source | Licence | Used for |
| --- | --- | --- | --- |
| Office props: metal office desk, classic laptop, modern arm chair 01, potted plant 04, desk lamp arm 01, wall clock, wooden display shelves 01, sofa 01, modern coffee table 01, hanging picture frame 02, clipboard, modern ceiling lamp 01, football | [Poly Haven](https://polyhaven.com/models) | CC0 | HQ Office furniture and desk objects |
| Textures: herringbone parquet, beige wall 001 | [Poly Haven](https://polyhaven.com/textures) | CC0 | HQ Office parquet floor and walls |
| Texture: Carpet 012 | [ambientCG](https://ambientcg.com/view?id=Carpet012) | CC0 | HQ Office carpet |
| Universal Base Characters [Standard] | [Quaternius](https://quaternius.com) | CC0 | Office visitors and the 3D match players (bodies and hair) |
| Universal Animation Library [Standard] | [Quaternius](https://quaternius.com) | CC0 | Office visitor animations (walk, idle, talk, sit) and the 3D match players' idle, walk, jog and sprint |
| Sound: Football match ambience | [habbis92 on Freesound](https://freesound.org/people/habbis92/sounds/206003/) | CC0 | The crowd murmur under every match |
| Sound: Stadium crowd reaction, general ambience | [itmightgetloud on Freesound](https://freesound.org/people/itmightgetloud/sounds/829454/) | CC0 | The crowd swell as attacks near a goal |
| Sound: Stadium crowd reaction, goal | [itmightgetloud on Freesound](https://freesound.org/people/itmightgetloud/sounds/829455/) | CC0 | Goal roars |
| Sound: Goal | [Sandermotions on Freesound](https://freesound.org/people/Sandermotions/sounds/494352/) | CC0 | A goal roar |
| Sound: Stadium "oehh" | [Sandermotions on Freesound](https://freesound.org/people/Sandermotions/sounds/494362/) | CC0 | The crowd reacting to a chance |
| Sound: Crowd reaction during a soccer game | [felix.blume on Freesound](https://freesound.org/people/felix.blume/sounds/612131/) | CC0 | The crowd reacting to a chance |
| Sound: Crowd sigh in disappointment | [ShangusBurger on Freesound](https://freesound.org/people/ShangusBurger/sounds/763880/) | CC0 | The groan when the away side scores |
| Sound: Booing | [ShangusBurger on Freesound](https://freesound.org/people/ShangusBurger/sounds/764033/) | CC0 | Boos for fouls and cards |
| Sound: Referee whistle | [Rosa-Orenes256 on Freesound](https://freesound.org/people/Rosa-Orenes256/sounds/538422/) | CC0 | The short whistle (fouls, offside, kick-off) |
| Sound: Metal whistle | [strongbot on Freesound](https://freesound.org/people/strongbot/sounds/568995/) | CC0 | The half-time and full-time whistles |
| Sound: Soccer ball kick | [bittermelonheart on Freesound](https://freesound.org/people/bittermelonheart/sounds/555042/) | CC0 | Ball kicks |
| Sound: Ball kick | [Nicolas4677 on Freesound](https://freesound.org/people/Nicolas4677/sounds/446639/) | CC0 | Ball kicks |
| Sound: Stadium crowd reaction, general ambience (a second cut) | [itmightgetloud on Freesound](https://freesound.org/people/itmightgetloud/sounds/829454/) | CC0 | The home end's chants (Stage 7.2) |
| Sound: Stadium crowd reaction, mood waves | [itmightgetloud on Freesound](https://freesound.org/people/itmightgetloud/sounds/829456/) | CC0 | The away end's chant, muffled by distance |
| Music: Coffee House Bump | [OatCog on OpenGameArt](https://opengameart.org/content/coffee-house-bump) | CC0 | A song on the office radio |
| Music: Funked Up | [joth on OpenGameArt](https://opengameart.org/content/funked-up) | CC0 | A song on the office radio |
| Music: Chill lofi inspired | [omfgdude on OpenGameArt](https://opengameart.org/content/chill-lofi-inspired) | CC0 | A song on the office radio |

All models were converted with the tools in `scripts/assets` (Meshopt geometry, KTX2 textures). The sounds were cut, levelled and encoded to MP3 by `scripts/assets/build-audio.py`. The menus' taps, the visitor's knock, the phone's ring, the newspaper's page, the press cameras, the war-room clock and the office's room tone are made in code by the game itself (`src/render/audio/synth.ts`), with no recording.

## Libraries

| Library | Licence |
| --- | --- |
| three.js, including its example loaders, post-processing and RoomEnvironment | MIT |
| Basis Universal transcoder (bundled with three.js) | Apache-2.0 |
| fflate | MIT |
| meshoptimizer (its simplifier, for the light bodies on the 3D match) | MIT |
| Vite | MIT |
| Vitest | MIT |

## Asset tools (not shipped)

| Tool | Licence |
| --- | --- |
| glTF Transform | MIT |
| meshoptimizer | MIT |
| sharp | Apache-2.0 |
| KTX-Software (`toktx`) | Apache-2.0 |
| FFmpeg with LAME (`build-audio.py`) | LGPL-2.1 or later |
| NumPy (`build-audio.py`) | BSD-3-Clause |
