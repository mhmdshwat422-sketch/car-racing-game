const midiToFreq = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

// 32-step chiptune patterns (MIDI notes, null = rest)
const bassPattern: (number | null)[] = [
  36, null, 36, null, 43, null, 43, null,
  34, null, 34, null, 41, null, 41, null,
  36, null, 36, null, 43, null, 43, null,
  39, null, 39, null, 46, null, 46, null,
];

const melodyPattern: (number | null)[] = [
  60, null, 67, 72, 67, null, 72, null,
  63, null, 70, 75, 70, null, 75, null,
  60, null, 67, 72, 67, null, 72, null,
  63, null, 65, 70, 67, null, 63, null,
];

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private schedulerId: number | null = null;
  private nextNoteTime = 0;
  private currentStep = 0;
  private musicVol = 0.25;
  private sfxVol = 0.5;
  private readonly tempo = 128;
  private musicPlaying = false;

  init() {
    if (this.ctx) return;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicVol;
    this.musicGain.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxVol;
    this.sfxGain.connect(this.ctx.destination);
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = "lowpass";
    this.engineFilter.frequency.value = 700;
    this.engineGain.connect(this.engineFilter);
    this.engineFilter.connect(this.ctx.destination);
  }

  resume() {
    this.ctx?.resume();
  }

  setMusicVolume(v: number) {
    this.musicVol = v;
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
    }
  }

  setSfxVolume(v: number) {
    this.sfxVol = v;
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
    }
  }

  startMusic() {
    if (!this.ctx || this.musicPlaying) return;
    this.musicPlaying = true;
    this.currentStep = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.08;
    this.scheduler();
  }

  stopMusic() {
    this.musicPlaying = false;
    if (this.schedulerId) {
      clearTimeout(this.schedulerId);
      this.schedulerId = null;
    }
  }

  private scheduler = () => {
    if (!this.ctx || !this.musicPlaying) return;
    const stepDur = 60 / this.tempo / 4;
    while (this.nextNoteTime < this.ctx.currentTime + 0.12) {
      this.scheduleStep(this.currentStep, this.nextNoteTime);
      this.nextNoteTime += stepDur;
      this.currentStep = (this.currentStep + 1) % 32;
    }
    this.schedulerId = window.setTimeout(this.scheduler, 25);
  };

  private scheduleStep(step: number, time: number) {
    if (!this.musicGain) return;
    const stepDur = 60 / this.tempo / 4;
    const bass = bassPattern[step % bassPattern.length];
    if (bass !== null) {
      this.playNote(midiToFreq(bass), time, stepDur * 0.9, "square", 0.35, this.musicGain);
    }
    const melody = melodyPattern[step % melodyPattern.length];
    if (melody !== null) {
      this.playNote(midiToFreq(melody), time, stepDur * 0.8, "square", 0.18, this.musicGain);
    }
  }

  private playNote(
    freq: number,
    time: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    dest: AudioNode,
  ) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  startEngine() {
    if (!this.ctx || !this.engineGain || this.engineOsc) return;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = "sawtooth";
    this.engineOsc.frequency.value = 70;
    this.engineOsc.connect(this.engineGain);
    this.engineOsc.start();
    this.engineGain.gain.setTargetAtTime(0.06, this.ctx.currentTime, 0.1);
  }

  updateEngineSpeed(speed: number) {
    if (!this.ctx || !this.engineOsc) return;
    this.engineOsc.frequency.setTargetAtTime(60 + speed * 10, this.ctx.currentTime, 0.08);
    if (this.engineFilter) {
      this.engineFilter.frequency.setTargetAtTime(500 + speed * 80, this.ctx.currentTime, 0.08);
    }
  }

  stopEngine() {
    if (!this.ctx || !this.engineGain || !this.engineOsc) return;
    this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    const osc = this.engineOsc;
    this.engineOsc = null;
    setTimeout(() => {
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
    }, 200);
  }

  playCrash() {
    if (!this.ctx || !this.sfxGain) return;
    const len = Math.floor(this.ctx.sampleRate * 0.6);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.5);
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1200;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.9, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.6);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    noise.start();
    noise.stop(this.ctx.currentTime + 0.6);
  }

  playScore() {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    this.playNote(880, t, 0.08, "sine", 0.25, this.sfxGain);
    this.playNote(1320, t + 0.04, 0.1, "sine", 0.18, this.sfxGain);
  }

  playClick() {
    if (!this.ctx || !this.sfxGain) return;
    this.playNote(500, this.ctx.currentTime, 0.04, "sine", 0.15, this.sfxGain);
  }

  destroy() {
    this.stopMusic();
    this.stopEngine();
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}
