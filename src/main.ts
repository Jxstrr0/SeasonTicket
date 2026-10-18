import './ui/base.css';
import { bootCareer } from './ui/career/boot';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app');

// The career is the game: its title screen shows at once and the rest loads behind it (Stage 7.4).
// #sandbox keeps the Stage 1 season simulator for testing the engine.
// #engine-lab (optionally #engine-lab/<seed>) opens the 2D spatial engine viewer. Both load on demand.
if (location.hash === '#sandbox') void import('./ui/app').then((m) => new m.App(root));
else if (location.hash.startsWith('#engine-lab')) void import('./ui/lab/engineLab').then((lab) => new lab.EngineLab(root));
else bootCareer(root);

window.addEventListener('hashchange', () => location.reload());
