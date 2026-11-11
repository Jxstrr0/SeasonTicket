"""Models the pieces of the town round the ground, in Blender (the `bpy` Python module).

    python3 scenery-kit.py <work-dir> [--preview]

Writes <work-dir>/scenery.json for `node build-scenery.mjs <work-dir>`, which packs it into
public/assets/stadium/scenery.glb. --preview also renders <work-dir>/scenery.png to look at.

Each piece is a small low-poly model, flat shaded, with no texture: every vertex carries a
colour (with a soft shadow baked in) and a zone the game reads from the colour's alpha:

    0  fixed     the colour as modelled (doors, chimneys, trunks, tyres)
    1  tint A    grey here; the game colours it per building (walls, a car's body, a crown)
    2  tint B    grey here; the game's second colour (roofs)
    3  window    glass by day, lit at night. Alpha is 3 plus the window's number on its
                 piece (wrapping at 250), so the game can light each window on its own

Pieces are modelled in metres with z up, the front towards -y and the origin on the ground at
the middle of the footprint; they are written with y up and the front towards +z.
"""
import json
import math
import random
import sys
from pathlib import Path

import bpy  # before bmesh and mathutils, which it provides
import bmesh
from mathutils import Matrix, Vector, noise
from mathutils.bvhtree import BVHTree

FIXED, TINT_A, TINT_B, WINDOW = 0, 1, 2, 3


def rgb(hex_):
    return tuple(int(hex_[i:i + 2], 16) / 255 for i in (1, 3, 5))


WHITE = (1, 1, 1)
GLASS = rgb('#8fa3b8')
DOOR = rgb('#4a3528')
BRICK = rgb('#8a5a44')
STONE = rgb('#b9b2a4')
TRUNK = rgb('#5a4330')
TYRE = rgb('#1b1c1f')
DARK = rgb('#33363c')
METAL = rgb('#8d949c')


class Piece:
    """One model: faces with a colour and a zone each."""

    def __init__(self, name, shadows=True):
        self.name = name
        # Baked soft shadows suit a building; a range of hills or a cloud goes without.
        self.shadows = shadows
        self.bm = bmesh.new()
        self.colour = self.bm.faces.layers.float_vector.new('colour')
        self.zone = self.bm.faces.layers.int.new('zone')
        self.window = self.bm.faces.layers.int.new('window')
        self.windows_made = 0

    def paint(self, faces, colour, zone):
        """Colours faces. Painted as WINDOW, the faces together are one window."""
        if zone == WINDOW:
            self.windows_made += 1
        for f in faces:
            f[self.colour] = colour
            f[self.zone] = zone
            f[self.window] = self.windows_made % 250 if zone == WINDOW else 0

    def face(self, points, colour, zone=FIXED):
        f = self.bm.faces.new([self.bm.verts.new(p) for p in points])
        self.paint([f], colour, zone)
        return f

    def box(self, x, y, z0, w, d, h, colour, zone=FIXED, top=1.0, bottom=False):
        """A box w wide (x), d deep (y) and h tall standing on z0 at (x, y); `top` scales its
        top face about its middle (a taper)."""
        a, b = w / 2, d / 2
        lo = [(x - a, y - b, z0), (x + a, y - b, z0), (x + a, y + b, z0), (x - a, y + b, z0)]
        hi = [(x + (px - x) * top, y + (py - y) * top, z0 + h) for px, py, _ in lo]
        v = [self.bm.verts.new(p) for p in lo + hi]
        faces = [self.bm.faces.new((v[i], v[(i + 1) % 4], v[4 + (i + 1) % 4], v[4 + i])) for i in range(4)]
        faces.append(self.bm.faces.new((v[4], v[5], v[6], v[7])))
        if bottom:
            faces.append(self.bm.faces.new((v[3], v[2], v[1], v[0])))
        self.paint(faces, colour, zone)
        return faces

    def gable(self, x, y, z0, w, d, h, colour, zone=TINT_B, along='x', over=0.3, ends=None):
        """A pitched roof over a w by d footprint, its ridge along x or y, h tall; the two end
        walls under the ridge take `ends` (colour, zone) or the roof's own."""
        a, b = w / 2 + over, d / 2 + over
        if along == 'x':
            pts = [(x - a, y - b, z0), (x + a, y - b, z0), (x + a, y + b, z0), (x - a, y + b, z0), (x - a, y, z0 + h), (x + a, y, z0 + h)]
            slopes = [(0, 1, 5, 4), (2, 3, 4, 5)]
            tris = [(3, 0, 4), (1, 2, 5)]
        else:
            pts = [(x - a, y - b, z0), (x + a, y - b, z0), (x + a, y + b, z0), (x - a, y + b, z0), (x, y - b, z0 + h), (x, y + b, z0 + h)]
            slopes = [(1, 2, 5, 4), (3, 0, 4, 5)]
            tris = [(0, 1, 4), (2, 3, 5)]
        v = [self.bm.verts.new(p) for p in pts]
        self.paint([self.bm.faces.new([v[i] for i in s]) for s in slopes], colour, zone)
        c, z = ends or (colour, zone)
        self.paint([self.bm.faces.new([v[i] for i in t]) for t in tris], c, z)

    def hip(self, x, y, z0, w, d, h, colour, zone=TINT_B, over=0.3):
        """A hipped roof: four slopes up to a short ridge along the longer side."""
        a, b = w / 2 + over, d / 2 + over
        r = max(0.0, (w - d) / 2) if w >= d else 0.0
        s = max(0.0, (d - w) / 2) if d > w else 0.0
        pts = [(x - a, y - b, z0), (x + a, y - b, z0), (x + a, y + b, z0), (x - a, y + b, z0), (x - r, y - s, z0 + h), (x + r, y + s, z0 + h)]
        v = [self.bm.verts.new(p) for p in pts]
        if w >= d:
            faces = [(0, 1, 5, 4), (2, 3, 4, 5), (1, 2, 5), (3, 0, 4)]
        else:
            faces = [(1, 2, 5, 4), (3, 0, 4, 5), (0, 1, 4), (2, 3, 5)]
        self.paint([self.bm.faces.new([v[i] for i in f]) for f in faces if len(set(pts[i] for i in f)) >= 3], colour, zone)

    def panel(self, x, z, w, h, y, colour, zone=FIXED, side='front'):
        """A flat panel (a window, a door) just proud of a wall. `side` is the wall it is on:
        front (-y), back (+y), left (-x) or right (+x); x is along the wall, y where the wall is."""
        e = 0.04
        a = w / 2
        if side == 'front':
            pts = [(x - a, y - e, z), (x + a, y - e, z), (x + a, y - e, z + h), (x - a, y - e, z + h)]
        elif side == 'back':
            pts = [(x + a, y + e, z), (x - a, y + e, z), (x - a, y + e, z + h), (x + a, y + e, z + h)]
        elif side == 'left':
            pts = [(y - e, x + a, z), (y - e, x - a, z), (y - e, x - a, z + h), (y - e, x + a, z + h)]
        else:
            pts = [(y + e, x - a, z), (y + e, x + a, z), (y + e, x + a, z + h), (y + e, x - a, z + h)]
        return self.face(pts, colour, zone)

    def windows(self, xs, zs, w, h, y, side='front'):
        for x in xs:
            for z in zs:
                self.panel(x, z, w, h, y, GLASS, WINDOW, side)

    def blob(self, x, y, z, r, colour, zone=TINT_A, squash=1.0, seed=1, cuts=1):
        """A rough ball: a tree's crown."""
        rng = random.Random(seed)
        out = bmesh.ops.create_icosphere(self.bm, subdivisions=cuts, radius=r)
        for v in out['verts']:
            k = 1 + rng.uniform(-0.14, 0.14)
            v.co = Vector((x + v.co.x * k, y + v.co.y * k, z + v.co.z * k * squash))
        self.paint({f for v in out['verts'] for f in v.link_faces}, colour, zone)

    def cone(self, x, y, z0, r0, r1, h, colour, zone=FIXED, sides=6, cap=False):
        out = bmesh.ops.create_cone(self.bm, cap_ends=cap, cap_tris=False, segments=sides, radius1=r0, radius2=r1, depth=h, matrix=Matrix.Translation((x, y, z0 + h / 2)))
        self.paint({f for v in out['verts'] for f in v.link_faces}, colour, zone)
        return out['verts']

    # ---- output ------------------------------------------------------------------------

    def export(self):
        bm = self.bm
        bmesh.ops.triangulate(bm, faces=bm.faces)
        bmesh.ops.recalc_face_normals(bm, faces=[f for f in bm.faces if f[self.zone] != WINDOW and len(f.verts[0].link_faces) > 1])
        bm.normal_update()
        # Soft shadows, with the ground under the piece joining in.
        shade = bm.copy()
        s = 200
        shade.faces.new([shade.verts.new(p) for p in ((-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0))])
        tree = BVHTree.FromBMesh(shade)
        shade.free()
        rng = random.Random(3)
        size = max(max(abs(c) for c in v.co) for v in bm.verts)
        reach = max(1.0, size * 0.45)
        positions, normals, colors, index = [], [], [], []
        seen = {}
        for f in bm.faces:
            n = f.normal
            for v in f.verts:
                origin = v.co + n * 0.03 + (f.calc_center_median() - v.co) * 0.08
                hit = 0.0
                rays = 24 if self.shadows else 0
                for _ in range(rays):
                    d = Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1))).normalized()
                    if d.dot(n) < 0:
                        d = -d
                    loc, _, _, dist = tree.ray_cast(origin, d, reach)
                    if loc is not None:
                        hit += d.dot(n) * (1 - dist / reach)
                ao = 1.0 if f[self.zone] == WINDOW or not self.shadows else max(0.6, 1 - 1.3 * hit / rays)
                c = f[self.colour]
                # Blender's z-up to the game's y-up, front towards +z.
                key = (round(v.co.x, 4), round(v.co.z, 4), round(-v.co.y, 4), round(n.x, 3), round(n.z, 3), round(-n.y, 3),
                       round(c[0] * ao, 3), round(c[1] * ao, 3), round(c[2] * ao, 3), f[self.zone] + f[self.window])
                i = seen.get(key)
                if i is None:
                    i = seen[key] = len(positions)
                    positions.append(key[0:3])
                    normals.append(key[3:6])
                    colors.append(key[6:10])
                index.append(i)
        print(f'  {self.name}: {len(positions)} vertices, {len(index) // 3} triangles')
        return {'name': self.name, 'positions': positions, 'normals': normals, 'colors': colors, 'index': index}


# ---- the pieces --------------------------------------------------------------------------

def chimney(p, x, y, z, h=1.6, w=0.7):
    p.box(x, y, z, w, w, h, BRICK)
    p.box(x, y, z + h, w * 0.6, w * 0.6, 0.3, DARK)


def terrace():
    """One house of a terraced row, 6 m wide: rows are made by standing them side by side."""
    p = Piece('house_terrace')
    w, d, h = 6.0, 9.0, 5.6
    p.box(0, 0, 0, w, d, h, WHITE, TINT_A)
    p.gable(0, 0, h, w, d, 2.6, WHITE, TINT_B, along='x', over=0.0)
    f = -d / 2
    p.panel(-1.6, 0, 1.1, 2.1, f, DOOR)
    p.windows([1.2], [0.9], 1.9, 1.5, f)
    p.windows([-1.5, 1.2], [3.3], 1.3, 1.4, f)
    p.windows([-1.4, 1.4], [3.3], 1.2, 1.3, d / 2, 'back')
    p.windows([1.3], [0.8], 1.6, 1.5, d / 2, 'back')
    chimney(p, -w / 2 + 0.5, 0.3, h + 1.6)
    # A back extension with a lean-to roof.
    p.box(-1.4, d / 2 + 1.5, 0, 3.0, 3.0, 2.6, WHITE, TINT_A, top=1.0)
    p.gable(-1.4, d / 2 + 1.5, 2.6, 3.0, 3.0, 0.8, WHITE, TINT_B, along='y', over=0.1)
    return p


def detached():
    p = Piece('house_detached')
    w, d, h = 9.0, 7.5, 5.4
    p.box(0, 0, 0, w, d, h, WHITE, TINT_A)
    p.hip(0, 0, h, w, d, 2.8, WHITE, TINT_B, over=0.45)
    f = -d / 2
    # A porch and a bay.
    p.box(-0.2, f - 0.7, 0, 1.8, 1.4, 2.5, WHITE, TINT_A)
    p.gable(-0.2, f - 0.7, 2.5, 1.8, 1.4, 0.8, WHITE, TINT_B, along='y', over=0.15)
    p.panel(-0.2, 0, 1.0, 2.1, f - 1.4, DOOR)
    p.windows([-3.0, 2.8], [0.9], 1.8, 1.5, f)
    p.windows([-3.0, 0, 2.8], [3.3], 1.4, 1.4, f)
    p.windows([-2.6, 2.6], [0.9, 3.3], 1.5, 1.4, d / 2, 'back')
    p.windows([0], [3.3], 1.2, 1.3, -w / 2, 'left')
    p.windows([0], [0.9], 1.2, 1.3, w / 2, 'right')
    chimney(p, w / 2 - 1.2, 0.5, h + 1.2, 2.0)
    # A garage.
    p.box(w / 2 + 1.6, 0.8, 0, 3.2, 5.4, 2.5, WHITE, TINT_A)
    p.panel(w / 2 + 1.6, 0.1, 2.4, 2.0, 0.8 - 2.7, rgb('#d9d6cf'))
    return p


def shop():
    """A shop with a flat above: a shopfront, an awning and a parapet. Stands in rows."""
    p = Piece('shop')
    w, d, h = 7.0, 11.0, 7.4
    p.box(0, 0, 0, w, d, h, WHITE, TINT_A)
    p.box(0, 0, h, w, d, 0.5, STONE)
    p.box(0, 0, h + 0.5, w - 0.8, d - 0.8, 0.05, DARK)
    f = -d / 2
    p.panel(0.6, 0.5, 4.2, 2.3, f, GLASS, WINDOW)
    p.panel(-2.4, 0, 1.1, 2.3, f, DOOR)
    # The sign board and the awning under it.
    p.panel(0, 3.0, w - 0.4, 0.8, f, WHITE, TINT_B)
    p.face([(-w / 2 + 0.2, f, 2.95), (w / 2 - 0.2, f, 2.95), (w / 2 - 0.2, f - 1.5, 2.45), (-w / 2 + 0.2, f - 1.5, 2.45)], WHITE, TINT_B)
    p.face([(-w / 2 + 0.2, f - 1.5, 2.45), (w / 2 - 0.2, f - 1.5, 2.45), (w / 2 - 0.2, f, 2.95), (-w / 2 + 0.2, f, 2.95)], WHITE, TINT_B)
    p.windows([-1.8, 1.8], [4.6], 1.5, 1.8, f)
    p.windows([-1.8, 1.8], [1.0, 4.6], 1.3, 1.5, d / 2, 'back')
    chimney(p, w / 2 - 0.6, 2.0, h + 0.5, 1.3)
    return p


def flats():
    p = Piece('flats')
    w, d, floors = 20.0, 12.0, 7
    h = floors * 3.0 + 0.6
    p.box(0, 0, 0, w, d, h, WHITE, TINT_A)
    p.box(0, 0, h, w + 0.3, d + 0.3, 0.6, STONE)
    p.box(3.0, 0.5, h + 0.6, 5.0, 4.0, 2.6, STONE)
    p.box(-5.0, -1.0, h + 0.6, 2.0, 2.0, 1.2, METAL)
    zs = [0.9 + i * 3.0 for i in range(floors)]
    xs = [-8.0, -5.4, -2.2, 2.2, 5.4, 8.0]
    for side in ('front', 'back'):
        y = -d / 2 if side == 'front' else d / 2
        p.windows(xs, zs if side == 'back' else zs[1:], 1.9, 1.6, y, side)
    p.windows(xs[:2] + xs[4:], zs[:1], 1.9, 1.6, -d / 2)
    p.panel(0, 0, 3.2, 2.5, -d / 2, GLASS, WINDOW)
    p.box(0, -d / 2 - 1.0, 2.6, 4.4, 2.0, 0.25, STONE, bottom=True)
    # Balconies down the front, a strip per floor.
    for z in zs[1:]:
        p.box(0, -d / 2 - 0.5, z - 0.35, 3.2, 1.0, 1.1, STONE, bottom=True)
    for side in ('left', 'right'):
        p.windows([-2.5, 2.5], zs, 1.4, 1.5, -w / 2 if side == 'left' else w / 2, side)
    return p


def church():
    p = Piece('church')
    w, d, h = 10.0, 22.0, 8.0
    p.box(0, 2.0, 0, w, d, h, STONE)
    p.gable(0, 2.0, h, w, d, 5.0, WHITE, TINT_B, along='y', over=0.4, ends=(STONE, FIXED))
    for x, side in ((-w / 2, 'left'), (w / 2, 'right')):
        p.windows([-4.0, 0.5, 5.0, 9.5], [2.2], 1.3, 4.2, x, side)
    # The tower at the front, with a spire.
    t = 5.6
    y = -d / 2 + 2.0 - t / 2 + 0.6
    p.box(0, y, 0, t, t, 17.0, STONE)
    p.box(0, y, 17.0, t + 0.5, t + 0.5, 0.6, STONE)
    p.cone(0, y, 17.6, t * 0.62, 0.05, 9.5, WHITE, TINT_B, sides=4)
    f = y - t / 2
    p.panel(0, 0, 2.0, 3.4, f, DOOR)
    p.windows([0], [6.0], 1.5, 3.6, f)
    p.panel(0, 12.6, 2.2, 2.2, f, rgb('#e8e2cf'))
    p.windows([y], [12.8], 1.4, 2.4, -t / 2, 'left')
    p.windows([y], [12.8], 1.4, 2.4, t / 2, 'right')
    return p


def works():
    """A works shed: a long low building with a north-light roof and a tall chimney."""
    p = Piece('works')
    w, d, h = 30.0, 16.0, 7.0
    p.box(0, 0, 0, w, d, h, WHITE, TINT_A)
    bays = 5
    bw = w / bays
    for i in range(bays):
        x = -w / 2 + bw * (i + 0.5)
        a, b = bw / 2, d / 2
        # Each bay: a long slope and a short glazed one.
        r = x + a * 0.55
        pts = [(x - a, -b, h), (x + a, -b, h), (x + a, b, h), (x - a, b, h), (r, -b, h + 2.4), (r, b, h + 2.4)]
        v = [p.bm.verts.new(q) for q in pts]
        p.paint([p.bm.faces.new((v[0], v[4], v[5], v[3]))], WHITE, TINT_B)
        p.paint([p.bm.faces.new((v[4], v[1], v[2], v[5]))], GLASS, WINDOW)
        p.paint([p.bm.faces.new((v[0], v[1], v[4])), p.bm.faces.new((v[2], v[3], v[5]))], WHITE, TINT_A)
    p.panel(-9.0, 0, 5.0, 4.6, -d / 2, METAL)
    p.windows([-2.0, 2.5, 7.0, 11.5], [3.4], 3.0, 1.6, -d / 2)
    p.windows([-11.0, -6.0, -1.0, 4.0, 9.0], [3.4], 3.0, 1.6, d / 2, 'back')
    p.cone(w / 2 + 2.5, 3.0, 0, 1.5, 0.9, 26.0, BRICK, sides=8)
    p.cone(w / 2 + 2.5, 3.0, 26.0, 1.05, 1.05, 0.7, DARK, sides=8, cap=True)
    return p


def tree_round():
    p = Piece('tree_round')
    p.cone(0, 0, 0, 0.42, 0.28, 3.6, TRUNK, sides=5)
    p.blob(0, 0, 6.0, 3.3, WHITE, squash=0.85, seed=11)
    p.blob(1.7, 0.6, 4.6, 2.0, WHITE, squash=0.8, seed=12)
    p.blob(-1.5, -0.8, 4.9, 2.2, WHITE, squash=0.8, seed=13)
    return p


def tree_tall():
    p = Piece('tree_tall')
    p.cone(0, 0, 0, 0.35, 0.22, 3.0, TRUNK, sides=5)
    p.blob(0, 0, 8.2, 2.3, WHITE, squash=2.6, seed=21)
    return p


def tree_pine():
    p = Piece('tree_pine')
    p.cone(0, 0, 0, 0.3, 0.2, 2.4, TRUNK, sides=5)
    for z, r, h in ((1.8, 2.6, 4.2), (4.2, 2.0, 3.8), (6.4, 1.4, 3.6)):
        p.cone(0, 0, z, r, 0.05, h, WHITE, TINT_A, sides=7, cap=True)
    return p


def bush():
    p = Piece('bush')
    p.blob(0, 0, 0.7, 1.2, WHITE, squash=0.7, seed=31)
    p.blob(1.0, 0.3, 0.55, 0.9, WHITE, squash=0.7, seed=32)
    return p


def house_far():
    """A terraced house for the far streets: the same size as house_terrace, a tenth of the detail."""
    p = Piece('house_far')
    w, d, h = 6.0, 9.0, 5.6
    p.box(0, 0, 0, w, d, h, WHITE, TINT_A)
    p.gable(0, 0, h, w, d, 2.6, WHITE, TINT_B, along='x', over=0.0)
    p.windows([0], [3.3], 4.2, 1.3, -d / 2)
    return p


def tree_far():
    p = Piece('tree_far')
    p.cone(0, 0, 0, 0.4, 0.3, 3.0, TRUNK, sides=4)
    p.cone(0, 0, 2.6, 3.0, 1.2, 5.4, WHITE, TINT_A, sides=5, cap=True)
    return p


def car():
    """A hatchback, its nose towards +x. Wheels are one dark slab under the body: cars are
    only ever seen from the stands or the air, and a full car park is a lot of cars."""
    p = Piece('car')
    p.box(0, 0, 0.12, 3.5, 1.6, 0.3, TYRE)
    p.box(0, 0, 0.36, 4.1, 1.75, 0.56, WHITE, TINT_A, top=0.97)
    cab = p.box(-0.25, 0, 0.92, 2.5, 1.62, 0.56, GLASS, WINDOW, top=0.78)
    p.paint([cab[-1]], WHITE, TINT_A)
    return p


def van():
    p = Piece('van')
    p.box(0.1, 0, 0.14, 4.4, 1.75, 0.3, TYRE)
    p.box(-0.5, 0, 0.4, 3.7, 1.95, 1.7, WHITE, TINT_A)
    p.box(2.0, 0, 0.4, 1.4, 1.9, 0.9, WHITE, TINT_A, top=0.94)
    cab = p.box(1.75, 0, 1.3, 0.9, 1.8, 0.75, GLASS, WINDOW, top=0.86)
    p.paint([cab[-1]], WHITE, TINT_A)
    return p


def lamp():
    p = Piece('lamp')
    p.cone(0, 0, 0, 0.09, 0.06, 6.5, DARK, sides=5)
    p.box(0, -0.5, 6.4, 0.18, 1.2, 0.12, DARK, bottom=True)
    p.panel(0, 0, 0.3, 0.3, 0, WHITE, WINDOW)
    f = p.bm.faces[:][-1]
    for v, q in zip(f.verts, ((-0.12, -1.0, 6.38), (0.12, -1.0, 6.38), (0.12, -0.6, 6.38), (-0.12, -0.6, 6.38))):
        v.co = q
    return p


def tower(name, w, d, h, cols, rows, crown):
    """A far-off office tower: bands of windows on every side, and something on the roof."""
    p = Piece(name)
    p.box(0, 0, 0, w, d, h, WHITE, TINT_A)
    fw, fh = 0.62, 0.55
    for side, span, wall in (('front', w, -d / 2), ('back', w, d / 2), ('left', d, -w / 2), ('right', d, w / 2)):
        step = span / cols
        xs = [-span / 2 + step * (i + 0.5) for i in range(cols)]
        zs = [6 + (h - 10) / rows * j for j in range(rows)]
        for x in xs:
            for z in zs:
                p.panel(x, z, step * fw, (h - 10) / rows * fh, wall, GLASS, WINDOW, side)
    crown(p, h)
    return p


def tower_a():
    def crown(p, h):
        p.box(0, 0, h, 16, 16, 5, STONE)
        p.cone(0, 0, h + 5, 0.6, 0.2, 22, METAL, sides=4)
    return tower('tower_a', 28, 28, 96, 4, 11, crown)


def tower_b():
    def crown(p, h):
        p.box(-8, 0, h, 12, 10, 4, METAL)
    return tower('tower_b', 44, 18, 58, 6, 7, crown)


def tower_c():
    def crown(p, h):
        p.box(0, 0, h, 18, 18, 26, WHITE, TINT_A)
        p.box(0, 0, h + 26, 10, 10, 14, WHITE, TINT_A)
        p.cone(0, 0, h + 40, 3.5, 0.1, 16, WHITE, TINT_B, sides=4)
    return tower('tower_c', 30, 30, 62, 4, 7, crown)


def hills():
    """The ring of hills round the whole scene, 780 m to 1,500 m out: a low patchwork at
    its inner edge rising to ridges 150 to 300 m high, with gaps where valleys run through."""
    p = Piece('hills', shadows=False)
    segs, rings = 96, 7
    r0, r1 = 780.0, 1500.0
    low, wood, heath, rock = rgb('#6f8552'), rgb('#4c6944'), rgb('#7c7d5e'), rgb('#8b8a80')

    def height(r, a):
        t = (r - r0) / (r1 - r0)
        rise = smooth(0.0, 0.42, t)
        c, s = math.cos(a), math.sin(a)
        ridge = 0.55 + 0.45 * noise.noise(Vector((c * 1.3, s * 1.3, 0.37)))
        gap = smooth(-0.25, 0.2, noise.noise(Vector((c * 0.8 + 5, s * 0.8, 2.1))))
        rough = noise.noise(Vector((c * 4.2, s * 4.2, t * 2.4 + 9)))
        return rise * (230 * ridge * (0.35 + 0.65 * gap) + 55 * rough * t + 30)

    grid = []
    for i in range(rings + 1):
        r = r0 + (r1 - r0) * (i / rings) ** 0.8
        row = []
        for j in range(segs):
            a = 2 * math.pi * (j + 0.5 * (i % 2)) / segs
            row.append(p.bm.verts.new((r * math.cos(a), r * math.sin(a), max(0.0, height(r, a)))))
        grid.append(row)
    rng = random.Random(5)
    for i in range(rings):
        for j in range(segs):
            k = (j + 1) % segs
            a, b, c, d = grid[i][j], grid[i][k], grid[i + 1][k], grid[i + 1][j]
            tris = ((a, b, d), (b, c, d)) if i % 2 == 0 else ((a, b, c), (a, c, d))
            for tri in tris:
                f = p.bm.faces.new(tri)
                f.normal_update()
                z = sum(v.co.z for v in tri) / 3
                steep = 1 - abs(f.normal.z) if f.normal.length else 0
                base = low if z < 45 else wood if z < 150 else heath if z < 230 else rock
                if z >= 45 and rng.random() < 0.3:
                    base = wood
                k2 = 0.9 + 0.2 * rng.random() - 0.25 * steep
                p.paint([f], tuple(min(1.0, ch * k2) for ch in base), FIXED)
    return p


def smooth(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def cloud():
    """A flat-bottomed heap of cloud, about 150 m across."""
    p = Piece('cloud', shadows=False)
    white = rgb('#f4f6f8')
    for x, y, z, r, seed in ((0, 0, 14, 34, 41), (38, 6, 8, 26, 42), (-36, -4, 9, 28, 43), (70, 0, 4, 18, 44), (-66, 4, 3, 16, 45), (10, 18, 6, 22, 46)):
        p.blob(x, y, z, r, white, FIXED, squash=0.42, seed=seed)
    for v in p.bm.verts:
        v.co.z = max(v.co.z, 0.0)
    return p


PIECES = [terrace, detached, shop, flats, church, works, house_far, tree_round, tree_tall, tree_pine, tree_far, bush, car, van, lamp, tower_a, tower_b, tower_c, hills, cloud]


# ---- preview render (only to look at; nothing here reaches the game) --------------------

def preview(pieces, work):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    tints_a = [rgb(c) for c in ('#b5654a', '#d8cbb2', '#e6dfd0', '#9a8f84', '#3f7a3a', '#2f6b8f')]
    tints_b = [rgb(c) for c in ('#5b3a2e', '#4a4b52', '#7a4632', '#6b5a4e')]
    mat = bpy.data.materials.new('p')
    mat.use_nodes = True
    attr = mat.node_tree.nodes.new('ShaderNodeAttribute')
    attr.attribute_name = 'col'
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 0.9
    mat.node_tree.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    x = 0.0
    for k, data in enumerate(pieces):
        if data['name'] in ('hills', 'cloud'):
            continue
        P = data['positions']
        mesh = bpy.data.meshes.new(data['name'])
        idx = data['index']
        mesh.from_pydata([(p[0], -p[2], p[1]) for p in P], [], [idx[i:i + 3] for i in range(0, len(idx), 3)])
        col = mesh.color_attributes.new('col', 'FLOAT_COLOR', 'POINT')
        green = 'tree' in data['name'] or data['name'] == 'bush'
        for i, c in enumerate(data['colors']):
            t = {0: WHITE, 1: rgb('#3f7a3a') if green else tints_a[k % len(tints_a)], 2: tints_b[k % len(tints_b)], 3: WHITE}[min(3, c[3])]
            col.data[i].color = ((c[0] * t[0]) ** 2.2, (c[1] * t[1]) ** 2.2, (c[2] * t[2]) ** 2.2, 1)
        mesh.materials.append(mat)
        obj = bpy.data.objects.new(data['name'], mesh)
        wide = max(p[0] for p in P) - min(p[0] for p in P)
        obj.location = (x + wide / 2, 0, 0)
        x += wide + 4
        scene.collection.objects.link(obj)
    ground = bpy.data.meshes.new('g')
    ground.from_pydata([(-50, -80, 0), (x + 50, -80, 0), (x + 50, 80, 0), (-50, 80, 0)], [], [(0, 1, 2, 3)])
    gm = bpy.data.materials.new('g')
    gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.1, 0.16, 0.07, 1)
    ground.materials.append(gm)
    scene.collection.objects.link(bpy.data.objects.new('g', ground))
    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.7, 0.8, 0.95, 1)
    scene.world = world
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 3
    sun.rotation_euler = (math.radians(55), 0, math.radians(-35))
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.lens = 45
    cam.data.clip_end = 2000
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.render.resolution_x = 1800
    scene.render.resolution_y = 640
    cam.location = (x / 2 - 20, -x * 0.95, x * 0.4)
    look = Vector((x / 2, 0, 5)) - cam.location
    cam.rotation_euler = look.to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = str(Path(work) / 'scenery.png')
    bpy.ops.render.render(write_still=True)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args:
        raise SystemExit('usage: python3 scenery-kit.py <work-dir> [--preview]')
    work = Path(args[0])
    work.mkdir(parents=True, exist_ok=True)
    pieces = [make().export() for make in PIECES]
    (work / 'scenery.json').write_text(json.dumps(pieces))
    if '--preview' in sys.argv:
        preview(pieces, work)


main()
