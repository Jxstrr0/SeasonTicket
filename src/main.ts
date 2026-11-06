import './ui/base.css';
import { bootCareer } from './ui/career/boot';
import { bootDone, bootFailed, bootStep, stylesReady } from './ui/bootScreen';

// The loading screen (index.html) has been up since the first frame; this script arriving is
// the halfway mark, the stylesheet the next, and the drawn title screen the end.
bootStep(0.55);

function start(): void {
  const root = document.getElementById('app');
  if (!root) throw new Error('Missing #app');

  // The career is the game: its title screen shows at once and the rest loads behind it (Stage 7.4).
  // #sandbox keeps the Stage 1 season simulator for testing the engine.
  // #engine-lab (optionally #engine-lab/<seed>) opens the 2D spatial engine viewer. Both load on demand.
  if (location.hash === '#sandbox') {
    void import('./ui/app').then((m) => {
      new m.App(root);
      bootDone();
    }, bootFailed);
  } else if (location.hash.startsWith('#engine-lab')) {
    void import('./ui/lab/engineLab').then((lab) => {
      new lab.EngineLab(root);
      bootDone();
    }, bootFailed);
  } else {
    bootCareer(root);
    bootDone();
  }
}

void stylesReady().then(() => {
  bootStep(0.8);
  try {
    start();
  } catch (err) {
    bootFailed(err);
  }
});

window.addEventListener('hashchange', () => location.reload());
