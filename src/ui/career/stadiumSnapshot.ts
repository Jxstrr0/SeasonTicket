/**
 * Builds the plain snapshot the 3D stadium draws from (on the Stadium tab and
 * through the office window). Like the office snapshot, this is the only place
 * the stadium render code's data comes from the career.
 */
import { C, closedSeatsByStand, standSeats, userBooks, userTeam, type Career } from '../../sim/career';
import { STAND_IDS } from '../../sim/career/types';
import type { StadiumSnapshot } from '../../render/stadium/types';
import { renderCrest } from '../views/career/crest';

/** The crest as a standalone SVG document (loadable as an image). */
export function crestDocument(career: Career, size = 200): string {
  return renderCrest(career.crest, size).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
}

/** Advertisers for the boards: the shirt sponsor, the naming-rights partner, then the regular pool. */
function boardSponsors(career: Career): string[] {
  const books = userBooks(career);
  const out: string[] = [];
  if (books.sponsor) out.push(books.sponsor.brand);
  if (books.namingRights) out.push(books.namingRights.brand);
  for (const b of C.sponsors.brands as string[]) if (!out.includes(b)) out.push(b);
  return out;
}

export function buildStadiumSnapshot(career: Career, crestSvg = crestDocument(career)): StadiumSnapshot {
  const team = userTeam(career);
  const stadium = career.stadiums[career.userTeamId];
  const closedSeats = closedSeatsByStand(stadium, career.phase === 'season');
  const closed: StadiumSnapshot['closed'] = {};
  for (const id of STAND_IDS) {
    const shut = closedSeats[id] ?? 0;
    const seats = standSeats(stadium, id);
    if (shut > 0 && seats > 0) closed[id] = Math.min(1, shut / seats);
  }
  const last = career.lastUserMatch;
  const attendance = last && last.homeId === career.userTeamId ? last.attendanceShare : 0.6;
  return {
    name: team.stadiumName,
    clubName: team.name,
    abbr: team.abbr,
    primary: team.colors.primary,
    secondary: team.colors.secondary,
    crestSvg,
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
    sponsors: boardSponsors(career),
  };
}
