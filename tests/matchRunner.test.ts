/**
 * The MatchRunner (docs/DESIGN.md 17.8): results come back in order and identical to playing
 * the matches directly, from the worker pool or this thread, and a pool whose workers fail
 * finishes the matches here instead. Node has no Web Workers, so a stand-in plays each message
 * later on a copy of its data, the way a real worker does.
 */
import { describe, expect, it } from 'vitest';
import { createInThreadRunner, createWorkerRunner, matchContextFor, playJob, resultFingerprint, type MatchJob, type WorkerReply, type WorkerRequest } from '../src/game/matchRunner';
import { createLeague } from '../src/sim/league';
import { buildMatchSetup, createSeason, defaultHooks, matchContext, matchesForWeek } from '../src/sim/season';
import type { MatchResult } from '../src/sim/types';

const league = createLeague(4242);
const season = createSeason(league);
const ctx = matchContext(league);
const jobs: MatchJob[] = matchesForWeek(season, 1).slice(0, 4).map((match) => ({ setup: buildMatchSetup(season, match, defaultHooks()), ctx }));
const direct: MatchResult[] = jobs.map(playJob);

/** A stand-in Web Worker: answers each message on a later tick from a structured copy. */
class FakeWorker {
  onmessage: ((ev: MessageEvent<WorkerReply>) => void) | null = null;
  onerror: ((ev: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;
  constructor(private readonly crashAfter = Infinity) {}
  private handled = 0;
  postMessage(req: WorkerRequest): void {
    const copy = structuredClone(req);
    setTimeout(() => {
      if (this.terminated) return;
      if (this.handled++ >= this.crashAfter) {
        this.onerror?.({ preventDefault() {} } as ErrorEvent);
        return;
      }
      let reply: WorkerReply;
      try { reply = { id: copy.id, result: playJob(copy) }; } catch (e) { reply = { id: copy.id, error: String(e) }; }
      this.onmessage?.({ data: structuredClone(reply) } as MessageEvent<WorkerReply>);
    }, 0);
  }
  terminate(): void { this.terminated = true; }
}

describe('MatchRunner', () => {
  it('sends a worker only the two clubs and the players named for the match', () => {
    const small = matchContextFor(jobs[0].setup, ctx);
    expect(Object.keys(small.teams).sort()).toEqual([jobs[0].setup.homeId, jobs[0].setup.awayId].sort());
    const named = [jobs[0].setup.home, jobs[0].setup.away].reduce((n, s) => n + s.lineup.starters.length + s.lineup.bench.length, 0);
    expect(Object.keys(small.players).length).toBe(named);
    expect(playJob({ ...jobs[0], ctx: small })).toEqual(direct[0]);
  });

  it('plays on this thread in order, with progress', async () => {
    const seen: number[] = [];
    const out = await createInThreadRunner().run(jobs, (done) => seen.push(done));
    expect(out).toEqual(direct);
    expect(seen).toEqual([1, 2, 3, 4]);
  });

  it('a pool of two workers gives the same results, in order, with the same fingerprints', async () => {
    let made = 0;
    const runner = createWorkerRunner(2, () => { made++; return new FakeWorker() as unknown as Worker; });
    const seen: number[] = [];
    const out = await runner.run(jobs, (done) => seen.push(done));
    expect(made).toBe(2);
    expect(runner.kind).toBe('worker');
    expect(out.map(resultFingerprint)).toEqual(direct.map(resultFingerprint));
    expect(out).toEqual(direct);
    expect(seen.sort()).toEqual([1, 2, 3, 4]);
    // A second batch reuses the same workers.
    expect(await runner.run(jobs.slice(0, 1))).toEqual(direct.slice(0, 1));
    expect(made).toBe(2);
    runner.dispose();
  });

  it('a worker that crashes, or cannot start, hands its matches to this thread', async () => {
    const crashing = createWorkerRunner(2, () => new FakeWorker(1) as unknown as Worker);
    expect(await crashing.run(jobs)).toEqual(direct);
    expect(crashing.kind).toBe('inThread');
    const unstartable = createWorkerRunner(2, () => { throw new Error('no workers here'); });
    expect(await unstartable.run(jobs.slice(0, 2))).toEqual(direct.slice(0, 2));
    expect(unstartable.kind).toBe('inThread');
  });

  it('a fingerprint changes when the result does', () => {
    const changed = { ...direct[0], homeScore: direct[0].homeScore + 1 };
    expect(resultFingerprint(changed)).not.toBe(resultFingerprint(direct[0]));
    expect(resultFingerprint(structuredClone(direct[0]))).toBe(resultFingerprint(direct[0]));
  });
});
