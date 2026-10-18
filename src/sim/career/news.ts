/**
 * The newspaper and the social feed (Stage 6.2, docs/STAGE_6_EVENTS.md). Once a week, after
 * the matches and the story layer, the paper prints an edition from what happened: results,
 * streaks, the table, transfers, records and the owner's public decisions. Fans post on the
 * social feed in a tone that follows the result and their mood. Templates live in
 * src/data/news, tuning in src/data/tuning/news.json; the draw has its own seeded stream so
 * the news never changes anything else.
 */
import { NEWSPAPER, NEWS_TUNING, SOCIAL, WORLD } from '../data';
import type { Rng } from '../rng';
import { matchesForWeek } from '../season';
import type { MatchResult, ScheduledMatch, Team } from '../types';
import { fairPrice } from './books';
import type { Career, NewsItem, NewsKind, NewsState, NewsWire, PostKind, SocialPost } from './types';
import { careerRng, money, playerName, squadOf, transferWindowOpen, userBooks, userTeam } from './util';

const T = NEWS_TUNING;
const W = T.weights;
const TH = T.thresholds;
const S = T.social;

type Vars = Record<string, string | number>;
interface Toned {
  neutral: string[];
  warm?: string[];
  harsh?: string[];
  goalless?: string[];
}

export function newNews(): NewsState {
  return { items: [], posts: [], wire: [], leaderId: null, userPos: 0, bestMargin: 0, ladder: 0, shieldDone: false };
}

/** The season is over: the table and records start again; old stories stay until trimmed. */
export function rolloverNews(career: Career): void {
  const n = career.news;
  n.leaderId = null;
  n.userPos = 0;
  n.bestMargin = 0;
  n.shieldDone = false;
}

/** A transfer, for the next edition. */
export function reportTransfer(career: Career, w: Omit<Extract<NewsWire, { kind: 'transfer' }>, 'kind'>): void {
  const wire = career.news.wire;
  wire.push({ kind: 'transfer', ...w });
  // AI deals pile up in busy windows; keep the biggest.
  if (wire.length > T.keep.wireTransfers) {
    let low = -1;
    wire.forEach((x, i) => {
      if (x.kind === 'transfer' && x.toId !== career.userTeamId && x.fromId !== career.userTeamId && (low < 0 || x.fee < (wire[low] as { fee: number }).fee)) low = i;
    });
    if (low >= 0) wire.splice(low, 1);
  }
}

/**
 * A story from elsewhere in the sim (a public decision, a broken promise) as a
 * "Headline|Body" template. Club fills like {us} are made when the edition prints.
 */
export function reportStory(career: Career, template: string, weight: number, newsKind: NewsKind = 'club'): void {
  const [headline, body = ''] = template.split('|');
  career.news.wire.push({ kind: 'story', headline: headline.trim(), body: body.trim(), weight, newsKind });
}

/** A broken promise makes the paper. */
export function reportPromise(career: Career, kind: 'starts' | 'signing', player: string): void {
  const list = kind === 'starts' ? NEWSPAPER.promiseBroken : NEWSPAPER.promiseBrokenSigning;
  reportStory(career, fillText(careerRng(career, 'news-promise').pick(list), { player }), W.promise);
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export function paperName(): string {
  return T.paper;
}

export interface Edition {
  weekIndex: number;
  label: string;
  /** Lead first, then by weight. */
  items: NewsItem[];
}

/** Every edition still kept, newest first. */
export function newsEditions(career: Career): Edition[] {
  const by = new Map<number, NewsItem[]>();
  for (const it of career.news.items) {
    const list = by.get(it.weekIndex) ?? [];
    list.push(it);
    by.set(it.weekIndex, list);
  }
  return [...by.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([weekIndex, items]) => ({ weekIndex, label: items[0].label, items: [...items].sort((a, b) => b.weight - a.weight) }));
}

/** The latest edition, or null before the first. */
export function frontPage(career: Career): Edition | null {
  return newsEditions(career)[0] ?? null;
}

/** Social posts, newest first. */
export function socialFeed(career: Career): SocialPost[] {
  return career.news.posts;
}

// ---------------------------------------------------------------------------
// The weekly edition
// ---------------------------------------------------------------------------

interface Draft {
  kind: NewsKind;
  headline: string;
  body: string;
  weight: number;
  mine: boolean;
}

interface Ctx {
  career: Career;
  rng: Rng;
  base: Vars;
  drafts: Draft[];
  posts: Omit<SocialPost, 'id' | 'weekIndex'>[];
  /** The user's match this week, in full where it can be. */
  mine: { result: MatchResult; match: ScheduledMatch } | null;
}

/**
 * Prints this week's edition and posts. `results` are the week's results (compacted); the
 * user's own match is read from career.lastUserMatch, which keeps every stat line.
 */
export function weeklyNews(career: Career, results: readonly MatchResult[]): void {
  if (career.phase !== 'preseason' && career.phase !== 'season') return;
  const rng = careerRng(career, 'news');
  const ctx: Ctx = { career, rng, base: baseVars(career), drafts: [], posts: [], mine: null };
  const fixtures = career.phase === 'season' ? matchesForWeek(career.season, career.season.week - 1) : [];
  const userId = career.userTeamId;
  const myMatch = fixtures.find((m) => m.result && (m.homeId === userId || m.awayId === userId));
  if (myMatch?.result) {
    const full = career.lastUserMatch?.matchId === myMatch.result.matchId ? career.lastUserMatch : myMatch.result;
    ctx.mine = { result: full, match: myMatch };
  }

  if (ctx.mine) resultStory(ctx);
  if (career.phase === 'preseason' && career.preseasonWeek === 1) previewStories(ctx);
  roundStories(ctx, results);
  if (career.phase === 'season') {
    streakStories(ctx);
    tableStories(ctx);
    seasonStories(ctx);
  }
  scorerStories(ctx, results);
  wireStories(ctx);
  moneyStory(ctx);
  stadiumStory(ctx);
  socialPosts(ctx);
  print(ctx);
}

function print(ctx: Ctx): void {
  const { career } = ctx;
  const n = career.news;
  const label = editionLabel(career);
  const season = career.season.league.season;
  ctx.drafts
    .sort((a, b) => b.weight - a.weight)
    .forEach((d, k) => {
      n.items.unshift({ id: `n${career.weekIndex}_${k}`, season, weekIndex: career.weekIndex, label, kind: d.kind, headline: cap(d.headline), body: cap(d.body), weight: d.weight, mine: d.mine });
    });
  ctx.posts.forEach((p, k) => n.posts.unshift({ id: `p${career.weekIndex}_${k}`, weekIndex: career.weekIndex, ...p, text: cap(p.text) }));
  n.items.length = Math.min(n.items.length, T.keep.items);
  n.posts.length = Math.min(n.posts.length, T.keep.posts);
  n.wire = [];
}

function editionLabel(career: Career): string {
  if (career.phase === 'preseason') return `Pre-season week ${career.preseasonWeek}`;
  const week = career.season.week - 1;
  const first = matchesForWeek(career.season, week)[0];
  if (!first) return career.season.schedule.breakWeeks.includes(week) ? 'Mid-season break' : `Week ${week}`;
  if (first.stage === 'league') return `Round ${first.round}`;
  return STAGE_NAMES[first.stage];
}

const STAGE_NAMES: Record<ScheduledMatch['stage'], string> = { league: 'League', quarterFinal: 'Quarter-finals', semiFinal: 'Semi-finals', final: 'Final' };
const STAGE_ONE: Record<ScheduledMatch['stage'], string> = { league: 'league', quarterFinal: 'quarter-final', semiFinal: 'semi-final', final: 'final' };

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function fillText(text: string, vars: Vars): string {
  return text.replace(/\{(\w+)\}/g, (all, key: string) => (vars[key] !== undefined ? String(vars[key]) : all));
}

function team(career: Career, id: string): Team {
  return career.season.league.teams.find((t) => t.id === id)!;
}

function baseVars(career: Career): Vars {
  const t = userTeam(career);
  return {
    us: t.shortName,
    club: t.name,
    nick: t.nickname,
    nickWord: t.nickname.replace(/^(the|les|la|le|los)\s+/i, ''),
    city: t.city,
    stadium: t.stadiumName,
    abbr: t.abbr,
    cup: WORLD.league.playoffTrophy,
    shield: WORLD.league.tableTrophy,
    league: WORLD.league.name,
    paper: T.paper,
  };
}

/** A "Headline|Body" template filled and added to the edition. */
function story(ctx: Ctx, kind: NewsKind, template: string, vars: Vars, weight: number, mine: boolean): void {
  const [h, b = ''] = fillText(template, { ...ctx.base, ...vars }).split('|');
  ctx.drafts.push({ kind, headline: h.trim(), body: b.trim(), weight, mine });
}

function toned(ctx: Ctx, t: Toned): string[] {
  const press = ctx.career.story.press;
  const tone = T.tone;
  if (press > tone.warmAbove && t.warm?.length && ctx.rng.chance(tone.toneChance)) return t.warm;
  if (press < tone.harshBelow && t.harsh?.length && ctx.rng.chance(tone.toneChance)) return t.harsh;
  return t.neutral;
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${s}`;
}

function score(a: number, b: number): string {
  return `${a}-${b}`;
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

type ResultKind = 'bigWin' | 'win' | 'draw' | 'loss' | 'bigLoss';

interface MyResult {
  kind: ResultKind;
  us: number;
  them: number;
  oppId: string;
  home: boolean;
  scorer: string;
  hero: string;
}

function myResult(ctx: Ctx): MyResult | null {
  if (!ctx.mine) return null;
  const { career } = ctx;
  const r = ctx.mine.result;
  const home = r.homeId === career.userTeamId;
  const us = home ? r.homeScore : r.awayScore;
  const them = home ? r.awayScore : r.homeScore;
  const players = career.season.league.players;
  const ours = Object.values(r.playerStats).filter((s) => players[s.playerId]?.teamId === career.userTeamId && s.minutes > 0);
  const name = (id: string | undefined): string => (id && players[id] ? playerName(players[id]) : '');
  const top = [...ours].sort((a, b) => b.goals - a.goals || b.rating - a.rating)[0];
  const best = [...ours].sort((a, b) => b.rating - a.rating)[0];
  const hero = name(best?.playerId) || 'The captain';
  const scorer = top && top.goals > 0 ? name(top.playerId) : hero;
  const won = r.winnerId === career.userTeamId || (r.winnerId === null && us > them);
  const lost = r.winnerId !== null ? r.winnerId !== career.userTeamId : us < them;
  const margin = Math.abs(us - them);
  const kind: ResultKind = won ? (margin >= TH.bigMargin ? 'bigWin' : 'win') : lost ? (margin >= TH.bigMargin ? 'bigLoss' : 'loss') : 'draw';
  return { kind, us, them, oppId: home ? r.awayId : r.homeId, home, scorer, hero };
}

function resultVars(ctx: Ctx, m: MyResult): Vars {
  const opp = team(ctx.career, m.oppId);
  const r = ctx.mine!.result;
  return {
    them: opp.shortName,
    themNick: opp.nickname,
    score: score(m.us, m.them),
    venue: m.home ? 'at home' : 'away',
    scorer: m.scorer,
    hero: m.hero,
    crowd: (r.crowd ?? 0).toLocaleString('en-US'),
    stage: STAGE_ONE[ctx.mine!.match.stage],
  };
}

function resultStory(ctx: Ctx): void {
  const m = myResult(ctx);
  if (!m) return;
  const R = NEWSPAPER.result;
  const vars = resultVars(ctx, m);
  const stage = ctx.mine!.match.stage;
  const r = ctx.mine!.result;
  const won = m.kind === 'win' || m.kind === 'bigWin';
  if (stage !== 'league') {
    const w = W.result + W.playoff + (stage === 'final' ? W.final : 0);
    let list: string[];
    if (r.shootout) list = [won ? R.shootoutWin : R.shootoutLoss];
    else if (stage === 'final') list = won ? R.finalWin.neutral : R.finalLoss.neutral;
    else list = won ? R.playoffWin.neutral : R.playoffLoss.neutral;
    story(ctx, 'result', ctx.rng.pick(list), vars, w, true);
    return;
  }
  const t = R[m.kind] as Toned;
  const list = m.kind === 'draw' && m.us === 0 && ctx.rng.chance(0.7) ? R.draw.goalless : toned(ctx, t);
  const big = m.kind === 'bigWin' || m.kind === 'bigLoss';
  story(ctx, 'result', ctx.rng.pick(list), vars, W.result + (big ? W.resultBig : 0), true);
}

/** The pick of the other matches: a record win, a rout or an upset. */
function roundStories(ctx: Ctx, results: readonly MatchResult[]): void {
  const { career } = ctx;
  const n = career.news;
  const userId = career.userTeamId;
  const pos = new Map(career.season.standings.map((r, i) => [r.teamId, i + 1]));
  let best: { r: MatchResult; margin: number } | null = null;
  let upset: { r: MatchResult; gap: number } | null = null;
  let record: MatchResult | null = null;
  for (const r of results) {
    const margin = Math.abs(r.homeScore - r.awayScore);
    if (margin > n.bestMargin) {
      if (n.bestMargin >= TH.bigMargin) record = r;
      n.bestMargin = margin;
    }
    if (r.homeId === userId || r.awayId === userId || !r.winnerId) continue;
    if (margin >= TH.bigMargin && (!best || margin > best.margin)) best = { r, margin };
    const loser = r.winnerId === r.homeId ? r.awayId : r.homeId;
    const gap = (pos.get(r.winnerId) ?? 0) - (pos.get(loser) ?? 0);
    if (gap >= 8 && (!upset || gap > upset.gap)) upset = { r, gap };
  }
  const vars = (r: MatchResult): Vars => {
    const homeWon = r.homeScore > r.awayScore || r.winnerId === r.homeId;
    const w = team(career, homeWon ? r.homeId : r.awayId);
    const l = team(career, homeWon ? r.awayId : r.homeId);
    return { win: w.shortName, lose: l.shortName, wscore: homeWon ? score(r.homeScore, r.awayScore) : score(r.awayScore, r.homeScore) };
  };
  if (record) {
    const mine = record.homeId === userId || record.awayId === userId;
    story(ctx, 'record', ctx.rng.pick(NEWSPAPER.recordWin), vars(record), W.record, mine);
  }
  if (best && best.r !== record) story(ctx, 'league', ctx.rng.pick(NEWSPAPER.roundBig), vars(best.r), W.roundBig, false);
  else if (upset && upset.r !== record) story(ctx, 'league', ctx.rng.pick(NEWSPAPER.upset), vars(upset.r), W.roundBig, false);
}

interface Runs {
  wins: number;
  losses: number;
  unbeaten: number;
}

/** Current runs from every result this season, newest last. */
function runsOf(career: Career, teamId: string): Runs {
  const out = { wins: 0, losses: 0, unbeaten: 0 };
  const played = career.season.schedule.matches.filter((m) => m.result && (m.homeId === teamId || m.awayId === teamId)).sort((a, b) => a.week - b.week);
  let wins = true;
  let losses = true;
  let unbeaten = true;
  for (let i = played.length - 1; i >= 0; i--) {
    const r = played[i].result!;
    const mine = r.homeId === teamId ? r.homeScore : r.awayScore;
    const theirs = r.homeId === teamId ? r.awayScore : r.homeScore;
    const won = r.winnerId ? r.winnerId === teamId : mine > theirs;
    const lost = r.winnerId ? r.winnerId !== teamId : mine < theirs;
    if (wins && won) out.wins++;
    else wins = false;
    if (losses && lost) out.losses++;
    else losses = false;
    if (unbeaten && !lost) out.unbeaten++;
    else unbeaten = false;
    if (!wins && !losses && !unbeaten) break;
  }
  return out;
}

/** A run is news when it reaches the threshold, then every two more. */
function newsworthy(run: number, threshold: number): boolean {
  return run >= threshold && (run - threshold) % 2 === 0;
}

function streakStories(ctx: Ctx): void {
  const { career } = ctx;
  const userId = career.userTeamId;
  if (ctx.mine) {
    const r = runsOf(career, userId);
    if (newsworthy(r.wins, TH.winStreak)) story(ctx, 'streak', ctx.rng.pick(NEWSPAPER.streakWinMine), { n: r.wins }, W.streakMine, true);
    else if (newsworthy(r.losses, TH.loseStreak)) {
      const harsh = career.story.press < T.tone.harshBelow;
      story(ctx, 'streak', ctx.rng.pick(harsh ? NEWSPAPER.streakLossMineHarsh : NEWSPAPER.streakLossMine), { n: r.losses }, W.streakMine, true);
    } else if (r.wins < TH.winStreak && newsworthy(r.unbeaten, TH.unbeaten)) story(ctx, 'streak', ctx.rng.pick(NEWSPAPER.unbeatenMine), { n: r.unbeaten }, W.streakMine - 10, true);
  }
  let top: { id: string; n: number } | null = null;
  for (const t of career.season.league.teams) {
    if (t.id === userId) continue;
    const n = runsOf(career, t.id).wins;
    if (newsworthy(n, TH.otherWinStreak) && (!top || n > top.n)) top = { id: t.id, n };
  }
  if (top) story(ctx, 'streak', ctx.rng.pick(NEWSPAPER.streakWin), { team: team(career, top.id).shortName, n: top.n }, W.streakOther, false);
}

function tableStories(ctx: Ctx): void {
  const { career } = ctx;
  const n = career.news;
  const st = career.season.standings;
  const userId = career.userTeamId;
  if (!st.length || career.season.phase === 'playoffs' || career.season.phase === 'complete') {
    if (st.length) n.userPos = st.findIndex((r) => r.teamId === userId) + 1;
    return;
  }
  const leader = st[0];
  const played = leader.played;
  if (played >= 3 && leader.teamId !== n.leaderId && (ctx.mine || leader.teamId !== userId)) {
    const gap = leader.points - (st[1]?.points ?? 0);
    const gapText = gap > 0 ? `${gap} point${gap === 1 ? '' : 's'} clear` : 'ahead on goal difference';
    const mine = leader.teamId === userId;
    story(ctx, 'table', ctx.rng.pick(mine ? NEWSPAPER.leaderMine : NEWSPAPER.leader), { team: team(career, leader.teamId).shortName, pts: leader.points, gap: gapText }, W.leader + (mine ? 10 : 0), mine);
  }
  if (played >= 3) n.leaderId = leader.teamId;
  const pos = st.findIndex((r) => r.teamId === userId) + 1;
  const inside = (p: number): boolean => p > 0 && p <= TH.playoffPlaces;
  if (played >= 5 && n.userPos > 0 && inside(pos) !== inside(n.userPos)) {
    story(ctx, 'table', ctx.rng.pick(inside(pos) ? NEWSPAPER.playoffIn : NEWSPAPER.playoffOut), { pos: ordinal(pos) }, W.playoffRace, true);
  }
  n.userPos = pos;
}

function seasonStories(ctx: Ctx): void {
  const { career } = ctx;
  const s = career.season;
  const userId = career.userTeamId;
  if (s.shieldWinnerId && !career.news.shieldDone) {
    career.news.shieldDone = true;
    const mine = s.shieldWinnerId === userId;
    story(ctx, 'season', ctx.rng.pick(NEWSPAPER.seasonShield), { team: team(career, s.shieldWinnerId).shortName }, mine ? W.seasonMine + 10 : W.season - 20, mine);
  }
  if (s.phase === 'complete' && s.championId) {
    const mine = s.championId === userId;
    // The user's own final is already the lead.
    if (!mine) story(ctx, 'season', ctx.rng.pick(NEWSPAPER.seasonChampion), { team: team(career, s.championId).shortName }, W.season, false);
  }
}

function strength(career: Career, teamId: string): number {
  const best = squadOf(career, teamId)
    .map((p) => p.overall)
    .sort((a, b) => b - a)
    .slice(0, 16);
  return best.length ? best.reduce((a, b) => a + b, 0) / best.length : 0;
}

function previewStories(ctx: Ctx): void {
  const { career } = ctx;
  const ranked = career.season.league.teams.map((t) => ({ id: t.id, s: strength(career, t.id) })).sort((a, b) => b.s - a.s || (a.id < b.id ? -1 : 1));
  const fav = ranked[0];
  const userId = career.userTeamId;
  const pos = ranked.findIndex((r) => r.id === userId) + 1;
  if (fav.id !== userId) story(ctx, 'preview', ctx.rng.pick(NEWSPAPER.previewFavourite), { team: team(career, fav.id).shortName }, W.preview - 10, false);
  story(ctx, 'preview', ctx.rng.pick(NEWSPAPER.previewMine), { pos: ordinal(pos) }, W.preview, true);
}

function scorerStories(ctx: Ctx, results: readonly MatchResult[]): void {
  const { career } = ctx;
  const userId = career.userTeamId;
  const players = career.season.league.players;
  let other: { name: string; team: string; goals: number } | null = null;
  for (const r of results) {
    const mine = r.homeId === userId || r.awayId === userId;
    const stats = mine && ctx.mine?.result.matchId === r.matchId ? ctx.mine.result.playerStats : r.playerStats;
    for (const s of Object.values(stats)) {
      const p = players[s.playerId];
      if (!p || s.goals <= 0) continue;
      if (p.teamId === userId) {
        if (s.goals >= 3) story(ctx, 'record', ctx.rng.pick(NEWSPAPER.hatTrickMine), { player: playerName(p) }, W.hatTrickMine, true);
        const total = career.playerSeason[p.id]?.goals ?? 0;
        const crossed = TH.milestones.filter((m) => total - s.goals < m && total >= m).pop();
        if (crossed && s.goals < 3) story(ctx, 'record', ctx.rng.pick(NEWSPAPER.milestone), { player: playerName(p), n: crossed }, W.milestone, true);
      } else if (s.goals >= 3 && p.teamId && (!other || s.goals > other.goals)) {
        other = { name: playerName(p), team: team(career, p.teamId).shortName, goals: s.goals };
      }
    }
  }
  if (other) story(ctx, 'record', ctx.rng.pick(NEWSPAPER.hatTrick), { player: other.name, team: other.team }, W.hatTrickOther, false);
}

function wireStories(ctx: Ctx): void {
  const { career } = ctx;
  const userId = career.userTeamId;
  const ai: Extract<NewsWire, { kind: 'transfer' }>[] = [];
  for (const w of career.news.wire) {
    if (w.kind === 'story') {
      ctx.drafts.push({ kind: w.newsKind, headline: fillText(w.headline, ctx.base), body: fillText(w.body, ctx.base), weight: w.weight, mine: true });
      continue;
    }
    const vars: Vars = {
      player: w.name,
      from: w.fromId ? team(career, w.fromId).shortName : 'nowhere',
      to: team(career, w.toId).shortName,
      fee: money(w.fee),
    };
    if (w.toId === userId) {
      const list = w.how === 'free' ? NEWSPAPER.freeSigning : w.how === 'loan' ? NEWSPAPER.loanSigning : w.fee >= TH.bigFee ? NEWSPAPER.signing : NEWSPAPER.signingSmall;
      const weight = w.how === 'free' || w.how === 'loan' ? W.freeSigning : w.fee >= TH.bigFee ? W.signing : W.signing - 16;
      story(ctx, 'transfer', ctx.rng.pick(list), vars, weight, true);
      fanPost(ctx, 'fan', fresh(ctx, SOCIAL.fan.signing, { player: w.name }), { player: w.name }, 'up');
    } else if (w.fromId === userId) {
      story(ctx, 'transfer', ctx.rng.pick(w.how === 'forced' ? NEWSPAPER.saleForced : NEWSPAPER.sale), vars, W.sale, true);
      fanPost(ctx, 'fan', fresh(ctx, SOCIAL.fan.sale, { player: w.name }), { player: w.name }, w.how === 'forced' ? 'down' : 'flat');
    } else if (w.fee >= TH.aiTransferMinFee) ai.push(w);
  }
  ai.sort((a, b) => b.fee - a.fee);
  // A player the paper has just covered moving again is old news.
  const covered = career.news.items.filter((x) => x.kind === 'transfer' && !x.mine).map((x) => x.headline);
  const news = ai.filter((w) => !covered.some((h) => h.includes(w.name)));
  for (const w of news.slice(0, TH.aiTransferMaxPerWeek)) {
    story(ctx, 'transfer', ctx.rng.pick(NEWSPAPER.aiTransfer), { player: w.name, from: w.fromId ? team(career, w.fromId).shortName : 'free agency', to: team(career, w.toId).shortName, fee: money(w.fee) }, W.aiTransfer, false);
  }
}

function moneyStory(ctx: Ctx): void {
  const { career } = ctx;
  const level = career.ladder.level;
  if (level >= TH.moneyLadderLevel && level > career.news.ladder) story(ctx, 'money', ctx.rng.pick(NEWSPAPER.money), {}, W.money, true);
  career.news.ladder = level;
}

function stadiumStory(ctx: Ctx): void {
  const { career } = ctx;
  const done = career.inbox.find((m) => m.kind === 'stadium' && m.weekIndex === career.weekIndex && m.title === 'Building work finished');
  if (done) story(ctx, 'stadium', ctx.rng.pick(NEWSPAPER.stadium), { text: done.body }, W.stadium, true);
}

// ---------------------------------------------------------------------------
// Social feed
// ---------------------------------------------------------------------------

function plain(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_]/g, '')
    .toLowerCase();
}

function handle(ctx: Ctx, t: Team): string {
  const H = SOCIAL.handles;
  const rng = ctx.rng;
  const core = fillText(rng.pick(H.core), { city: plain(t.city), abbr: plain(t.abbr), nickWord: plain(t.nickname.replace(/^(the|les|la|le|los)\s+/i, '')) });
  const start = rng.pick(H.start);
  const end = rng.pick(H.end);
  // Long city names: drop the ending, then the start, before cutting.
  for (const h of [`${start}${core}${end}`, `${core}${end}`, `${start}${core}`, core]) if (h.length <= 20) return h;
  return core.slice(0, 20);
}

function likes(ctx: Ctx, big: boolean): number {
  const r = ctx.rng.next();
  const n = S.likes.min + (S.likes.max - S.likes.min) * r * r * r;
  return Math.round(big ? n * S.likes.boostOnBig : n);
}

/** A line the feed hasn't shown lately, if there is one. */
function fresh(ctx: Ctx, list: readonly string[], vars: Vars = {}): string {
  const recent = new Set([...ctx.posts, ...ctx.career.news.posts.slice(0, S.freshWindow)].map((p) => p.text));
  const unused = list.filter((t) => !recent.has(cap(fillText(t, { ...ctx.base, ...vars }))) && !recent.has(fillText(t, { ...ctx.base, ...vars })));
  return ctx.rng.pick(unused.length ? unused : list);
}

function fanPost(ctx: Ctx, kind: PostKind, text: string, vars: Vars, tone: SocialPost['tone'], from: Team = userTeam(ctx.career), big = false): void {
  ctx.posts.push({ handle: handle(ctx, from), text: fillText(text, { ...ctx.base, ...vars }), kind, tone, likes: likes(ctx, big) });
}

function socialPosts(ctx: Ctx): void {
  const { career, rng } = ctx;
  const F = SOCIAL.fan;
  const t = userTeam(career);
  const pre = career.phase === 'preseason';
  const [lo, hi] = pre ? S.postsPreseason : S.postsSeason;
  const want = rng.int(lo, hi);
  const m = myResult(ctx);
  if (m) {
    const vars = resultVars(ctx, m);
    const tone = m.kind === 'win' || m.kind === 'bigWin' ? 'up' : m.kind === 'draw' ? 'flat' : 'down';
    const big = m.kind === 'bigWin' || m.kind === 'bigLoss';
    const pool = [...F[m.kind]];
    for (let i = 0; i < 2 && pool.length; i++) fanPost(ctx, 'fan', pool.splice(rng.int(0, pool.length - 1), 1)[0], vars, tone, t, big && i === 0);
    if (rng.chance(S.rivalChance)) {
      const oppWon = m.kind === 'loss' || m.kind === 'bigLoss';
      const text = oppWon ? rng.pick(SOCIAL.rival.slice(0, 3)) : SOCIAL.rival[3];
      fanPost(ctx, 'rival', text, { ...vars, score: score(m.them, m.us) }, oppWon ? 'down' : 'flat', team(career, m.oppId));
    }
  }
  if (transferWindowOpen(career) && rng.chance(S.rumourChanceWindow)) rumour(ctx);
  const mood = t.fanMood;
  if (userBooks(career).ticketPrice > fairPrice(t) * 1.1 && rng.chance(S.priceChance)) {
    const price = { price: userBooks(career).ticketPrice.toFixed(0) };
    fanPost(ctx, 'fan', fresh(ctx, F.price, price), price, 'down');
  }
  if (rng.chance(S.oddChance)) fanPost(ctx, 'odd', fresh(ctx, SOCIAL.odd), {}, 'flat');
  while (ctx.posts.length < want) {
    const moodList = mood > S.happyAbove ? F.happy : mood < S.grumpyBelow ? F.grumpy : null;
    const list = pre && rng.chance(0.6) ? F.preseason : moodList && rng.chance(0.5) ? moodList : F.chatter;
    const before = ctx.posts.length;
    fanPost(ctx, 'fan', fresh(ctx, list), {}, list === F.grumpy ? 'down' : list === F.happy ? 'up' : 'flat');
    if (ctx.posts.length === before) break;
  }
  // Newest at the top once printed; shuffle so the result posts aren't always last.
  ctx.posts = rng.shuffle(ctx.posts);
}

/** A window rumour: a rich club watching one of ours, or us after someone else's player. */
function rumour(ctx: Ctx): void {
  const { career, rng } = ctx;
  const userId = career.userTeamId;
  const others = career.season.league.teams.filter((t) => t.id !== userId);
  if (!others.length) return;
  if (rng.chance(0.5)) {
    const stars = squadOf(career, userId)
      .sort((a, b) => b.overall - a.overall)
      .slice(0, 5);
    const rich = [...others].sort((a, b) => career.books[b.id].cash - career.books[a.id].cash).slice(0, 4);
    if (!stars.length) return;
    const text = rng.pick(SOCIAL.rumour.slice(0, 3));
    fanPost(ctx, 'rumour', text, { player: playerName(rng.pick(stars)), to: rng.pick(rich).shortName }, 'flat');
  } else {
    const from = rng.pick(others);
    const target = squadOf(career, from.id)
      .sort((a, b) => b.overall - a.overall)
      .slice(0, 3);
    if (!target.length) return;
    fanPost(ctx, 'rumour', rng.pick(SOCIAL.rumour.slice(3)), { player: playerName(rng.pick(target)), from: from.shortName }, 'flat');
  }
}
