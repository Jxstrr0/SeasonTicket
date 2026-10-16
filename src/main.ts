/** Entry point: mounts the Stage 1 season page. */
import './ui/base.css';
import { App } from './ui/app';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app');
new App(root);
