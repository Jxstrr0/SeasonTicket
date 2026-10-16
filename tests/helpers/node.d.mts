export const ROOT: string;
export function readSource(rel: string): string;
export function listSources(relDir: string, ext?: string): string[];
export function envFlag(name: string): boolean;
export function bundleAndImport<T>(relEntry: string): Promise<{ mod: T; cleanup: () => void }>;
export function countGcs(fn: () => void): Promise<number>;
