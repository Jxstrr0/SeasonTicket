"""Download the CC0 Poly Haven source art used by build-office.mjs.

Usage: python3 fetch-polyhaven.py <source-dir>

Models land in <source-dir>/ph/<id>/ (1k glTF), textures in <source-dir>/tex/ (1k jpg).
Poly Haven refuses requests without a User-Agent, so this shells out to curl.
"""
import json
import os
import subprocess
import sys

MODELS = [
    'metal_office_desk', 'classic_laptop', 'modern_arm_chair_01', 'potted_plant_04',
    'desk_lamp_arm_01', 'wall_clock', 'wooden_display_shelves_01', 'Sofa_01',
    'modern_coffee_table_01', 'hanging_picture_frame_02', 'clipboard',
    'modern_ceiling_lamp_01', 'football',
]
TEXTURES = ['herringbone_parquet', 'beige_wall_001', 'brown_planks_05']
MAPS = {'Diffuse': 'diff', 'nor_gl': 'nor', 'arm': 'arm'}


def get(url, out=None):
    args = ['curl', '-sSfL', '-A', 'SeasonTicketBuild/1.0', url]
    if out:
        args += ['-o', out]
    return subprocess.run(args, check=True, capture_output=out is None).stdout


def main():
    src = sys.argv[1]
    for mid in MODELS:
        files = json.loads(get('https://api.polyhaven.com/files/' + mid))
        g = files['gltf']['1k']['gltf']
        base = os.path.join(src, 'ph', mid)
        os.makedirs(base, exist_ok=True)
        get(g['url'], os.path.join(base, mid + '.gltf'))
        for path, v in g.get('include', {}).items():
            fp = os.path.join(base, path)
            os.makedirs(os.path.dirname(fp), exist_ok=True)
            get(v['url'], fp)
        print('model', mid)
    os.makedirs(os.path.join(src, 'tex'), exist_ok=True)
    for tid in TEXTURES:
        files = json.loads(get('https://api.polyhaven.com/files/' + tid))
        for key, short in MAPS.items():
            get(files[key]['1k']['jpg']['url'], os.path.join(src, 'tex', f'{tid}_{short}.jpg'))
        print('texture', tid)


if __name__ == '__main__':
    main()
