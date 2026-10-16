import './ui/base.css';
import { App } from './ui/app';
import { CareerApp } from './ui/career/app';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app');

// The career is the game. #sandbox keeps the Stage 1 season simulator for testing the engine.
// #engine-lab (optionally #engine-lab/<seed>) opens the 2D spatial engine viewer, loaded on demand.
if (location.hash === '#sandbox') new App(root);
else if (location.hash.startsWith('#engine-lab')) void import('./ui/lab/engineLab').then((lab) => new lab.EngineLab(root));
else new CareerApp(root);

window.addEventListener('hashchange', () => location.reload());
