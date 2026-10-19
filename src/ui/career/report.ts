/**
 * The problem report (Stage 7.5): a short text the player copies and pastes into the
 * contact form on the studio website. The game sends nothing itself.
 */
import VERSION from '../../data/meta/version.json';

export const CONTACT_URL = 'https://jxstrr0.github.io/Kelbo.Website/#contact-heading';
/**
 * The website's message box takes this many characters. A save code is 100,000 or more,
 * so a report never carries the save: the screens say how to send it another way.
 */
export const REPORT_LIMIT = 5000;

export const GAME_VERSION: string = VERSION.version;

export interface ReportInput {
  /** "Season 2, week 14", or null with no career. */
  where: string | null;
  /** The error behind a crash, if there was one. */
  error?: string | null;
  /** navigator.userAgent and the screen size; passed in so tests can fix them. */
  device: string;
  build?: string;
}

export function buildReport(i: ReportInput): string {
  const lines = [
    'Season Ticket problem report',
    `Version: ${GAME_VERSION} (build ${i.build ?? buildId()})`,
    `Device: ${i.device}`,
    `Career: ${i.where ?? 'none'}`,
  ];
  if (i.error) lines.push(`Error: ${i.error.slice(0, 600)}`);
  lines.push('', 'What happened: ');
  return lines.join('\n');
}

/** The error as one or two lines: message, then where it came from. */
export function errorSummary(err: unknown): string {
  if (err instanceof Error) {
    const at = (err.stack ?? '').split('\n').find((l) => l.trim().startsWith('at ') || l.includes('@'));
    return at ? `${err.name}: ${err.message} | ${at.trim()}` : `${err.name}: ${err.message}`;
  }
  return String(err);
}

export function deviceSummary(): string {
  const ua = typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent;
  const size = typeof window === 'undefined' ? '' : `, screen ${window.innerWidth}x${window.innerHeight}`;
  return `${ua}${size}`;
}

function buildId(): string {
  return typeof __BUILD_ID__ === 'undefined' ? 'dev' : __BUILD_ID__;
}
