/**
 * Builds the plain snapshot the 3D stadium draws from (on the Stadium tab and
 * through the office window). Like the office snapshot, this is the only place
 * the stadium render code's data comes from the career.
 */
import { C, closedSeatsByStand, defaultCrest, lastHomeCrowd, standSeats, type Career } from '../../sim/career';
import { STAND_IDS } from '../../sim/career/types';
import type { StadiumSnapshot } from '../../render/stadium/types';
import { renderCrest } from '../views/career/crest';

/** The crest as a standalone SVG document (loadable as an image). */
export function crestDocument(career: Career, size = 200, teamId = career.userTeamId): string {
  const team = teamOf(career, teamId);
  const crest = teamId === career.userTeamId ? career.crest : defaultCrest(team.colors, team.abbr);
  return renderCrest(crest, size).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
}

function teamOf(career: Career, teamId: string) {
  const team = career.season.league.teams.find((t) => t.id === teamId);
  if (!team) throw new Error(`no club ${teamId}`);
  return team;
}

/** Advertisers for the boards: the shirt sponsor, the naming-rights partner, then the regular pool. */
function boardSponsors(career: Career, teamId: string): string[] {
  const books = career.books[teamId];
  const out: string[] = [];
  if (books?.sponsor) out.push(books.sponsor.brand);
  if (books?.namingRights) out.push(books.namingRights.brand);
  for (const b of C.sponsors.brands as string[]) if (!out.includes(b)) out.push(b);
  return out;
}

/**
 * Any club's ground; the user's by default. A match day passes the home club and
 * the crowd share of that match.
 */
export function buildStadiumSnapshot(
  career: Career,
  crestSvg?: string,
  teamId = career.userTeamId,
  crowd?: number,
): StadiumSnapshot {
  const team = teamOf(career, teamId);
  const stadium = career.stadiums[teamId];
  const closedSeats = closedSeatsByStand(stadium, career.phase === 'season');
  const closed: StadiumSnapshot['closed'] = {};
  for (const id of STAND_IDS) {
    const shut = closedSeats[id] ?? 0;
    const seats = standSeats(stadium, id);
    if (shut > 0 && seats > 0) closed[id] = Math.min(1, shut / seats);
  }
  const attendance = crowd ?? lastHomeCrowd(career, teamId);
  return {
    name: team.stadiumName,
    clubName: team.name,
    abbr: team.abbr,
    primary: team.colors.primary,
    secondary: team.colors.secondary,
    crestSvg: crestSvg ?? crestDocument(career, 200, teamId),
    stands: {
      west: { ...stadium.stands.west },
      north: { ...stadium.stands.north },
      east: { ...stadium.stands.east },
      south: { ...stadium.stands.south },
    },
    corners: { ...stadium.corners },
    upgrades: { ...stadium.upgrades },
    look: { ...stadium.look },
    works: stadium.projects.map((p) => ({
      kind: p.kind,
      target: p.target,
      toLevel: p.toLevel,
      progress: p.queued || p.weeks <= 0 ? 0 : Math.max(0, Math.min(1, 1 - p.weeksLeft / p.weeks)),
      queued: p.queued,
    })),
    closed,
    attendance,
    condition: team.stadiumCondition,
    sponsors: boardSponsors(career, teamId),
  };
}
