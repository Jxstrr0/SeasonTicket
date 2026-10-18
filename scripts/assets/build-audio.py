"""Download the CC0 Freesound recordings and bake the match-day sounds (Stage 5.5), the
crowd's chants and the office radio's songs (Stage 7.2).

Usage: python3 build-audio.py <source-dir> [name ...]

With names, only those files are baked (the rest stay as they are).

Needs ffmpeg (with libmp3lame) on the PATH and numpy. The previews land in
<source-dir>/audio/<id>.mp3; the baked files go to public/assets/audio/ with the
names src/data/tuning/atmosphere.json lists. Each piece is cut from its recording,
faded, levelled, and (for the two looping beds) given a baked crossfade so the
loop has no seam. Everything is mono MP3: the game pans the kicks itself.

The radio's songs come from OpenGameArt (CC0) and land in <source-dir>/oga/. They are
cut to a whole number of their own phrases and faded out, made mono at 22 kHz and
encoded small: the game plays them through a small speaker anyway.
"""
import os
import subprocess
import sys

import numpy as np

RATE = 44100
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'assets', 'audio')

# Freesound id -> (uploader, preview file stem). All CC0; credited in CREDITS.md.
SOURCES = {
    206003: ('habbis92', '206003_878508'),
    829454: ('itmightgetloud', '829454_3625328'),
    829455: ('itmightgetloud', '829455_3625328'),
    829456: ('itmightgetloud', '829456_3625328'),
    494352: ('Sandermotions', '494352_1402315'),
    494362: ('Sandermotions', '494362_1402315'),
    612131: ('felix.blume', '612131_1661766'),
    763880: ('ShangusBurger', '763880_11744683'),
    764033: ('ShangusBurger', '764033_11744683'),
    538422: ('Rosa-Orenes256', '538422_11966684'),
    568995: ('strongbot', '568995_313970'),
    555042: ('bittermelonheart', '555042_11910076'),
    446639: ('Nicolas4677', '446639_9134393'),
}

# Output name -> how to make it. `cut` is (id, start s, end s); a list of cuts is joined
# with `gap` seconds of silence. `loop` bakes a crossfade of that many seconds so the
# first (end - start - loop) seconds repeat seamlessly. `rms` levels by loudness (dBFS),
# `peak` by the loudest sample.
PIECES = {
    'bed': dict(cut=(206003, 10, 53), loop=3, rms=-20),
    'swell': dict(cut=(829454, 280, 307), loop=3, rms=-17),
    'roar-1': dict(cut=(829455, 0.4, 10), fade=(0.03, 3.5), peak=-1),
    'roar-2': dict(cut=(829455, 15.0, 25), fade=(0.03, 4), peak=-1),
    'roar-3': dict(cut=(494352, 5.3, 11.5), fade=(0.03, 2.5), peak=-1),
    'ooh-1': dict(cut=(612131, 32.4, 38.5), fade=(0.2, 1.5), peak=-2),
    'ooh-2': dict(cut=(494362, 2.9, 7.0), fade=(0.15, 1.2), peak=-2),
    'groan': dict(cut=(763880, 0.6, 9.5), fade=(0.1, 2), peak=-2),
    'boo': dict(cut=(764033, 0.8, 9.0), fade=(0.1, 2), peak=-2),
    'whistle': dict(cut=(538422, 0, 0.5), fade=(0.005, 0.08), peak=-3),
    'whistle-long': dict(cut=[(568995, 6.65, 7.45), (568995, 12.65, 13.6)], gap=0.3, fade=(0.005, 0.08), peak=-3),
    'whistle-end': dict(cut=[(568995, 0.65, 1.35), (568995, 6.65, 7.45), (568995, 12.65, 13.6)], gap=0.3, fade=(0.005, 0.1), peak=-3),
    'kick-1': dict(cut=(555042, 0, 0.35), fade=(0.001, 0.15), peak=-1),
    'kick-2': dict(cut=(446639, 0, 0.35), fade=(0.001, 0.15), peak=-1),
    # Stage 7.2: the home end singing (the most tonal stretch of the stadium recording,
    # clear of the swell's), and the away end across the ground, muffled by distance.
    'chant-1': dict(cut=(829454, 240, 258), fade=(1.5, 3), rms=-18),
    'chant-2': dict(cut=(829454, 222, 238), fade=(1.5, 3), rms=-18),
    'chant-away': dict(cut=(829456, 0, 14), fade=(1.5, 3), lowpass=1800, rms=-20),
}

# The office radio (Stage 7.2): OpenGameArt file -> (name, start s, end s, fade-out s).
OGA = 'https://opengameart.org/sites/default/files/'
SONGS = {
    'radio-cafe': ('little_cafe_0.wav', 0, 76.8, 2.5),
    'radio-funk': ('Funked%20Up.mp3', 0, 66.3, 1.5),
    'radio-lofi': ('ChillLofi.ogg', 0, 97.2, 2.5),
}
SONG_RATE = 22050
SONG_KBPS = 32

KBPS = {'bed': 64, 'swell': 64, 'chant-1': 48, 'chant-2': 48, 'chant-away': 40}


def fetch(src, fid):
    path = os.path.join(src, 'audio', f'{fid}.mp3')
    if not os.path.exists(path):
        stem = SOURCES[fid][1]
        url = f'https://cdn.freesound.org/previews/{fid // 1000}/{stem}-hq.mp3'
        os.makedirs(os.path.dirname(path), exist_ok=True)
        subprocess.run(['curl', '-sSfL', '-o', path, url], check=True)
        print('fetched', fid)
    return path


def decode(path):
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', path, '-ac', '1', '-ar', str(RATE), '-f', 'f32le', '-'],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)


def fade(x, fin, fout):
    x = x.copy()
    a, b = int(fin * RATE), int(fout * RATE)
    if a:
        x[:a] *= np.linspace(0, 1, a) ** 2
    if b:
        x[-b:] *= np.linspace(1, 0, b) ** 2
    return x


def bake_loop(x, seconds):
    """Fold the last `seconds` into the start with an equal-power crossfade."""
    n = int(seconds * RATE)
    body, tail = x[:-n].copy(), x[-n:]
    t = np.linspace(0, np.pi / 2, n)
    body[:n] = body[:n] * np.sin(t) + tail * np.cos(t)
    return body


def lowpass(x, hz, rate=RATE):
    """Two passes of a one-pole low-pass: a far-off sound loses its edge."""
    a = 1 - np.exp(-2 * np.pi * hz / rate)
    for _ in range(2):
        y = np.empty_like(x)
        acc = 0.0
        for i, v in enumerate(x):
            acc += a * (v - acc)
            y[i] = acc
        x = y
    return x


def encode(x, name, kbps, rate=RATE):
    path = os.path.join(OUT, name + '.mp3')
    pcm = np.clip(x, -1, 1).astype(np.float32).tobytes()
    subprocess.run(['ffmpeg', '-v', 'quiet', '-y', '-f', 'f32le', '-ar', str(rate), '-ac', '1', '-i', '-',
                    '-c:a', 'libmp3lame', '-b:a', f'{kbps}k', '-map_metadata', '-1', path],
                   input=pcm, check=True)
    return os.path.getsize(path)


def song(src, name, spec):
    file, a, b, fout = spec
    path = os.path.join(src, 'oga', file.replace('%20', '_'))
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        subprocess.run(['curl', '-sSfL', '-o', path, OGA + file], check=True)
        print('fetched', file)
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', path, '-ac', '1', '-ar', str(SONG_RATE), '-af', 'lowpass=f=6500',
                          '-f', 'f32le', '-'], check=True, capture_output=True).stdout
    x = np.frombuffer(raw, np.float32).astype(np.float64)[int(a * SONG_RATE):int(b * SONG_RATE)]
    n = int(fout * SONG_RATE)
    x = x.copy()
    x[-n:] *= np.linspace(1, 0, n) ** 2
    x *= 10 ** (-16 / 20) / np.sqrt(np.mean(x ** 2))
    x *= min(1, 0.95 / np.max(np.abs(x)))
    size = encode(x, name, SONG_KBPS, SONG_RATE)
    print(f'{name:13s} {len(x) / SONG_RATE:5.1f} s {size / 1024:6.0f} kB')
    return size


def main():
    src = sys.argv[1]
    only = set(sys.argv[2:])
    os.makedirs(OUT, exist_ok=True)
    cache = {}
    total = 0
    for name, spec in SONGS.items():
        if not only or name in only:
            total += song(src, name, spec)
    for name, p in PIECES.items():
        if only and name not in only:
            continue
        cuts = p['cut'] if isinstance(p['cut'], list) else [p['cut']]
        parts = []
        for fid, a, b in cuts:
            if fid not in cache:
                cache[fid] = decode(fetch(src, fid))
            seg = cache[fid][int(a * RATE):int(b * RATE)]
            if 'fade' in p:
                seg = fade(seg, *p['fade'])
            if parts:
                parts.append(np.zeros(int(p.get('gap', 0) * RATE)))
            parts.append(seg)
        x = np.concatenate(parts)
        if 'lowpass' in p:
            x = lowpass(x, p['lowpass'])
        if 'loop' in p:
            x = bake_loop(x, p['loop'])
        if 'rms' in p:
            x *= 10 ** (p['rms'] / 20) / np.sqrt(np.mean(x ** 2))
            x = np.clip(x, -0.99, 0.99)
        else:
            x *= 10 ** (p['peak'] / 20) / np.max(np.abs(x))
        size = encode(x, name, KBPS.get(name, 80 if len(x) > RATE else 96))
        total += size
        print(f'{name:13s} {len(x) / RATE:5.1f} s {size / 1024:6.0f} kB')
    print(f'total {total / 1024:.0f} kB')


if __name__ == '__main__':
    main()
