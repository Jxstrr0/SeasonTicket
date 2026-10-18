/**
 * Small shared helpers for the career modules: the tuning handle, seeded
 * random streams, ids, the ledger and the inbox.
 */
import { CAREER_TUNING } from '../data';
import { teamById } from '../league';
import { Rng, hashString } from '../rng';
import type { Player, Team } from '../types';
import {
  FINANCING_KEYS,
  INCOME_KEYS,
  SPENDING_KEYS,
  type Career,
  type ClubBooks,
  type FinancingKey,
  type IncomeKey,
  type InboxKind,
  type Ledger,
  type SpendingKey,
} from './types';

export const C = CAREER_TUNING;

/** Weeks of yearly money: four pre-season weeks plus the season. */
export const WEEKS_PER_YEAR = C.calendar.weeksPerYear;

/**
 * A random stream for one career decision. The label plus the calendar
 * position makes it unique, and the same save replays the same way.
 */
export function careerRng(career: Career, label: string): Rng {
  const phase = career.phase === 'preseason' ? `pre${career.preseasonWeek}` : career.phase;
  return new Rng(hashString(`${career.seed}:career:${career.season.league.season}:${phase}:${career.weekIndex}:${label}`));
}

export function nextId(career: Career, prefix: string): string {
  career.counter += 1;
  return `${prefix}_${career.counter}`;
}

export function emptyLedger(): Ledger {
  const zeros = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
  return { income: zeros(INCOME_KEYS), spending: zeros(SPENDING_KEYS), financing: zeros(FINANCING_KEYS) };
}

export function ledgerTotals(ledger: Ledger): { income: number; spending: number; profit: number } {
  const income = Object.values(ledger.income).reduce((a, b) => a + b, 0);
  const spending = Object.values(ledger.spending).reduce((a, b) => a + b, 0);
  return { income, spending, profit: income - spending };
}

// The only three places a club's cash moves.

export function earn(books: ClubBooks, key: IncomeKey, amount: number): void {
  if (!Number.isFinite(amount) || amount === 0) return;
  books.cash += amount;
  books.ledger.income[key] += amount;
}

export function spend(books: ClubBooks, key: SpendingKey, amount: number): void {
  if (!Number.isFinite(amount) || amount === 0) return;
  books.cash -= amount;
  books.ledger.spending[key] += amount;
}

/** Owner money and loans in add cash; repayments take it out. None of it is profit. */
export function finance(books: ClubBooks, key: FinancingKey, amount: number): void {
  if (!Number.isFinite(amount) || amount === 0) return;
  books.cash += key === 'repaid' ? -amount : amount;
  books.ledger.financing[key] += amount;
}

export function addInbox(career: Career, kind: InboxKind, title: string, body: string): void {
  career.inbox.unshift({
    id: nextId(career, 'm'),
    weekIndex: career.weekIndex,
    season: career.season.league.season,
    kind,
    title,
    body,
    read: false,
  });
  if (career.inbox.length > C.inbox.max) career.inbox.length = C.inbox.max;
}

/** The calendar week the season will play next (1-35), or 0 in pre-season. */
export function seasonWeek(career: Career): number {
  return career.phase === 'season' ? career.season.week : 0;
}

export function transferWindowOpen(career: Career): boolean {
  const open = career.phase === 'preseason' || (career.phase === 'season' && C.calendar.midSeasonWindow.includes(career.season.week));
  if (!open) return false;
  // Deadline day shuts the window at 23:00, even with the rest of the week to play (deadline.ts).
  const day = career.deadline;
  return !(day?.closed && day.key === `${career.season.league.season}-${career.phase === 'preseason' ? 'pre' : 'mid'}`);
}

/** Free agents can sign any time except the review and the playoff run-in. */
export function freeAgentsOpen(career: Career): boolean {
  if (career.phase === 'preseason') return true;
  return career.phase === 'season' && !C.calendar.freeAgentBlackout.includes(career.season.week);
}

export function userTeam(career: Career): Team {
  return teamById(career.season.league, career.userTeamId);
}

export function userBooks(career: Career): ClubBooks {
  return career.books[career.userTeamId];
}

export function squadOf(career: Career, teamId: string): Player[] {
  const league = career.season.league;
  return teamById(league, teamId).playerIds.map((id) => league.players[id]).filter((p): p is Player => !!p);
}

/** "the Riverside" for most grounds, but "The Foundry" stays as it is. */
export function theStadium(name: string): string {
  return /^the\s/i.test(name) ? name : `the ${name}`;
}

export function playerName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Whole dollars, rounded to the nearest thousand for display-friendly deals. */
export function roundMoney(amount: number, step = 1000): number {
  return Math.round(amount / step) * step;
}

export function money(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const a = Math.abs(amount);
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2)}M`;
  if (a >= 1_000) return `${sign}$${Math.round(a / 1_000)}k`;
  return `${sign}$${Math.round(a)}`;
}
