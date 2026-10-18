/**
 * Every event can happen. Some only follow an owner's choice (a follow-up, or a flag such
 * as "the council is annoyed"), so the ten-season balance runs, whose owners let the staff
 * answer, never see them (docs/STAGE_7_POLISH.md, 7.3). This walks the data instead: an
 * event is reachable if its conditions need no flag and it is not a follow-up, or if a choice
 * in a reachable event sets its flag or names it as the next step.
 */
import { describe, expect, it } from 'vitest';
import { EVENTS, type EventDef } from '../src/sim/career';

type Fx = Record<string, unknown> & { effects?: Fx[] };
const effects = (list: readonly unknown[]): Fx[] => (list as Fx[]).flatMap((e) => ('later' in e && e.effects ? [e, ...effects(e.effects)] : [e]));
const outcomes = (def: EventDef) => def.choices.flatMap((c) => effects(c.effects));

describe('story reachability', () => {
  it('every event can be reached from events that need nothing set first', () => {
    const reached = new Set(EVENTS.filter((e) => !e.when.chainOnly && e.when.flag === undefined).map((e) => e.id));
    for (let grew = true; grew; ) {
      grew = false;
      const flags = new Set<unknown>();
      const next = new Set<unknown>();
      for (const def of EVENTS.filter((e) => reached.has(e.id))) {
        for (const fx of outcomes(def)) {
          if ('flag' in fx) flags.add(fx.flag);
          if ('next' in fx) next.add(fx.next);
        }
      }
      for (const def of EVENTS) {
        if (reached.has(def.id)) continue;
        const ok = def.when.chainOnly ? next.has(def.id) : flags.has(def.when.flag);
        if (ok) {
          reached.add(def.id);
          grew = true;
        }
      }
    }
    expect(EVENTS.filter((e) => !reached.has(e.id)).map((e) => e.id)).toEqual([]);
  });
});
