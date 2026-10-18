/**
 * One-line commentary for the match feed. Templates live in
 * src/data/commentary.json; this module only picks one and fills the
 * placeholders so wording changes never touch engine logic.
 */
import commentaryJson from '../../data/commentary.json';
import type { MatchEventType } from '../types';
import type { Rng } from '../rng';

const TEMPLATES = commentaryJson as unknown as Record<string, string[] | string>;

export type CommentaryParams = Record<string, string | number>;

/** Picks a template for the event type with the match Rng and fills {placeholders}. */
export function describe(eventType: MatchEventType, params: CommentaryParams, rng: Rng): string {
  const options = usableTemplates(templatesFor(eventType, params.variant), params);
  const template = options.length === 1 ? options[0] : rng.pick(options);
  return fillPlaceholders(template, params);
}

/**
 * The same, with the template picked by `u` (0 to 1) instead of the match Rng: for screens
 * that word the match as it is shown (the commentary ticker), which must never draw on it.
 */
export function describeAt(eventType: MatchEventType, params: CommentaryParams, u: number): string {
  const options = usableTemplates(templatesFor(eventType, params.variant), params);
  const template = options[Math.min(options.length - 1, Math.floor(Math.max(0, u) * options.length))];
  return fillPlaceholders(template, params);
}

/** A variant ("chance" + "blocked") has its own lines; otherwise the event type's lines are used. */
function templatesFor(eventType: MatchEventType, variant: string | number | undefined): string[] {
  const keys = variant === undefined ? [eventType] : [`${eventType}:${variant}`, eventType];
  for (const key of keys) {
    const entry = TEMPLATES[key];
    if (Array.isArray(entry) && entry.length > 0) return entry;
  }
  // A type without templates still produces readable text rather than crashing the feed.
  return ['{detail}'];
}

/** Drops lines whose placeholders would be empty (e.g. {assist} on an unassisted goal) when others remain. */
function usableTemplates(templates: string[], params: CommentaryParams): string[] {
  const complete = templates.filter((t) => placeholders(t).every((key) => params[key] !== undefined && params[key] !== ''));
  return complete.length > 0 ? complete : templates;
}

/** Templates are fixed data, so each one is parsed once. */
const placeholderCache = new Map<string, string[]>();

function placeholders(template: string): string[] {
  let keys = placeholderCache.get(template);
  if (!keys) {
    keys = Array.from(template.matchAll(/\{(\w+)\}/g), (m) => m[1]);
    placeholderCache.set(template, keys);
  }
  return keys;
}

const LABELS = (commentaryJson as unknown as { _labels: { mentality: string[]; shootoutKick: Record<string, string> } })._labels;

export function mentalityLabel(dial: number): string {
  return LABELS.mentality[dial - 1] ?? String(dial);
}

export function shootoutKickLabel(outcome: 'scored' | 'saved' | 'missed'): string {
  return LABELS.shootoutKick[outcome];
}

function fillPlaceholders(template: string, params: CommentaryParams): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = params[key];
    return value === undefined ? '' : String(value);
  }).replace(/\s{2,}/g, ' ').trim();
}

/** "First Last" display name used in every commentary line. */
export function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`;
}
