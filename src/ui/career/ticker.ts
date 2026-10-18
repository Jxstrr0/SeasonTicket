/**
 * The commentary ticker over the pitch (Stage 5.5): one line at a time for the moments worth
 * a word (chances, goals, cards, penalties, whistles, shootout kicks), shown when the screen's
 * clock reaches them. The wording is the match feed's own (src/data/commentary.json); which
 * line of several is used comes from the moment's time, never from the engine's random numbers.
 */
import { describeAt, shootoutKickLabel, type CommentaryParams } from '../../sim/match/commentary';
import type { SpatialMatch } from '../../sim/spatial/state';
import { PERIOD, type Side } from '../../sim/spatial/types';
import type { MatchEventType } from '../../sim/types';
import tuning from '../../data/tuning/atmosphere.json';
import { nameOf } from '../pitch2d';
import type { Moment } from './matchMoments';

const T = tuning.ticker;

export interface TickerLine {
  ms: number;
  side: Side | -1;
  text: string;
  /** Goals and the final whistle stand out. */
  big: boolean;
}

function hash(ms: number, salt: number): number {
  let h = Math.imul((ms | 0) ^ salt, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 0x1_0000_0000;
}

function scoreText(m: SpatialMatch, score: ArrayLike<number>): string {
  return `${m.setup.home.short} ${score[0]}-${score[1]} ${m.setup.away.short}`;
}

/** The line for one moment, or null when it is not worth one. */
export function tickerLine(m: SpatialMatch, mo: Moment, lastFoul?: number): TickerLine | null {
  const team = (s: Side): string => (s === 0 ? m.setup.home.name : m.setup.away.name);
  const line = (type: string, side: Side | -1, params: CommentaryParams, big = false): TickerLine => ({
    ms: mo.ms,
    side,
    big,
    text: describeAt(type as MatchEventType, params, hash(mo.ms, type.length)),
  });
  switch (mo.kind) {
    case 'shot': {
      if (mo.xg < T.minChanceXg && mo.outcome !== 'post' && mo.setPiece !== 'penalty') return null;
      const p = { player: nameOf(m, mo.player), team: team(mo.side), secondary: nameOf(m, m.who[(1 - mo.side) * 11]) };
      if (mo.setPiece === 'penalty') return line(mo.outcome === 'saved' ? 'penaltySaved' : 'penaltyMissed', mo.side, p);
      if (mo.outcome === 'saved') return line('save', mo.side, p);
      const variant = mo.outcome === 'post' ? 'post' : mo.outcome === 'blocked' ? 'blocked' : 'offTarget';
      return line('chance', mo.side, { ...p, variant });
    }
    case 'goal': {
      const p = {
        player: nameOf(m, mo.scorer),
        team: team(mo.side),
        assist: mo.assist >= 0 ? nameOf(m, mo.assist) : '',
        score: scoreText(m, mo.score),
      };
      return line(mo.ownGoal ? 'ownGoal' : 'goal', mo.side, p, true);
    }
    case 'spot': {
      const score = `${mo.score[0]}-${mo.score[1]}`;
      return line('shootoutKick', mo.side, { player: nameOf(m, mo.player), team: team(mo.side), detail: shootoutKickLabel(mo.outcome), score });
    }
    case 'event': {
      const e = mo.event;
      const who = nameOf(m, e.player);
      switch (e.kind) {
        case 'penalty':
          return line('penaltyAwarded', e.side, { player: who, team: team(e.side), secondary: lastFoul !== undefined ? nameOf(m, lastFoul) : '' });
        case 'yellow':
          return line(e.note === 'second' ? 'secondYellow' : 'yellowCard', e.side, { player: who, team: team(e.side) });
        case 'red':
          return line('redCard', e.side, { player: who, team: team(e.side) });
        case 'injury':
          return line('injury', e.side, { player: who, team: team(e.side) });
        case 'sub':
          return e.other === undefined ? null : line('substitution', e.side, { player: who, secondary: nameOf(m, e.other), team: team(e.side) });
        case 'whistle': {
          const score = scoreText(m, m.score);
          if (e.note === 'half') return line('halfTime', -1, { score });
          if (e.note === 'etHalf') return line('extraTimeHalf', -1, { score });
          if (e.note === 'full') return line(m.period === PERIOD.ET_FIRST ? 'extraTimeStart' : 'fullTime', -1, { score }, m.period !== PERIOD.ET_FIRST);
          if (e.note === 'etFull') return line(m.period === PERIOD.SHOOTOUT ? 'shootoutStart' : 'extraTimeEnd', -1, { score }, m.period !== PERIOD.SHOOTOUT);
          if (e.note === 'shootout' && m.shootout) {
            const won = m.shootout.winner;
            if (won < 0) return null;
            const w = won as Side;
            return line('shootoutEnd', w, { team: team(w), score: `${m.shootout.score[w]}-${m.shootout.score[1 - w]}` }, true);
          }
          return null;
        }
        default:
          return null;
      }
    }
    default:
      return null;
  }
}

/** The ticker's element and its queue of lines. */
export class Ticker {
  readonly el: HTMLDivElement;
  private queue: TickerLine[] = [];
  private shownAt = 0;
  private showing: TickerLine | null = null;
  private lastFoul: number | undefined;
  private kits: [string, string] = ['#fff', '#fff'];

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'ticker';
    this.el.setAttribute('aria-live', 'polite');
    this.el.hidden = true;
  }

  /** The two sides' colours, for the stripe on each line. */
  setKits(home: string, away: string): void {
    this.kits = [home, away];
  }

  reset(): void {
    this.queue.length = 0;
    this.showing = null;
    this.lastFoul = undefined;
    this.el.hidden = true;
  }

  add(m: SpatialMatch, moments: readonly Moment[]): void {
    for (const mo of moments) {
      if (mo.kind === 'event' && mo.event.kind === 'foul') this.lastFoul = mo.event.player;
      const l = tickerLine(m, mo, this.lastFoul);
      if (l) this.queue.push(l);
    }
  }

  /** Show what is due by the screen's match time `atMs` (real time `now`). */
  show(atMs: number, now: number): void {
    // Lines long past (a fast-forward) are dropped; a big one is kept over small ones.
    const fresh = this.queue.filter((l) => l.ms <= atMs && atMs - l.ms <= T.staleMs);
    const waiting = this.queue.filter((l) => l.ms > atMs);
    let due = fresh;
    if (due.length > T.queue) {
      const big = due.filter((l) => l.big);
      due = big.length ? big.slice(-T.queue) : due.slice(-T.queue);
    }
    this.queue = [...due, ...waiting];
    const held = now - this.shownAt;
    const next = this.queue[0];
    const ready = next && next.ms <= atMs;
    if (this.showing && held < (ready ? (this.showing.big ? T.showMs : T.minMs) : T.showMs)) return;
    if (!ready) {
      if (this.showing) {
        this.showing = null;
        this.el.hidden = true;
      }
      return;
    }
    this.queue.shift();
    this.showing = next;
    this.shownAt = now;
    this.el.textContent = next.text;
    this.el.classList.toggle('big', next.big);
    this.el.style.setProperty('--c', next.side === -1 ? 'transparent' : this.kits[next.side]);
    this.el.hidden = false;
  }
}
