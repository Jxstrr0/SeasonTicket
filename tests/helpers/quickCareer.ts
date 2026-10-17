/**
 * Owner-loop tests (finances, contracts, the stadium) play many weeks and seasons. Under
 * vitest's module transform the spatial engine takes seconds a week, so files that import
 * this play the matches nobody watches on the Stage 1 statistical engine instead. The
 * user's live match still runs on the spatial engine, and the game itself never swaps.
 */
import { setBackgroundEngine } from '../../src/sim/career';
import { simulateMatch } from './stage1/engine';

setBackgroundEngine(simulateMatch);
