export const ROOT: string;
export function readSource(rel: string): string;
export function fileSize(rel: string): number;
export function writeSource(rel: string, text: string): void;
export function listSources(relDir: string, ext?: string): string[];
export function listFilesDeep(relDir: string): string[];
export function envFlag(name: string): boolean;
export function bundleAndImport<T>(relEntry: string): Promise<{ mod: T; cleanup: () => void }>;
export function countGcs(fn: () => void): Promise<number>;
