"""Download the CC0 ambientCG surface textures used by build-office.mjs.

Usage: python3 fetch-ambientcg.py <source-dir>

Each material lands in <source-dir>/tex/ as <id>_diff.jpg, <id>_nor.jpg (OpenGL
normals), <id>_ao.jpg and <id>_rough.jpg. build-office.mjs packs the last two
into the same AO/rough/metal map the Poly Haven textures ship with.
"""
import io
import os
import subprocess
import sys
import zipfile

TEXTURES = ['Carpet012']
MAPS = {'Color': 'diff', 'NormalGL': 'nor', 'AmbientOcclusion': 'ao', 'Roughness': 'rough'}


def main():
    out = os.path.join(sys.argv[1], 'tex')
    os.makedirs(out, exist_ok=True)
    for tid in TEXTURES:
        url = f'https://ambientcg.com/get?file={tid}_1K-JPG.zip'
        data = subprocess.run(['curl', '-sSfL', url], check=True, capture_output=True).stdout
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            for key, short in MAPS.items():
                name = f'{tid}_1K-JPG_{key}.jpg'
                with open(os.path.join(out, f'{tid}_{short}.jpg'), 'wb') as f:
                    f.write(z.read(name))
        print('texture', tid)


if __name__ == '__main__':
    main()
