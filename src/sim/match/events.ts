/**
 * Builds MatchEvents from short drafts: stamps the clock and score, resolves
 * names for the commentary line and appends the event to the state.
 */
import type { Rng } from '../rng';
import type { MatchEvent, MatchEventType, Side } from '../types';
import { describe, fullName, type CommentaryParams } from './commentary';
import { otherSide, sideState, type MatchContext, type MatchState } from './state';

export interface EventDraft {
  type: MatchEventType;
  side: Side | null;
  playerId?: string | null;
  secondaryPlayerId?: string | null;
  xg?: number | null;
  highlight?: boolean;
  /** Picks a template sub-list, e.g. "blocked" for a chance. */
  variant?: string;
  /** Free text for the {detail} placeholder. */
  detail?: string;
  /** Overrides for any placeholder. */
  params?: CommentaryParams;
  /** Override the minute stamp (the shootout uses a fixed minute). */
  minute?: number;
}

export function emitEvent(state: MatchState, ctx: MatchContext, rng: Rng, draft: EventDraft): MatchEvent {
  const teamId = draft.side ? sideState(state, draft.side).teamId : null;
  const opponentId = draft.side ? sideState(state, otherSide(draft.side)).teamId : null;
  const secondaryName = nameOf(ctx, draft.secondaryPlayerId ?? null);
  const params: CommentaryParams = {
    minute: draft.minute ?? state.minute,
    team: teamName(ctx, teamId),
    opponent: teamName(ctx, opponentId),
    player: nameOf(ctx, draft.playerId ?? null),
    secondary: secondaryName,
    assist: secondaryName,
    score: scoreLine(state, ctx),
    detail: draft.detail ?? '',
    ...(draft.variant !== undefined ? { variant: draft.variant } : {}),
    ...(draft.params ?? {}),
  };
  const event: MatchEvent = {
    minute: draft.minute ?? state.minute,
    added: draft.minute !== undefined ? 0 : state.added,
    type: draft.type,
    side: draft.side,
    teamId,
    playerId: draft.playerId ?? null,
    secondaryPlayerId: draft.secondaryPlayerId ?? null,
    xg: draft.xg ?? null,
    text: describe(draft.type, params, rng),
    homeScore: state.homeScore,
    awayScore: state.awayScore,
    highlight: draft.highlight ?? false,
  };
  state.events.push(event);
  return event;
}

export function nameOf(ctx: MatchContext, playerId: string | null): string {
  if (playerId === null || playerId === '') return '';
  const player = ctx.players[playerId];
  return player ? fullName(player) : playerId;
}

export function teamName(ctx: MatchContext, teamId: string | null): string {
  if (teamId === null) return '';
  return ctx.teams[teamId]?.shortName ?? teamId;
}

export function scoreLine(state: MatchState, ctx: MatchContext): string {
  return `${teamName(ctx, state.home.teamId)} ${state.homeScore}-${state.awayScore} ${teamName(ctx, state.away.teamId)}`;
}
