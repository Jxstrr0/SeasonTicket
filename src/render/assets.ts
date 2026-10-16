/**
 * Asset loading for every 3D scene: glTF with Meshopt geometry and KTX2
 * (Basis) textures. Files are fetched once and cached per URL.
 */
import type { Texture, WebGLRenderer } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export type Progress = (loaded: number, total: number) => void;

export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}

export class Assets {
  readonly ktx2: KTX2Loader;
  readonly gltf: GLTFLoader;
  private readonly models = new Map<string, Promise<GLTF>>();
  private readonly textures = new Map<string, Promise<Texture>>();

  constructor(renderer: WebGLRenderer) {
    this.ktx2 = new KTX2Loader().detectSupport(renderer);
    this.gltf = new GLTFLoader().setKTX2Loader(this.ktx2).setMeshoptDecoder(MeshoptDecoder);
  }

  model(path: string, onBytes?: (loaded: number) => void): Promise<GLTF> {
    let p = this.models.get(path);
    if (!p) {
      p = this.gltf.loadAsync(assetUrl(path), (e) => onBytes?.(e.loaded));
      this.models.set(path, p);
    }
    return p;
  }

  texture(path: string): Promise<Texture> {
    let p = this.textures.get(path);
    if (!p) {
      p = this.ktx2.loadAsync(assetUrl(path));
      this.textures.set(path, p);
    }
    return p;
  }

  dispose(): void {
    this.ktx2.dispose();
  }
}
