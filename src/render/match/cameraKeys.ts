/** The 3D match's camera names, apart from cameras.ts so the menus can list them without loading three.js. */
export type CameraKey = 'broadcast' | 'box' | 'goal' | 'overhead' | 'side';

/** The cameras the owner can pick, in button order. */
export const CAMERA_PRESETS: readonly CameraKey[] = ['broadcast', 'box', 'goal', 'overhead'];
