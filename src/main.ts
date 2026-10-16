import './ui/base.css';
import { App } from './ui/app';
import { CareerApp } from './ui/career/app';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app');

// The career is the game. #sandbox keeps the Stage 1 season simulator for testing the engine.
if (location.hash === '#sandbox') new App(root);
else new CareerApp(root);

window.addEventListener('hashchange', () => location.reload());
