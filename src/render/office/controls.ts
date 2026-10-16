/**
 * Swipe to look around from the owner's chair. Dragging grabs the scene
 * (drag right and the room follows your finger), with a little glide after
 * you let go. A short touch without movement is a tap.
 */
import { MathUtils, type PerspectiveCamera } from 'three';

export interface LookConfig {
  startYaw: number;
  startPitch: number;
  yawLimit: number;
  pitchMin: number;
  pitchMax: number;
  degreesPerPixel: number;
  damping: number;
  tapSlopPx: number;
}

const TAP_MS = 500;

export class LookControls {
  yaw: number;
  pitch: number;
  private vYaw = 0;
  private vPitch = 0;
  private pointer: number | null = null;
  private start = { x: 0, y: 0, t: 0 };
  private last = { x: 0, y: 0 };
  private moved = 0;
  private dragging = false;

  constructor(
    private readonly el: HTMLElement,
    private readonly cfg: LookConfig,
    private readonly onTap: (clientX: number, clientY: number) => void,
    private readonly onChange: () => void,
  ) {
    this.yaw = cfg.startYaw;
    this.pitch = cfg.startPitch;
    el.addEventListener('pointerdown', this.down);
    el.addEventListener('pointermove', this.move);
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.cancel);
  }

  private readonly down = (e: PointerEvent): void => {
    if (this.pointer !== null) return;
    this.pointer = e.pointerId;
    this.el.setPointerCapture?.(e.pointerId);
    this.start = { x: e.clientX, y: e.clientY, t: performance.now() };
    this.last = { x: e.clientX, y: e.clientY };
    this.moved = 0;
    this.dragging = true;
    this.vYaw = 0;
    this.vPitch = 0;
  };

  private readonly move = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointer) return;
    const dx = e.clientX - this.last.x;
    const dy = e.clientY - this.last.y;
    this.last = { x: e.clientX, y: e.clientY };
    this.moved = Math.max(this.moved, Math.hypot(e.clientX - this.start.x, e.clientY - this.start.y));
    if (this.moved < this.cfg.tapSlopPx) return;
    const k = this.cfg.degreesPerPixel;
    this.vYaw = dx * k;
    this.vPitch = dy * k;
    this.turn(this.vYaw, this.vPitch);
  };

  private readonly up = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointer) return;
    this.pointer = null;
    this.dragging = false;
    if (this.moved < this.cfg.tapSlopPx && performance.now() - this.start.t < TAP_MS) {
      this.vYaw = 0;
      this.vPitch = 0;
      this.onTap(e.clientX, e.clientY);
    } else {
      this.onChange();
    }
  };

  private readonly cancel = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointer) return;
    this.pointer = null;
    this.dragging = false;
  };

  private turn(dYaw: number, dPitch: number): void {
    const c = this.cfg;
    this.yaw = MathUtils.clamp(this.yaw + dYaw, -c.yawLimit, c.yawLimit);
    this.pitch = MathUtils.clamp(this.pitch + dPitch, c.pitchMin, c.pitchMax);
    this.onChange();
  }

  /** Turns the camera to look somewhere, e.g. at a visitor walking in. */
  lookAt(yaw: number, pitch: number): void {
    this.vYaw = 0;
    this.vPitch = 0;
    this.yaw = MathUtils.clamp(yaw, -this.cfg.yawLimit, this.cfg.yawLimit);
    this.pitch = MathUtils.clamp(pitch, this.cfg.pitchMin, this.cfg.pitchMax);
  }

  /** Glides after release. Returns true while the view is still moving. */
  update(dt: number): boolean {
    if (this.dragging) {
      // Slow fingers stop the glide: decay velocity between move events.
      this.vYaw *= 0.5;
      this.vPitch *= 0.5;
      return false;
    }
    if (Math.abs(this.vYaw) < 0.01 && Math.abs(this.vPitch) < 0.01) return false;
    const f = Math.pow(this.cfg.damping, dt * 60);
    this.vYaw *= f;
    this.vPitch *= f;
    this.turn(this.vYaw * dt * 60, this.vPitch * dt * 60);
    return true;
  }

  apply(camera: PerspectiveCamera): void {
    camera.rotation.set(MathUtils.degToRad(this.pitch), MathUtils.degToRad(this.yaw), 0, 'YXZ');
  }

  dispose(): void {
    this.el.removeEventListener('pointerdown', this.down);
    this.el.removeEventListener('pointermove', this.move);
    this.el.removeEventListener('pointerup', this.up);
    this.el.removeEventListener('pointercancel', this.cancel);
  }
}
