"""Models the match-day kit over the base body, in Blender (the `bpy` Python module).

    python3 players-kit.py <work-dir> [--preview]

Reads <work-dir>/body.json (from `node build-players.mjs extract`): the body standing in its
rest pose, a T-pose in metres with y up and the face towards +z, with each vertex's bone
weights. Writes outfield.json and keeper.json for `node build-players.mjs pack`.

Every garment starts as a copy of the skin it covers, so it keeps the skin's bone weights and
bends exactly as the body does. The copy is then cut to a clean edge, smoothed, let out and
given a hem, and the skin underneath is thrown away. Each vertex carries a colour the game's
shader reads: red is the part (PART below), green a baked soft shadow.

--preview also renders <work-dir>/<variant>-front.png and -back.png to look at.
"""
import json
import math
import random
import sys
from pathlib import Path

import bpy  # before bmesh and mathutils, which it provides
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

PART = {'skin': 0, 'shirt': 1, 'trim': 2, 'shorts': 3, 'socks': 4, 'boots': 5, 'gloves': 6, 'sole': 7}

# Heights (y) and distances out along the arms (x), in metres on the rest pose.
BOOT_TOP = 0.125
SOCK_TOP = 0.475
SHORTS_HEM = 0.63
SHORTS_TOP = 1.0
SHIRT_HEM = 0.915
ARM_Y, ARM_Z = 1.455, -0.068
LEG_X, LEG_Z = 0.114, -0.036
SLEEVE = {'outfield': 0.4, 'keeper': 0.655}
SKIN_MARGIN = 0.035
NECK = Vector((0, 1.452, -0.035))
# Four planes around the neck; the skin above all of them is the neck, the rest is shirt.
NECK_PLANES = [Vector((-0.80, 0.6, 0)), Vector((0.80, 0.6, 0)), Vector((0, 0.72, -0.69)), Vector((0, 0.5, 0.87))]


def smooth(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


class Kit:
    def __init__(self, body, variant):
        self.variant = variant
        self.sleeve = SLEEVE[variant]
        bm = self.bm = bmesh.new()
        self.dl = bm.verts.layers.deform.verify()
        self.part = bm.faces.layers.int.new('part')
        self.n0 = bm.verts.layers.float_vector.new('n0')
        self.tag = bm.verts.layers.int.new('tag')
        self.cut_at = bm.verts.layers.float_vector.new('cut')
        verts = []
        for p, w in zip(body['positions'], body['weights']):
            v = bm.verts.new(p)
            for j, x in w:
                v[self.dl][j] = x
            verts.append(v)
        idx = body['index']
        for i in range(0, len(idx), 3):
            try:
                bm.faces.new((verts[idx[i]], verts[idx[i + 1]], verts[idx[i + 2]]))
            except ValueError:
                pass
        # The file splits vertices along texture seams; the kit wants one skin.
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        self.cuts()
        bm.normal_update()
        for v in bm.verts:
            v[self.n0] = v.normal
        self.sharp = []

    # ---- cutting the body into regions -------------------------------------------------

    def cut(self, co, no, keep):
        faces = [f for f in self.bm.faces if keep(f.calc_center_median())]
        geom = set(faces)
        for f in faces:
            geom.update(f.edges)
            geom.update(f.verts)
        bmesh.ops.bisect_plane(self.bm, geom=list(geom), dist=1e-5, plane_co=co, plane_no=no)

    def cuts(self):
        up = Vector((0, 1, 0))
        legs = lambda c: c.y < 1.1
        for y in (BOOT_TOP, SOCK_TOP, SHORTS_HEM, SHORTS_HEM + SKIN_MARGIN, SHIRT_HEM, SHORTS_TOP):
            self.cut(Vector((0, y, 0)), up, legs)
        arms = lambda c: c.y > 1.3 and abs(c.x) > 0.25
        for x in (self.sleeve, self.sleeve - SKIN_MARGIN):
            for s in (-1, 1):
                self.cut(Vector((s * x, 0, 0)), Vector((1, 0, 0)), arms)
        near = lambda c: c.y > 1.38 and abs(c.x) < 0.2
        for n in NECK_PLANES:
            self.cut(NECK, n.normalized(), near)
        bmesh.ops.triangulate(self.bm, faces=self.bm.faces)

    def region(self, c):
        """Which garments cover the skin at c, outermost first; an empty list is bare skin."""
        ax = abs(c.x)
        if c.y < BOOT_TOP:
            return ['boots']
        if c.y < SOCK_TOP:
            return ['socks']
        if c.y < SHORTS_HEM:
            return []
        if c.y < SHIRT_HEM:
            return ['shorts']
        if c.y < SHORTS_TOP:
            return ['shirt', 'shorts']
        if c.y > 1.3 and ax > 0.25:
            if ax < self.sleeve:
                return ['shirt']
            return ['gloves'] if self.variant == 'keeper' else []
        if all((c - NECK).dot(n) > 0 for n in NECK_PLANES):
            return []
        return ['shirt']

    def keep_skin(self, c):
        """Skin that shows, plus a little under each open hem so nothing looks hollow."""
        r = self.region(c)
        if not r:
            return True
        if r == ['shorts'] and c.y < SHORTS_HEM + SKIN_MARGIN:
            return True
        return r == ['shirt'] and c.y > 1.3 and abs(c.x) > self.sleeve - SKIN_MARGIN

    # ---- the garments ------------------------------------------------------------------

    def garment(self, name, edges):
        """Copies the skin under garment `name`. `edges` names its open edges: tag -> test of a
        rest position. Hems are found by tag later, after the cloth has been let out."""
        bm = self.bm
        src = [f for f in bm.faces if f[self.part] == 0 and name in self.region(f.calc_center_median())]
        out = bmesh.ops.duplicate(bm, geom=src)
        faces = [g for g in out['geom'] if isinstance(g, bmesh.types.BMFace)]
        for f in faces:
            f[self.part] = PART[name]
        verts = list({v for f in faces for v in f.verts})
        for v in verts:
            v[self.tag] = 0
            v[self.cut_at] = v.co
            if v.is_boundary:
                for tag, on in edges.items():
                    if on(v.co):
                        v[self.tag] = tag
        return verts

    def pin(self, verts, axis):
        """Puts the tagged edges back on the flat cut they were made on, so hems run straight."""
        for v in verts:
            if v[self.tag]:
                v.co[axis] = v[self.cut_at][axis]

    def relax(self, verts, rounds, factor=0.5):
        inner = [v for v in verts if not v.is_boundary]
        for _ in range(rounds):
            bmesh.ops.smooth_vert(self.bm, verts=inner, factor=factor, use_axis_x=True, use_axis_y=True, use_axis_z=True)

    def hem(self, verts, tag, move, part, sharp=True):
        """Turns the open edge tagged `tag` into a rim: a new ring of faces out to move(co).
        The new ring's own edge takes the tag, so a second call folds it again."""
        edges = list({e for v in verts for e in v.link_edges if e.is_boundary and e.verts[0][self.tag] == tag and e.verts[1][self.tag] == tag})
        if not edges:
            raise RuntimeError(f'no open edge tagged {tag} for {part}')
        for v in {v for e in edges for v in e.verts}:
            v[self.tag] = 0
        out = bmesh.ops.extrude_edge_only(self.bm, edges=edges)
        ring = []
        for g in out['geom']:
            if isinstance(g, bmesh.types.BMVert):
                g.co = move(g.co.copy())
                g[self.tag] = tag
                ring.append(g)
            elif isinstance(g, bmesh.types.BMFace):
                g[self.part] = PART[part]
        if sharp:
            self.sharp += edges
        return ring

    @staticmethod
    def about(c, x, y, z, k, shift=(0, 0, 0)):
        """c pulled towards (k < 1) or pushed from (k > 1) the point (x, y, z); None keeps an axis."""
        return Vector((
            (c.x if x is None else x + (c.x - x) * k) + shift[0],
            (c.y if y is None else y + (c.y - y) * k) + shift[1],
            (c.z if z is None else z + (c.z - z) * k) + shift[2],
        ))

    def shirt(self):
        on_cuff = lambda s: lambda c: c.y > 1.3 and abs(c.x - s * self.sleeve) < 1e-4
        verts = self.garment('shirt', {
            1: on_cuff(1),
            2: on_cuff(-1),
            3: lambda c: abs(c.y - SHIRT_HEM) < 1e-4,
            4: lambda c: c.y > 1.4 and abs(c.x) < 0.2,
        })
        self.relax(verts, 10)
        keeper = self.variant == 'keeper'
        for v in verts:
            p = v.co
            n = Vector(v[self.n0])
            ax = abs(p.x)
            arm = smooth(0.2, 0.3, ax) if p.y > 1.3 else 0.0
            # The body: let out a little,
            # most at the waist, where the body narrows, so the shirt hangs straight from the chest.
            loose = smooth(1.38, 1.12, p.y) * (1 - 0.55 * smooth(1.08, 0.92, p.y))
            body = Vector((p.x * (1 + 0.15 * loose), p.y, -0.01 + (p.z + 0.01) * (1 + 0.2 * loose))) + n * 0.012
            # The sleeve: a tube that opens towards the cuff (a keeper's closes on the wrist).
            t = smooth(0.22, self.sleeve, ax)
            grow = 1.22 + (0.1 * math.sin(t * math.pi) if keeper else 0.22 * t)
            if keeper:
                grow -= 0.1 * smooth(self.sleeve - 0.12, self.sleeve, ax)
            sleeve = Vector((p.x, ARM_Y + (p.y - ARM_Y) * grow, ARM_Z + (p.z - ARM_Z) * grow))
            v.co = body.lerp(sleeve, arm)
        for v in verts:
            if v[self.tag] in (1, 2):
                v.co.x = v[self.cut_at].x
            elif v[self.tag] == 3:
                v.co.y = v[self.cut_at].y
        # The bottom hangs in one round, clear of the crease between the legs.
        edge = [v.co for v in verts if v[self.tag] == 3]
        wide = max(abs(c.x) for c in edge)
        front, back = max(c.z for c in edge), min(c.z for c in edge)
        mid, deep = (front + back) / 2, (front - back) / 2
        for v in verts:
            p = v.co
            if p.y > 1.05 or abs(p.x) > 0.25:
                continue
            e = math.hypot(p.x / wide, (p.z - mid) / deep)
            if 1e-3 < e < 1:
                k = 1 + (1 / e - 1) * 0.9 * smooth(1.05, SHIRT_HEM, p.y)
                v.co = Vector((p.x * k, p.y, mid + (p.z - mid) * k))
        # The cuffs: a band of trim, then the rim turned in to the arm.
        for tag, s in ((1, 1), (2, -1)):
            ring = self.hem(verts, tag, lambda c: c + Vector((s * 0.026, 0, 0)), 'trim')
            self.hem(ring, tag, lambda c: self.about(c, None, ARM_Y, ARM_Z, 0.5, (-s * 0.01, 0, 0)), 'trim')
        # The bottom edge, turned under.
        self.hem(verts, 3, lambda c: self.about(c, 0, None, -0.01, 0.8, (0, 0.012, 0)), 'shirt')
        # The collar: a band standing up round the neck, then its rim turned in.
        ring = self.hem(verts, 4, lambda c: self.about(c, 0, None, NECK.z, 0.95, (0, 0.024, 0)), 'trim')
        self.hem(ring, 4, lambda c: self.about(c, 0, None, NECK.z, 0.8, (0, -0.014, 0)), 'trim')

    def shorts(self):
        verts = self.garment('shorts', {1: lambda c: abs(c.y - SHORTS_HEM) < 1e-4})
        self.relax(verts, 4)
        for v in verts:
            p = v.co
            n = Vector(v[self.n0])
            s = 1 if p.x >= 0 else -1
            # Each leg is a tube that opens towards its hem, mostly outwards and to the front
            # and back: the insides of the two legs stay clear of each other.
            t = smooth(0.9, SHORTS_HEM, p.y)
            dx = p.x - s * LEG_X
            dz = p.z - LEG_Z
            out = 1 + (0.26 if dx * s > 0 else 0.05) * t
            # Under the shirt the shorts lie close, so they never show through it.
            thick = 0.012 * (1 - 0.85 * smooth(SHIRT_HEM - 0.02, SHIRT_HEM + 0.03, p.y))
            v.co = Vector((s * LEG_X + dx * out, p.y, LEG_Z + dz * (1 + 0.2 * t))) + n * thick
        self.pin(verts, 1)
        self.hem(verts, 1, lambda c: self.about(c, (1 if c.x >= 0 else -1) * LEG_X, None, LEG_Z, 0.6, (0, 0.02, 0)), 'shorts')

    def socks(self):
        verts = self.garment('socks', {1: lambda c: abs(c.y - SOCK_TOP) < 1e-4})
        self.relax(verts, 2, 0.3)
        for v in verts:
            p = v.co
            n = Vector(v[self.n0])
            # A shin pad's bulge down the front.
            pad = 0.006 * smooth(0.0, 0.03, p.z - LEG_Z) * smooth(0.16, 0.22, p.y) * smooth(0.45, 0.4, p.y)
            v.co = p + n * (0.007 + pad)
        self.pin(verts, 1)
        # The turned-over top: out, up, and back in to the leg.
        leg = lambda c, k, dy: self.about(c, (1 if c.x >= 0 else -1) * LEG_X, None, LEG_Z, k, (0, dy, 0))
        ring = self.hem(verts, 1, lambda c: leg(c, 1.1, 0.0), 'trim')
        ring = self.hem(ring, 1, lambda c: leg(c, 1.0, 0.035), 'trim', sharp=False)
        self.hem(ring, 1, lambda c: leg(c, 0.8, 0.0), 'trim')

    def boots(self):
        bm = self.bm
        verts = self.garment('boots', {1: lambda c: abs(c.y - BOOT_TOP) < 1e-4})
        for s in (1, -1):
            # A boot is the foot wrapped tight in one smooth shell: toes, arch and all. The
            # shell is only a guide; the boot keeps the foot's own mesh, so it bends as the foot.
            foot = [v for v in verts if (v.co.x >= 0) == (s > 0)]
            guide = bmesh.new()
            bmesh.ops.convex_hull(guide, input=[guide.verts.new(v.co) for v in foot])
            shell = BVHTree.FromBMesh(guide)
            for v in foot:
                if v[self.tag] == 1:
                    continue
                n = Vector(v[self.n0])
                hit = shell.ray_cast(v.co - n * 0.002, n, 0.08)[0]
                if hit is not None:
                    v.co = hit
            guide.free()
        self.relax(verts, 3, 0.5)
        bm.normal_update()
        for v in verts:
            if v[self.tag] == 1:
                continue
            q = v.co + v.normal * 0.008
            # A flat sole with a little depth.
            if q.y < 0.018:
                q.y = -0.01
            v.co = q
        for f in {f for v in verts for f in v.link_faces}:
            if all(v.co.y < -0.009 for v in f.verts):
                f[self.part] = PART['sole']
        self.hem(verts, 1, lambda c: self.about(c, (1 if c.x >= 0 else -1) * LEG_X, None, None, 1.06, (0, 0.012, 0)), 'boots', sharp=False)

    def gloves(self):
        on_cuff = lambda s: lambda c: abs(c.x - s * self.sleeve) < 1e-4
        verts = self.garment('gloves', {1: on_cuff(1), 2: on_cuff(-1)})
        self.relax(verts, 3, 0.4)
        for v in verts:
            p = v.co
            # Padded: thick all round, thicker over the fingers.
            v.co = p + Vector(v[self.n0]) * (0.009 + 0.006 * smooth(0.74, 0.8, abs(p.x)))
        for tag, s in ((1, 1), (2, -1)):
            ring = self.hem(verts, tag, lambda c: self.about(c, None, ARM_Y, ARM_Z, 1.15, (-s * 0.035, 0, 0)), 'gloves', sharp=False)
            self.hem(ring, tag, lambda c: self.about(c, None, ARM_Y, ARM_Z, 0.6), 'gloves')

    def build(self):
        bm = self.bm
        self.shirt()
        self.shorts()
        self.socks()
        self.boots()
        if self.variant == 'keeper':
            self.gloves()
        gone = [f for f in bm.faces if f[self.part] == 0 and not self.keep_skin(f.calc_center_median())]
        bmesh.ops.delete(bm, geom=gone, context='FACES')
        # Each part, and each side of a hem's fold, shades on its own.
        edges = {e for e in self.sharp if e.is_valid}
        for e in bm.edges:
            if len({f[self.part] for f in e.link_faces}) > 1:
                edges.add(e)
        bmesh.ops.split_edges(bm, edges=list(edges))
        loose = [v for v in bm.verts if not v.link_faces]
        bmesh.ops.delete(bm, geom=loose, context='VERTS')
        bmesh.ops.triangulate(bm, faces=bm.faces)
        bm.normal_update()
        bm.verts.index_update()
        return self

    # ---- output ------------------------------------------------------------------------

    def shadows(self, rays=48, reach=0.3):
        """A soft shadow per vertex: how much of the sky above its surface the body hides."""
        bm = self.bm
        tree = BVHTree.FromBMesh(bm)
        rng = random.Random(7)
        out = []
        for v in bm.verts:
            n = v.normal
            origin = v.co + n * 0.004
            hit = 0.0
            for _ in range(rays):
                d = Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1)))
                if d.length < 1e-6:
                    continue
                d.normalize()
                if d.dot(n) < 0:
                    d = -d
                loc, _, _, dist = tree.ray_cast(origin, d, reach)
                if loc is not None:
                    hit += d.dot(n) * (1 - dist / reach)
            out.append(max(0.0, 1 - 2.2 * hit / rays))
        return out

    def export(self, path):
        bm = self.bm
        ao = self.shadows()
        part = [0] * len(bm.verts)
        for f in bm.faces:
            for v in f.verts:
                part[v.index] = f[self.part]
        data = {
            'positions': [[round(c, 5) for c in v.co] for v in bm.verts],
            'normals': [[round(c, 4) for c in v.normal] for v in bm.verts],
            'colors': [[part[v.index], round(255 * ao[v.index]), 0, 255] for v in bm.verts],
            'weights': [[[j, round(w, 4)] for j, w in v[self.dl].items() if w > 0.001] for v in bm.verts],
            'index': [v.index for f in bm.faces for v in f.verts],
        }
        Path(path).write_text(json.dumps(data))
        print(f'{Path(path).name}: {len(bm.verts)} vertices, {len(bm.faces)} triangles')
        return ao, part


# ---- preview renders (only to look at; nothing here reaches the game) -------------------

PREVIEW = {0: (0.78, 0.56, 0.42), 1: (0.75, 0.08, 0.1), 2: (0.95, 0.95, 0.95), 3: (0.95, 0.95, 0.95), 4: (0.75, 0.08, 0.1), 5: (0.02, 0.02, 0.02), 6: (0.9, 0.9, 0.2), 7: (0.6, 0.6, 0.6)}


def preview(kit, ao, part, work):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mesh = bpy.data.meshes.new('kit')
    kit.bm.to_mesh(mesh)
    col = mesh.color_attributes.new('col', 'FLOAT_COLOR', 'POINT')
    for i, c in enumerate(col.data):
        r, g, b = PREVIEW[part[i]]
        s = 0.35 + 0.65 * ao[i]
        c.color = (r * s, g * s, b * s, 1)
    for p in mesh.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new('kit', mesh)
    obj.rotation_euler = (math.pi / 2, 0, 0)
    scene = bpy.context.scene
    scene.collection.objects.link(obj)
    mat = bpy.data.materials.new('kit')
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    attr = nodes.new('ShaderNodeAttribute')
    attr.attribute_name = 'col'
    bsdf = nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 0.9
    mat.node_tree.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    mesh.materials.append(mat)
    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.75, 0.8, 0.85, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
    scene.world = world
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 2.5
    sun.rotation_euler = (math.radians(50), 0, math.radians(30))
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.lens = 60
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    for name, deg in (('front', -25), ('back', 155), ('side', -90)):
        a = math.radians(deg)
        d = 4.4
        cam.location = (d * math.sin(a), -d * math.cos(a), 1.5)
        look = Vector((0, 0, 0.92)) - cam.location
        cam.rotation_euler = look.to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(Path(work) / f'{kit.variant}-{name}.png')
        bpy.ops.render.render(write_still=True)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args:
        raise SystemExit('usage: python3 players-kit.py <work-dir> [--preview]')
    work = Path(args[0])
    body = json.loads((work / 'body.json').read_text())
    for variant in ('outfield', 'keeper'):
        kit = Kit(body, variant).build()
        ao, part = kit.export(work / f'{variant}.json')
        if '--preview' in sys.argv:
            preview(kit, ao, part, work)


main()
