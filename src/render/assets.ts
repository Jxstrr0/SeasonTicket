/**
 * Asset loading for every 3D scene: glTF with Meshopt geometry and KTX2
 * (Basis) textures. Files are fetched once and cached per URL.
 *
 * Every scene shares one KTX2 loader (and so one set of texture decoding workers): the
 * office and the match day can be open together, and each loader starts its own workers.
 */
import type { Texture, WebGLRenderer } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export type Progress = (loaded: number, total: number) => void;

export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}

/** The shared KTX2 loader and how many scenes are using it. */
let shared: { loader: KTX2Loader; users: number } | null = null;

export class Assets {
  readonly ktx2: KTX2Loader;
  readonly gltf: GLTFLoader;
  private readonly models = new Map<string, Promise<GLTF>>();
  private readonly textures = new Map<string, Promise<Texture>>();
  private disposed = false;

  constructor(renderer: WebGLRenderer) {
    // The texture formats a phone's GPU takes are the same for every canvas on the page.
    shared ??= { loader: new KTX2Loader().detectSupport(renderer), users: 0 };
    shared.users += 1;
    this.ktx2 = shared.loader;
    this.gltf = new GLTFLoader().setKTX2Loader(this.ktx2).setMeshoptDecoder(MeshoptDecoder);
  }

  model(path: string, onBytes?: (loaded: number) => void): Promise<GLTF> {
    let p = this.models.get(path);
    if (!p) {
      p = this.gltf.loadAsync(assetUrl(path), (e) => onBytes?.(e.loaded));
      this.models.set(path, p);
      // A failed download (a dropped connection) must not be remembered: the next ask tries again.
      p.catch(() => this.models.delete(path));
    }
    return p;
  }

  texture(path: string): Promise<Texture> {
    let p = this.textures.get(path);
    if (!p) {
      p = this.ktx2.loadAsync(assetUrl(path));
      this.textures.set(path, p);
      p.catch(() => this.textures.delete(path));
    }
    return p;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (shared && shared.loader === this.ktx2 && --shared.users === 0) {
      shared.loader.dispose();
      shared = null;
    }
  }
}
