/**
 * Press conferences (Stage 6.3, docs/STAGE_6_EVENTS.md). In a week when the next match is
 * big (a derby, a top-of-the-table game, a playoff, a grudge match) or this week's result
 * was notable, the press want the owner. A conference is a story event with two or three
 * questions from src/data/press, each answered calm, bold or deflecting. Answers move fan
 * mood, player mood, press standing and rivalry heat; a bold promise to win is judged once
 * the match is played; the loudest quote makes the paper. Questions left unanswered when
 * the next match comes are taken by the assistant coach, calmly.
 */
import { PRESS_QUESTIONS, PRESS_TUNING, WORLD } from '../data';
import type { ScheduledMatch, Team } from '../types';
import { reportStory } from './news';
import { NO_SCALE, playerMood, round3, scaled, setMood, staffName, staffQuality, staffScale } from './story';
import type { AnswerResult, EventDef, EventView, Scale } from './story';
import type { Career, PressConference, PressTone, StoryEvent } from './types';
import { C, addInbox, careerRng, clamp, nextId, playerName, userTeam } from './util';

const P = PRESS_TUNING;
const TR = P.triggers;

export const PRESS_TONES: readonly PressTone[] = ['calm', 'bold', 'deflect'];

type PressEffect = { fans: number } | { squad: number } | { mood: number } | { press: number } | { heat: number } | { claim: boolean };

interface PressAnswer {
  label: string;
  reply: string;
  effects: PressEffect[];
}

export type PressSubject = 'hero' | 'hatTrick' | 'redCard';

export interface PressQuestion {
  id: string;
  phase: 'pre' | 'post';
  tag: string;
  subject?: PressSubject;
  text: string;
  answers: Record<PressTone, PressAnswer>;
}

const GENERIC = ['anyPre', 'anyPost'];
const FILLER = ['hatTrick', 'redCard'];
/** Tags that call a conference even the week after another one. */
/** Tags about the next match; the rest are about the result. */
const PRE_TAGS = new Set(['final', 'playoff', 'derby', 'rival', 'top']);
const BIG = new Set(['final', 'trophy', 'playoffOut', 'playoff', 'derby', 'derbyWin', 'derbyLoss']);

export const PRESS_QUESTION_LIST: readonly PressQuestion[] = loadQuestions(PRESS_QUESTIONS.questions as unknown as PressQuestion[]);
const BY_ID = new Map(PRESS_QUESTION_LIST.map((q) => [q.id, q]));

function loadQuestions(list: PressQuestion[]): PressQuestion[] {
  const tags = new Set([...P.order, ...GENERIC]);
  const seen = new Set<string>();
  for (const q of list) {
    if (seen.has(q.id)) throw new Error(`Press question ${q.id} twice`);
    seen.add(q.id);
    if (!tags.has(q.tag)) throw new Error(`Press question ${q.id}: unknown tag ${q.tag}`);
    for (const t of PRESS_TONES) if (!q.answers[t]) throw new Error(`Press question ${q.id}: no ${t} answer`);
  }
  return list;
}

export function pressQuestion(id: string): PressQuestion | undefined {
  return BY_ID.get(id);
}

/** The story event entry a conference uses, so it reads like any other event. */
export const PRESS_DEF: EventDef = {
  id: 'press',
  role: 'reporter',
  when: {},
  title: 'Press conference',
  text: '',
  staff: P.staffTone,
  choices: PRESS_TONES.map((t) => ({ id: t, label: t, hint: '', result: '', effects: [] })),
};

// ---------------------------------------------------------------------------
// The weekly step
// ---------------------------------------------------------------------------

/** After the week's matches: promises to win are judged, rivalries cool, and a conference may be called. */
export function weeklyPress(career: Career): void {
  if (career.phase !== 'season') return;
  judgeClaims(career);
  const heat = career.story.heat;
  for (const id of Object.keys(heat)) {
    heat[id] = round3(heat[id] - P.heat.drift);
    if (heat[id] <= 0) delete heat[id];
  }
  callConference(career);
}

/** The next match is about to be played: the assistant takes any questions still waiting. */
export function closePress(career: Career): void {
  for (const ev of career.story.events) if (ev.press && ev.answer === null) answerPress(career, ev, null);
}

/** The open press conference, if any. */
export function openConference(career: Career): StoryEvent | null {
  return career.story.events.find((e) => e.press && e.answer === null) ?? null;
}

function involves(m: ScheduledMatch, id: string): boolean {
  return m.homeId === id || m.awayId === id;
}

function teamOf(career: Career, id: string | null): Team | undefined {
  return id ? career.season.league.teams.find((t) => t.id === id) : undefined;
}

interface Played {
  match: ScheduledMatch;
  oppId: string;
  us: number;
  them: number;
  won: boolean;
  lost: boolean;
}

function playedOf(career: Career, match: ScheduledMatch): Played | null {
  const r = match.result;
  if (!r) return null;
  const me = career.userTeamId;
  const home = match.homeId === me;
  const us = home ? r.homeScore : r.awayScore;
  const them = home ? r.awayScore : r.homeScore;
  const won = r.winnerId ? r.winnerId === me : us > them;
  const lost = r.winnerId ? r.winnerId !== me : us < them;
  return { match, oppId: home ? match.awayId : match.homeId, us, them, won, lost };
}

const STAGE: Record<ScheduledMatch['stage'], string> = { league: 'league game', quarterFinal: 'quarter-final', semiFinal: 'semi-final', final: 'final' };

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${s}`;
}

function runOf(form: readonly string[], r: string): number {
  let n = 0;
  for (let i = form.length - 1; i >= 0 && form[i] === r; i--) n++;
  return n;
}

function callConference(career: Career): void {
  const state = career.season;
  const me = career.userTeamId;
  const story = career.story;
  const lastMatch = state.schedule.matches.find((m) => m.result && m.week === state.week - 1 && involves(m, me)) ?? null;
  const nextMatch = state.phase === 'complete' ? null : (state.schedule.matches.find((m) => !m.result && m.week === state.week && involves(m, me)) ?? null);
  const last = lastMatch ? playedOf(career, lastMatch) : null;
  const myTeam = userTeam(career);
  const rows = state.standings;
  const pos = new Map(rows.map((r, i) => [r.teamId, i + 1]));
  const row = rows.find((r) => r.teamId === me);
  const played = row?.played ?? 0;
  const tags = new Set<string>();
  const vars: Record<string, string> = {};
  let hero: string | null = null;
  let hatTrick: string | null = null;
  let redCard: string | null = null;

  if (last) {
    const m = last.match;
    const opp = teamOf(career, last.oppId);
    const margin = Math.abs(last.us - last.them);
    const derby = opp?.region === myTeam.region;
    vars.score = `${last.us}-${last.them}`;
    if (m.stage !== 'league') {
      if (last.lost) tags.add('playoffOut');
      else if (m.stage === 'final' && last.won) tags.add('trophy');
    }
    if (derby && last.won) tags.add('derbyWin');
    if (derby && last.lost) tags.add('derbyLoss');
    if (margin >= TR.bigMargin) tags.add(last.won ? 'bigWin' : 'bigLoss');
    if (m.stage === 'league' && played >= TR.upsetMinPlayed) {
      const gap = (pos.get(last.oppId) ?? 0) - (pos.get(me) ?? 0);
      if (last.won && -gap >= TR.upsetGap) tags.add('upsetWin');
      if (last.lost && gap >= TR.upsetGap) tags.add('upsetLoss');
    }
    const form = row?.form ?? [];
    const lossRun = runOf(form, 'L');
    const winRun = runOf(form, 'W');
    if (m.stage === 'league' && lossRun >= TR.lossRun) {
      tags.add('lossRun');
      vars.n = String(lossRun);
    } else if (m.stage === 'league' && winRun >= TR.winRun) {
      tags.add('winRun');
      vars.n = String(winRun);
    }
    const players = state.league.players;
    const ours = Object.values(m.result!.playerStats ?? {}).filter((s) => players[s.playerId]?.teamId === me && s.minutes > 0);
    hero = [...ours].sort((a, b) => b.rating - a.rating || (a.playerId < b.playerId ? -1 : 1))[0]?.playerId ?? null;
    hatTrick = ours.find((s) => s.goals >= 3)?.playerId ?? null;
    redCard = ours.find((s) => s.redCards > 0)?.playerId ?? null;
  }
  if (nextMatch) {
    const oppId = nextMatch.homeId === me ? nextMatch.awayId : nextMatch.homeId;
    const opp = teamOf(career, oppId);
    vars.stage = STAGE[nextMatch.stage];
    if (nextMatch.stage === 'final') tags.add('final');
    else if (nextMatch.stage !== 'league') tags.add('playoff');
    if (opp?.region === myTeam.region) tags.add('derby');
    if ((story.heat[oppId] ?? 0) >= TR.rivalHeat) tags.add('rival');
    if (nextMatch.stage === 'league' && played >= TR.topMinPlayed) {
      const a = pos.get(me) ?? 99;
      const b = pos.get(oppId) ?? 99;
      if ((a <= TR.topPlaces && b <= TR.topPlaces) || (b === 1 && a <= TR.topPlaces + 1) || (a === 1 && b <= TR.topPlaces + 1)) tags.add('top');
    }
  } else if (lastMatch && lastMatch.stage !== 'league') {
    vars.stage = STAGE[lastMatch.stage];
  }
  if (!tags.size) return;
  const big = [...tags].some((t) => BIG.has(t));
  if (!big && story.lastPress >= 0 && career.weekIndex - story.lastPress < P.minGap) return;

  if (hatTrick) tags.add('hatTrick');
  if (redCard) tags.add('redCard');
  if (row) vars.pos = ordinal(pos.get(me) ?? rows.length);
  vars.cup = WORLD.league.playoffTrophy;

  const rng = careerRng(career, 'press');
  const fresh = (q: PressQuestion): boolean => {
    const at = story.last[`pq:${q.id}`];
    return at === undefined || career.weekIndex - at >= P.questions.repeatWeeks;
  };
  const subjectOf = (q: PressQuestion): string | null | undefined => {
    if (!q.subject) return null;
    const id = q.subject === 'hero' ? hero : q.subject === 'hatTrick' ? hatTrick : redCard;
    return id ?? undefined;
  };
  const picks: { q: PressQuestion; playerId: string | null }[] = [];
  const take = (pool: PressQuestion[]): boolean => {
    for (const q of rng.shuffle(pool.filter((x) => fresh(x) && !picks.some((p) => p.q.id === x.id)))) {
      if (q.phase === 'pre' && !nextMatch) continue;
      if (q.phase === 'post' && !last) continue;
      const who = subjectOf(q);
      if (who === undefined) continue;
      picks.push({ q, playerId: who });
      return true;
    }
    return false;
  };
  const ordered = P.order.filter((t) => tags.has(t) && !FILLER.includes(t));
  const total = ordered.length >= 2 ? P.questions.many : P.questions.few;
  for (const t of ordered) {
    if (picks.length >= Math.min(total, P.questions.manyFromTags)) break;
    take(PRESS_QUESTION_LIST.filter((q) => q.tag === t));
  }
  for (const t of FILLER) if (picks.length < total && tags.has(t)) take(PRESS_QUESTION_LIST.filter((q) => q.tag === t));
  const generic = PRESS_QUESTION_LIST.filter((q) => (q.tag === 'anyPost' && last) || (q.tag === 'anyPre' && nextMatch));
  while (picks.length < total && take(generic));
  // Out of fresh questions: ask the ones heard longest ago again.
  const stale = generic.filter((q) => !fresh(q)).sort((a, b) => (story.last[`pq:${a.id}`] ?? 0) - (story.last[`pq:${b.id}`] ?? 0) || (a.id < b.id ? -1 : 1));
  for (const q of stale) if (picks.length < total && !picks.some((p) => p.q.id === q.id)) picks.push({ q, playerId: null });
  if (!picks.length) return;
  // Questions about the result come first, then the next match.
  picks.sort((a, b) => (a.q.phase === b.q.phase ? 0 : a.q.phase === 'post' ? -1 : 1));

  const conf: PressConference = {
    nextId: nextMatch ? (nextMatch.homeId === me ? nextMatch.awayId : nextMatch.homeId) : null,
    nextMatchId: nextMatch?.id ?? null,
    lastId: last?.oppId ?? null,
    tags: [...tags],
    vars,
    questions: picks.map((p) => ({ id: p.q.id, playerId: p.playerId, tone: null, staff: false })),
  };
  const hasPre = picks.some((p) => p.q.phase === 'pre');
  const hasPost = picks.some((p) => p.q.phase === 'post');
  const nextName = teamOf(career, conf.nextId)?.shortName ?? 'the next game';
  const lastName = teamOf(career, conf.lastId)?.shortName ?? 'the game';
  vars.context = hasPre && hasPost ? `after ${lastName} and before ${nextName}` : hasPre ? `before ${nextName}` : `after ${lastName}`;
  vars.title = titleOf(conf, nextMatch !== null && (!last || [...tags].some((t) => PRE_TAGS.has(t))), nextName, lastName);

  const ev: StoryEvent = {
    id: nextId(career, 'ev'),
    eventId: PRESS_DEF.id,
    role: 'reporter',
    weekIndex: career.weekIndex,
    deadlineWeek: career.weekIndex + P.deadline,
    playerId: null,
    person: null,
    amount: 0,
    answer: null,
    mailId: '',
    press: conf,
  };
  const assistant = staffName(career, 'assistantCoach') ?? 'the assistant coach';
  const count = picks.length === 2 ? 'Two questions' : picks.length === 3 ? 'Three questions' : 'One question';
  addInbox(career, 'decision', vars.title, `The press want to hear from you ${vars.context}. ${count}. Answer them before the next match, or ${assistant} will.`);
  const mail = career.inbox[0];
  mail.eventRef = ev.id;
  ev.mailId = mail.id;
  story.events.push(ev);
  story.lastPress = career.weekIndex;
  for (const p of picks) story.last[`pq:${p.q.id}`] = career.weekIndex;
}

function titleOf(conf: PressConference, hasPre: boolean, nextName: string, lastName: string): string {
  const t = new Set(conf.tags);
  if (t.has('trophy')) return 'Press conference: champions';
  if (hasPre && t.has('final')) return 'Press conference before the final';
  if (hasPre && t.has('playoff')) return `Press conference before the ${conf.vars.stage} with ${nextName}`;
  if (hasPre && t.has('derby')) return `Press conference before the derby with ${nextName}`;
  if (hasPre && t.has('top')) return `Press conference before the top-of-the-table game with ${nextName}`;
  if (hasPre) return `Press conference before ${nextName}`;
  return `Press conference after ${lastName}`;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

function fillPress(career: Career, conf: PressConference, q: { id: string; playerId: string | null }, text: string): string {
  const team = userTeam(career);
  const def = BY_ID.get(q.id);
  const opp = teamOf(career, def?.phase === 'pre' ? conf.nextId : conf.lastId);
  const p = q.playerId ? career.season.league.players[q.playerId] : undefined;
  const vars: Record<string, string> = {
    ...conf.vars,
    us: team.shortName,
    city: team.city,
    nick: team.nickname,
    them: opp?.shortName ?? 'them',
    coach: staffName(career, 'headCoach') ?? 'the head coach',
    player: p ? playerName(p) : 'he',
    first: p ? p.firstName : 'He',
  };
  return text.replace(/\{(\w+)\}/g, (all, key: string) => vars[key] ?? all);
}

function current(conf: PressConference): number {
  const i = conf.questions.findIndex((q) => q.tone === null);
  return i < 0 ? conf.questions.length - 1 : i;
}

/** What the scene shows: the question waiting, the three answers, and how the last one went down. */
export function pressView(career: Career, ev: StoryEvent): EventView | null {
  const conf = ev.press;
  if (!conf) return null;
  const idx = current(conf);
  const q = conf.questions[idx];
  const def = BY_ID.get(q.id);
  if (!def) return null;
  const prev = idx > 0 ? conf.questions[idx - 1] : null;
  const prevDef = prev ? BY_ID.get(prev.id) : undefined;
  const reply = prev?.tone && prevDef && !prev.staff ? fillPress(career, conf, prev, prevDef.answers[prev.tone].reply) : null;
  const hints = P.toneHints as Record<PressTone, string>;
  return {
    id: ev.id,
    role: 'reporter',
    title: conf.vars.title ?? 'Press conference',
    text: fillPress(career, conf, q, def.text),
    deadlineWeek: ev.deadlineWeek,
    choices: PRESS_TONES.map((t) => ({ id: t, label: fillPress(career, conf, q, def.answers[t].label), hint: hints[t] })),
    answer: ev.answer,
    staffName: staffName(career, 'assistantCoach') ?? 'the assistant coach',
    press: { index: idx, total: conf.questions.length, reply },
  };
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

/**
 * Answers the waiting question with a tone, or null to send the assistant for the rest.
 * Each answer counts at once; the last one closes the conference and sends the quotes to the paper.
 */
export function answerPress(career: Career, ev: StoryEvent, choice: string | null): AnswerResult {
  const conf = ev.press;
  if (!conf || ev.answer !== null) return { ok: false, text: 'That has already been dealt with.' };
  if (choice !== null && !PRESS_TONES.includes(choice as PressTone)) return { ok: false, text: 'That is not one of the choices.' };
  const assistant = staffName(career, 'assistantCoach') ?? 'The assistant coach';
  let text: string;
  if (choice === null) {
    const scale = staffScale(staffQuality(career, 'reporter'));
    for (const q of conf.questions) {
      if (q.tone !== null) continue;
      q.tone = P.staffTone as PressTone;
      q.staff = true;
      applyAnswer(career, conf, q, scale);
    }
    text = `${assistant} will take the questions.`;
  } else {
    const q = conf.questions[current(conf)];
    q.tone = choice as PressTone;
    applyAnswer(career, conf, q, NO_SCALE);
    const def = BY_ID.get(q.id);
    text = def ? fillPress(career, conf, q, def.answers[q.tone].reply) : '';
  }
  if (conf.questions.every((q) => q.tone !== null)) finish(career, ev, conf);
  return { ok: true, text };
}

function applyAnswer(career: Career, conf: PressConference, q: PressConference['questions'][number], s: Scale): void {
  const def = BY_ID.get(q.id);
  if (!def || !q.tone) return;
  const story = career.story;
  const team = userTeam(career);
  const oppId = def.phase === 'pre' ? conf.nextId : conf.lastId;
  for (const e of def.answers[q.tone].effects) {
    if ('fans' in e) team.fanMood = clamp(team.fanMood + scaled(e.fans, s), C.fans.min, C.fans.max);
    else if ('squad' in e) for (const id of team.playerIds) setMood(career, id, playerMood(career, id) + scaled(e.squad, s));
    else if ('mood' in e) {
      if (q.playerId) setMood(career, q.playerId, playerMood(career, q.playerId) + scaled(e.mood, s));
    } else if ('press' in e) story.press = round3(clamp(story.press + scaled(e.press, s), 0, 1));
    else if ('heat' in e) {
      if (oppId) story.heat[oppId] = round3(clamp((story.heat[oppId] ?? 0) + scaled(e.heat, s), 0, P.heat.max));
    } else if ('claim' in e) {
      if (e.claim && def.phase === 'pre' && conf.nextMatchId && conf.nextId && !story.claims.some((c) => c.matchId === conf.nextMatchId)) {
        story.claims.push({ matchId: conf.nextMatchId, opponentId: conf.nextId, weekIndex: career.weekIndex });
      }
    }
  }
}

const LOUDEST: readonly PressTone[] = ['bold', 'calm', 'deflect'];

function finish(career: Career, ev: StoryEvent, conf: PressConference): void {
  const mine = conf.questions.filter((q) => !q.staff);
  ev.answer = mine.length ? 'done' : 'staff';
  const assistant = staffName(career, 'assistantCoach') ?? 'The assistant coach';
  const lines = conf.questions.map((q) => {
    const def = BY_ID.get(q.id);
    if (!def || !q.tone) return '';
    return `Q: ${fillPress(career, conf, q, def.text)}\n${q.staff ? assistant : 'You'}: "${fillPress(career, conf, q, def.answers[q.tone].label)}"`;
  });
  const mail = career.inbox.find((m) => m.id === ev.mailId);
  if (mail) {
    mail.body = `${mail.body}\n${lines.filter(Boolean).join('\n')}`;
    if (mine.length) mail.read = true;
  }
  const rng = careerRng(career, `press-news:${ev.id}`);
  const N = PRESS_QUESTIONS.news;
  if (!mine.length) {
    reportStory(career, fillNews(rng.pick(N.staff), { context: conf.vars.context ?? '', assistant }), P.news.staff);
    return;
  }
  const tone = LOUDEST.find((t) => mine.some((q) => q.tone === t))!;
  const q = mine.find((x) => x.tone === tone)!;
  const def = BY_ID.get(q.id)!;
  const quote = fillPress(career, conf, q, def.answers[tone].label);
  reportStory(career, fillNews(rng.pick(N[tone]), { quote, context: conf.vars.context ?? '' }), P.news.quote);
}

function fillNews(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(quote|context|assistant|them|score)\}/g, (all, key: string) => vars[key] ?? all);
}

/** Promises to win: kept with a win, broken by anything else, once the match is played. */
function judgeClaims(career: Career): void {
  const story = career.story;
  if (!story.claims.length) return;
  const keep: typeof story.claims = [];
  for (const c of story.claims) {
    const match = career.season.schedule.matches.find((m) => m.id === c.matchId);
    if (!match) continue;
    const played = playedOf(career, match);
    if (!played) {
      keep.push(c);
      continue;
    }
    const fx = played.won ? P.claim.kept : P.claim.broken;
    const team = userTeam(career);
    story.press = round3(clamp(story.press + fx.press, 0, 1));
    team.fanMood = clamp(team.fanMood + fx.fans, C.fans.min, C.fans.max);
    for (const id of team.playerIds) setMood(career, id, playerMood(career, id) + fx.squad);
    const them = teamOf(career, c.opponentId)?.shortName ?? 'them';
    const score = `${played.us}-${played.them}`;
    const rng = careerRng(career, `press-claim:${c.matchId}`);
    reportStory(career, fillNews(rng.pick(played.won ? PRESS_QUESTIONS.news.claimKept : PRESS_QUESTIONS.news.claimBroken), { them, score }), P.news.claim);
    addInbox(
      career,
      'info',
      played.won ? `You said it: ${team.shortName} beat ${them}` : `Words come back: no win over ${them}`,
      played.won
        ? `You promised the press a win over ${them}, and the team delivered, ${score}. The fans and the papers loved it.`
        : `You promised the press a win over ${them}. It ended ${score}, and the papers have not let it go.`,
    );
  }
  story.claims = keep;
}
