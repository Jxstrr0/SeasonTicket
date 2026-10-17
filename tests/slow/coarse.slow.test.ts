/** Season believability on the spatial engine in coarse mode (every background match). Minutes long: npm run test:slow. */
import { spatialSeasonSuite } from '../helpers/spatialSeasons';

spatialSeasonSuite('coarse', 6, { determinism: true });
