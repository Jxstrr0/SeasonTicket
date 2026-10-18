/**
 * The 3D match's cameras (Stage 5.3): broadcast, owner's box, behind the goal and overhead,
 * which the owner picks, plus a low touchline camera that only the replays use. Each one
 * follows an aim point that eases towards the ball; changing camera is a cut, as on TV.
 *
 * Plain numbers in, a placed PerspectiveCamera out. Positions are in stadium space (x along
 * the pitch, z across it with the main stand on +z, y up).
 */
import { MathUtils, Vector3, type PerspectiveCamera } from 'three';
import tuning from '../../data/tuning/match3d.json';
import { SIDE_FRONT, standProfile } from '../stadium/layout';
import type { StadiumSnapshot } from '../stadium/types';

import type { CameraKey } from './cameraKeys';

export { CAMERA_PRESETS, type CameraKey } from './cameraKeys';

const B = tuning.camera;
const C = tuning.cameras;
const DEG = Math.PI / 180;
const GOAL_X = 52.5;

interface Lens {
  hfov: number;
  minVfov: number;
  maxVfov: number;
  near: number;
  damping: number;
}

const LENS: Record<CameraKey, Lens> = {
  broadcast: { hfov: B.hfov, minVfov: B.minVfov, maxVfov: B.maxVfov, near: 1, damping: B.damping },
  box: C.box,
  goal: C.goal,
  overhead: C.overhead,
  side: C.side,
};

/** Where the owner sits: inside the main stand's box row, or at the back of the stand if it has none. */
export function ownersBox(ground: StadiumSnapshot): { y: number; z: number } {
  const west = ground.stands.west;
  const p = standProfile(west.level, west.boxRows);
  const box = p.bands.find((b) => b.glass);
  if (box) return { y: box.y0 + C.box.eye, z: SIDE_FRONT + box.d + C.box.behindGlass };
  const row = p.rows[p.rows.length - 1];
  return { y: (row?.y ?? 0) + C.box.eye, z: SIDE_FRONT + (row ? (row.d0 + row.d1) / 2 : 0) };
}

export class MatchCamera {
  private key: CameraKey = 'broadcast';
  /** The goal end the behind-the-goal camera is at (-1 or 1), and whether it is held there. */
  private end = 1;
  private heldEnd = false;
  private aspect = 1;
  private readonly aim = new Vector3();
  private readonly goal = new Vector3();
  private readonly look = new Vector3();
  private readonly box: { y: number; z: number };

  constructor(private readonly camera: PerspectiveCamera, ground: StadiumSnapshot) {
    this.box = ownersBox(ground);
  }

  get current(): CameraKey {
    return this.key;
  }

  /**
   * Cuts to camera `key`. `end` holds the behind-the-goal camera at one end (-1 or 1), as a
   * replay does; 0 lets it follow the play.
   */
  set(key: CameraKey, end = 0): void {
    this.key = key;
    this.heldEnd = end !== 0;
    if (end !== 0) this.end = end;
    else if (key === 'goal') this.end = this.aim.x < 0 ? -1 : 1;
    this.aim.copy(this.goal);
    this.lens();
  }

  /** Where the ball is (stadium x and z). `snap` puts the aim straight on it. */
  follow(x: number, z: number, snap: boolean): void {
    this.goal.set(MathUtils.clamp(x, -B.maxX, B.maxX), 0, z);
    if (snap) this.aim.copy(this.goal);
  }

  resize(aspect: number): void {
    this.aspect = aspect;
    this.lens();
  }

  /** Eases the aim on by `dt` seconds and places the camera; true while it is still moving. */
  tick(dt: number): boolean {
    const moving = this.aim.distanceToSquared(this.goal) > 1e-4;
    if (moving) this.aim.lerp(this.goal, 1 - Math.exp(-dt * LENS[this.key].damping));
    this.place();
    return moving;
  }

  private lens(hfov = LENS[this.key].hfov): void {
    const l = LENS[this.key];
    const cam = this.camera;
    cam.aspect = this.aspect;
    // Keep the same width of pitch in view on any screen shape.
    const vfov = 2 * Math.atan(Math.tan((hfov * DEG) / 2) / this.aspect);
    cam.fov = MathUtils.clamp(vfov / DEG, l.minVfov, l.maxVfov);
    cam.near = l.near;
    cam.updateProjectionMatrix();
  }

  private place(): void {
    const { aim, look } = this;
    const pos = this.camera.position;
    switch (this.key) {
      case 'broadcast':
        pos.set(aim.x * B.follow, B.height, B.z);
        look.set(aim.x, 0, aim.z * B.lookZ);
        break;
      case 'box':
        pos.set(0, this.box.y, this.box.z);
        look.set(aim.x * C.box.turn, 0, aim.z * C.box.lookZ);
        break;
      case 'goal': {
        const g = C.goal;
        if (!this.heldEnd) {
          // Swap ends once the play is well into the other half (a cut, as on TV).
          if (this.end > 0 && aim.x < -g.swapAt) this.end = -1;
          else if (this.end < 0 && aim.x > g.swapAt) this.end = 1;
        }
        const e = this.end;
        pos.set(e * (GOAL_X + g.back), g.height, aim.z * g.followZ);
        // Never look back past the goal line at the camera's own end.
        const lx = e > 0 ? Math.min(aim.x, GOAL_X - g.minAhead) : Math.max(aim.x, -GOAL_X + g.minAhead);
        look.set(lx, 0, aim.z);
        break;
      }
      case 'overhead': {
        const o = C.overhead;
        pos.set(aim.x * o.follow, o.height, o.z);
        look.set(aim.x * o.follow, 0, o.lookZ);
        break;
      }
      case 'side': {
        const s = C.side;
        // Play near the touchline: slide back towards halfway to keep a little distance.
        const dz = s.z - aim.z;
        const back = Math.sqrt(Math.max(0, s.minDist * s.minDist - dz * dz));
        const x = aim.x * s.follow - (aim.x < 0 ? -1 : 1) * back;
        pos.set(MathUtils.clamp(x, -s.maxX, s.maxX), s.height, s.z);
        look.set(aim.x, s.lookY, aim.z);
        // Zoom in on play across the pitch, so it fills about the same width as nearby play.
        const zoom = (2 * Math.atan(s.span / 2 / Math.max(1, pos.distanceTo(look)))) / DEG;
        this.lens(MathUtils.clamp(zoom, s.minHfov, s.hfov));
        break;
      }
    }
    this.camera.lookAt(look);
  }
}
