/**
 * The office's sound (Stage 7.2): soft room air, the crowd drifting in through the window on
 * a home match week, and the radio on the credenza. The radio is the only music in the game;
 * it plays a few CC0 songs in turn through a small speaker, starts off, and is switched on
 * and off by tapping it. Its songs load only when it is first switched on.
 */
import tuning from '../../data/tuning/audio.json';
import atmosphere from '../../data/tuning/atmosphere.json';
import { audioHub, firstSound } from './hub';
import { synth } from './synth';

const O = tuning.office;
const R = tuning.radio;

interface Loop {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

export class OfficeAudio {
  private on = false;
  private crowdWanted = false;
  private radioOn = false;
  private room: Loop | null = null;
  private crowd: Loop | null = null;
  private crowdLoading = false;
  /** The radio's chain: speaker filters into a gain on the music bus. */
  private radioGain: GainNode | null = null;
  private radioIn: AudioNode | null = null;
  private song: AudioBufferSourceNode | null = null;
  private track = 0;
  /** Bumped to forget a song that finished loading after the radio went off. */
  private radioToken = 0;
  private nextTimer: ReturnType<typeof setTimeout> | null = null;

  /** The office is on screen (true) or not; `homeMatch` when the crowd is gathering. */
  set(on: boolean, homeMatch: boolean, radio: boolean): void {
    const changed = on !== this.on;
    this.on = on;
    this.crowdWanted = homeMatch;
    if (changed) audioHub.hold('office', on);
    this.mixRoom();
    this.mixCrowd();
    this.setRadio(radio);
  }

  /** The mix changed (unmuted, say): start again what should be playing. */
  refresh(): void {
    if (!this.on) return;
    audioHub.hold('office', true);
    this.mixRoom();
    this.mixCrowd();
    if (this.radioOn && !this.song) this.playSong();
  }

  private setRadio(on: boolean): void {
    const want = on && this.on;
    if (want === this.radioOn) return;
    this.radioOn = want;
    if (want) this.playSong();
    else this.stopSong();
  }

  private mixRoom(): void {
    const ctx = audioHub.context();
    const out = audioHub.bus('crowd');
    if (!ctx || !out) return;
    if (!this.room) {
      const buf = audioHub.buffer(synth('room', ctx.sampleRate), ctx.sampleRate);
      if (!buf) return;
      this.room = this.loop(ctx, buf, out, 0, buf.duration);
    }
    this.fade(ctx, this.room.gain.gain, this.on ? O.roomTone : 0);
  }

  private mixCrowd(): void {
    const ctx = audioHub.context();
    const out = audioHub.bus('crowd');
    if (!ctx || !out) return;
    const want = this.on && this.crowdWanted ? O.crowd : 0;
    if (!this.crowd) {
      if (!want || this.crowdLoading) return;
      this.crowdLoading = true;
      // The match crowd's own bed, muffled by the window.
      void audioHub
        .load(atmosphere.sound.files.bed[0])
        .then((buf) => {
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = O.crowdLowpassHz;
          lp.connect(out);
          const start = firstSound(buf);
          this.crowd = this.loop(ctx, buf, lp, start, Math.min(buf.duration, start + atmosphere.sound.loops.bed));
          this.mixCrowd();
        })
        .catch((err: unknown) => console.warn('Office crowd did not load:', err))
        .finally(() => {
          this.crowdLoading = false;
        });
      return;
    }
    this.fade(ctx, this.crowd.gain.gain, want);
  }

  private playSong(): void {
    const ctx = audioHub.context();
    const out = audioHub.bus('music');
    if (!ctx || !out) return;
    if (!this.radioIn) {
      // A small speaker: no deep bass, no sparkle.
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = R.highpassHz;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = R.lowpassHz;
      this.radioGain = ctx.createGain();
      this.radioGain.gain.value = 0;
      hp.connect(lp);
      lp.connect(this.radioGain);
      this.radioGain.connect(out);
      this.radioIn = hp;
    }
    this.fade(ctx, (this.radioGain as GainNode).gain, R.gain);
    const token = ++this.radioToken;
    const path = R.tracks[this.track % R.tracks.length];
    void audioHub
      .load(path)
      .then((buf) => {
        if (token !== this.radioToken || !this.radioOn) return;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(this.radioIn as AudioNode);
        src.onended = () => {
          if (this.song !== src) return;
          this.song = null;
          this.track += 1;
          this.nextTimer = setTimeout(() => {
            this.nextTimer = null;
            if (this.radioOn && token === this.radioToken) this.playSong();
          }, R.gapS * 1000);
        };
        src.start(ctx.currentTime, firstSound(buf));
        this.song = src;
      })
      .catch((err: unknown) => console.warn('Radio song did not load:', err));
  }

  private stopSong(): void {
    this.radioToken += 1;
    if (this.nextTimer !== null) {
      clearTimeout(this.nextTimer);
      this.nextTimer = null;
    }
    const ctx = audioHub.context();
    if (ctx && this.radioGain) this.fade(ctx, this.radioGain.gain, 0);
    const song = this.song;
    this.song = null;
    if (song) {
      // The next song picks up where this one would have gone.
      this.track += 1;
      try {
        song.stop((ctx?.currentTime ?? 0) + O.fadeS);
      } catch {
        // Already stopped.
      }
    }
  }

  private loop(ctx: AudioContext, buf: AudioBuffer, out: AudioNode, start: number, end: number): Loop {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = start;
    src.loopEnd = end;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain);
    gain.connect(out);
    src.start(ctx.currentTime, start);
    return { src, gain };
  }

  private fade(ctx: AudioContext, param: AudioParam, value: number): void {
    param.cancelScheduledValues(ctx.currentTime);
    param.setTargetAtTime(value, ctx.currentTime, O.fadeS / 3);
  }
}
