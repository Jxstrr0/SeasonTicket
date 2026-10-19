import { describe, expect, it } from 'vitest';
import { coreFiles, serviceWorkerSource } from '../src/pwa/serviceWorker';

describe('offline cache (Stage 7.5)', () => {
  it('stores the game code but leaves heavy 3D and sound files to load when needed', () => {
    const files = coreFiles([
      'index.html',
      'assets/index-abc.js',
      'assets/index-abc.css',
      'assets/office/desk.glb',
      'assets/match/player.glb',
      'assets/audio/crowd.ogg',
      'icons/icon-192.png',
      'manifest.webmanifest',
      'assets/worker-xyz.js',
    ]);
    expect(files).toContain('assets/index-abc.js');
    expect(files).toContain('assets/worker-xyz.js');
    expect(files).toContain('icons/icon-192.png');
    expect(files).toContain('manifest.webmanifest');
    expect(files.some((f) => /office|match\/|audio/.test(f))).toBe(false);
  });

  it('writes a worker that names its build and the files to store', () => {
    const src = serviceWorkerSource('b42', ['assets/index-abc.js']);
    expect(src).toContain("'st-b42'");
    expect(src).toContain('"./","assets/index-abc.js"');
    expect(src).toContain("'skip-waiting'");
    // The source parses as a script.
    expect(() => new Function(src)).not.toThrow();
  });
});
