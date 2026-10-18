/**
 * Plays matches off the main thread (docs/DESIGN.md 17.8). A MatchRunner takes match setups
 * and gives back results, in the order asked, from a pool of Web Workers so the screen never
 * freezes. Where workers are missing (tests, Node, an old browser) or fail to start, the same
 * matches play on this thread instead, one at a time with a pause between them so the page
 * can still draw. Either way the engine is the same code with the same seeds, so the results
 * are identical; resultFingerprint lets the Engine Lab check that on a real phone.
 */
import type { MatchContext } from '../sim/match/state';
import { simulateSpatialMatch } from '../sim/spatial/bridge';
import type { SpatialMode } from '../sim/spatial/types';
import type { MatchResult, MatchSetup, Player } from '../sim/types';

export interface MatchJob {
  setup: MatchSetup;
  ctx: MatchContext;
  /** Coarse for background matches, fine for one being watched. Defaults to coarse. */
  mode?: SpatialMode;
}

export type RunnerKind = 'worker' | 'inThread';

export interface MatchRunner {
  /** Where the matches are being played; a worker pool that fails to start becomes 'inThread'. */
  readonly kind: RunnerKind;
  /** Plays every job; results come back in the order of the jobs. */
  run(jobs: readonly MatchJob[], onProgress?: (done: number, total: number) => void): Promise<MatchResult[]>;
  /** Stops the workers. The runner can still be used: it starts them again. */
  dispose(): void;
}

/** What goes to a worker and comes back. */
export interface WorkerRequest {
  id: number;
  setup: MatchSetup;
  ctx: MatchContext;
  mode: SpatialMode;
}

export type WorkerReply = { id: number; result: MatchResult } | { id: number; error: string };

/** The two teams and only the players named for the match, so a message stays small. */
export function matchContextFor(setup: MatchSetup, ctx: MatchContext): MatchContext {
  const players: Record<string, Player> = {};
  for (const sel of [setup.home, setup.away]) {
    for (const id of [...sel.lineup.starters, ...sel.lineup.bench]) {
      const p = ctx.players[id];
      if (p) players[id] = p;
    }
  }
  const teams: MatchContext['teams'] = {};
  for (const id of [setup.homeId, setup.awayId]) if (ctx.teams[id]) teams[id] = ctx.teams[id];
  return { players, teams };
}

/** Plays one job here and now. */
export function playJob(job: MatchJob): MatchResult {
  return simulateSpatialMatch(job.setup, job.ctx, job.mode ?? 'coarse');
}

/** A short code for a result: the same match gives the same code on any device. */
export function resultFingerprint(result: MatchResult): string {
  return fingerprintOf(result);
}

/** A short code for any plain data (FNV-1a over its JSON). */
export function fingerprintOf(value: unknown): string {
  const text = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let k = 0; k < text.length; k++) {
    h ^= text.charCodeAt(k);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Plays matches on this thread, one at a time, letting the page draw in between. */
export function createInThreadRunner(): MatchRunner {
  return {
    kind: 'inThread',
    async run(jobs, onProgress) {
      const out: MatchResult[] = [];
      for (const job of jobs) {
        // Pause first: callers often ask for one match at a time, and each must wait its turn.
        await pause();
        out.push(playJob(job));
        onProgress?.(out.length, jobs.length);
      }
      return out;
    },
    dispose() {},
  };
}

type Pending = { id: number; job: MatchJob; resolve: (r: MatchResult) => void; reject: (e: Error) => void };

/**
 * A pool of `size` workers (two by default, 17.11). Each takes the next match as soon as it
 * finishes one. `spawn` makes a worker; the default loads matchWorker.ts.
 */
export function createWorkerRunner(size = 2, spawn: () => Worker = defaultSpawn): MatchRunner {
  let workers: Worker[] = [];
  const busy = new Map<Worker, Pending>();
  const queue: Pending[] = [];
  let nextId = 1;
  let broken = false;
  const fallback = createInThreadRunner();

  const feed = (w: Worker) => {
    const job = queue.shift();
    if (!job) return;
    busy.set(w, job);
    const req: WorkerRequest = { id: job.id, setup: job.job.setup, ctx: matchContextFor(job.job.setup, job.job.ctx), mode: job.job.mode ?? 'coarse' };
    w.postMessage(req);
  };

  // A worker that cannot start or crashes: finish everything here instead, from now on.
  const fail = () => {
    if (broken) return;
    broken = true;
    const left = [...busy.values(), ...queue];
    busy.clear();
    queue.length = 0;
    for (const w of workers) w.terminate();
    workers = [];
    void (async () => {
      for (const p of left) {
        try { p.resolve(playJob(p.job)); } catch (e) { p.reject(e instanceof Error ? e : new Error(String(e))); }
        await pause();
      }
    })();
  };

  const start = () => {
    if (workers.length > 0 || broken) return;
    try {
      for (let k = 0; k < size; k++) {
        const w = spawn();
        w.onmessage = (ev: MessageEvent<WorkerReply>) => {
          const p = busy.get(w);
          busy.delete(w);
          if (p && p.id === ev.data.id) {
            if ('result' in ev.data) p.resolve(ev.data.result);
            else p.reject(new Error(ev.data.error));
          }
          feed(w);
        };
        w.onerror = (ev) => { ev.preventDefault(); fail(); };
        w.onmessageerror = () => fail();
        workers.push(w);
      }
    } catch {
      fail();
    }
  };

  const runner: MatchRunner = {
    get kind(): RunnerKind {
      return broken ? 'inThread' : 'worker';
    },
    async run(jobs, onProgress) {
      if (broken) return fallback.run(jobs, onProgress);
      start();
      let done = 0;
      const all = jobs.map((job) => new Promise<MatchResult>((resolve, reject) => {
        const p: Pending = {
          id: nextId++, job, reject,
          resolve: (r) => { done++; onProgress?.(done, jobs.length); resolve(r); },
        };
        if (broken) { fallback.run([job]).then((r) => p.resolve(r[0]), reject); return; }
        queue.push(p);
      }));
      for (const w of workers) if (!busy.has(w)) feed(w);
      return Promise.all(all);
    },
    dispose() {
      for (const w of workers) w.terminate();
      workers = [];
      for (const p of busy.values()) p.reject(new Error('Match runner stopped'));
      busy.clear();
      for (const p of queue.splice(0)) p.reject(new Error('Match runner stopped'));
    },
  };
  return runner;
}

function defaultSpawn(): Worker {
  return new Worker(new URL('./matchWorker.ts', import.meta.url), { type: 'module', name: 'season-ticket-match' });
}

/** Workers when the browser has them, this thread otherwise. */
export function createMatchRunner(size = 2): MatchRunner {
  return typeof Worker === 'undefined' ? createInThreadRunner() : createWorkerRunner(size);
}
