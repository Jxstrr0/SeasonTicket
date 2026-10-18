/**
 * What the office needs to know about the club. The UI builds this plain
 * snapshot from the career; the 3D code never reads the sim directly.
 */
import type { StadiumSnapshot } from '../stadium/types';

export type HotspotId = 'laptop' | 'phone' | 'tv' | 'window' | 'whiteboard' | 'clipboard' | 'door' | 'cabinet';

export interface OfficeTableRow {
  pos: number;
  abbr: string;
  played: number;
  points: number;
  user: boolean;
}

export interface OfficeTrophy {
  kind: 'cup' | 'shield' | 'runnerUp';
  season: number;
}

export interface OfficeVisitorCall {
  /** Inbox message id; tapping the visitor opens it. */
  mailId: string;
  role: string;
  title: string;
}

export interface OfficeSlot {
  x: number;
  y: number;
  label: string;
  name: string;
}

/** The newspaper's latest front page, for the TV. */
export interface OfficeFrontPage {
  paper: string;
  edition: string;
  lead: string;
  more: string[];
}

export interface OfficeSnapshot {
  clubName: string;
  shortName: string;
  abbr: string;
  primary: string;
  secondary: string;
  /** The crest as an SVG document string, drawn onto canvases. */
  crestSvg: string;
  leagueName: string;
  weekLabel: string;
  cash: string;
  cashNegative: boolean;
  payroll: string;
  wageCap: string;
  ladderLabel: string | null;
  table: OfficeTableRow[];
  nextFixture: string | null;
  formation: string;
  slots: OfficeSlot[];
  bids: number;
  sponsorOffers: number;
  unread: number;
  trophies: OfficeTrophy[];
  level: number;
  /** 0-1 share of seats sold at the last home match, for the crowd in the window. */
  attendance: number;
  stadiumName: string;
  /** The ground seen through the window. */
  stadium: StadiumSnapshot;
  visitor: OfficeVisitorCall | null;
  /** Null before the first edition: the TV shows the table alone. */
  news: OfficeFrontPage | null;
  /** Fan posts since the last edition, for the phone's badge. */
  posts: number;
}

/** What the office asks the menus to do. */
export type OfficePick = { kind: 'hotspot'; id: HotspotId } | { kind: 'mail'; id: string };
