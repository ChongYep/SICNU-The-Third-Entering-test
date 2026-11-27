/* ============================================================================
 * Persona 5 Royal Resolver Audio Engine
 * Official "Life Will Change" BGM Controller + Web Audio API Punchy P5 UI SFX
 * ============================================================================ */

class P5AudioEngine {
  constructor() {
    this.ctx = null;
    this.sfxEnabled = true;
    this.bgmEl = document.getElementById("bgmAudio");
    this.bgmPlaying = false;
    this.baseBgmVolume = 0.44;
    if (this.bgmEl) {
      this.bgmEl.volume = this.baseBgmVolume;
    }
  }

  ensureCtx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  toggleBgm() {
    if (!this.bgmEl) return false;
    this.ensureCtx();
    if (this.bgmPlaying) {
      this.bgmEl.pause();
      this.bgmPlaying = false;
    } else {
      this.bgmEl.volume = this.baseBgmVolume;
      this.bgmEl.play().then(() => {
        this.bgmPlaying = true;
      }).catch(() => {});
      this.bgmPlaying = true;
    }
    return this.bgmPlaying;
  }

  duckBgm(ms = 900) {
    if (!this.bgmEl || !this.bgmPlaying) return;
    this.bgmEl.volume = 0.22;
    clearTimeout(this._duckTimer);
    this._duckTimer = setTimeout(() => {
      if (this.bgmEl) this.bgmEl.volume = this.baseBgmVolume;
    }, ms);
  }

  // Sharp Persona 5 menu cursor lock tick + subtle tension ping
  playLock() {
    if (!this.sfxEnabled) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.065);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  // Crisp P5 "WEAK / AC!!" brassy ascending chord stab
  playAC(bigJump = false, firstBlood = false) {
    if (!this.sfxEnabled) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const freqs = firstBlood
      ? [523.25, 659.25, 783.99, 1046.5, 1318.5]
      : bigJump
      ? [440, 554.37, 659.25, 880]
      : [392, 493.88, 587.33, 783.99];

    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx % 2 === 0 ? "sawtooth" : "triangle";
      const t0 = now + idx * 0.032;
      osc.frequency.setValueAtTime(f, t0);

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(3400, t0);
      filter.frequency.exponentialRampToValueAtTime(950, t0 + 0.28);

      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.linearRampToValueAtTime(0.11, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.30);

      osc.connect(filter).connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.32);
    });
  }

  // Punchy P5 "MISS / GUARD" low muted thud
  playWA() {
    if (!this.sfxEnabled) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(165, now);
    osc.frequency.exponentialRampToValueAtTime(62, now + 0.16);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(420, now);

    gain.gain.setValueAtTime(0.20, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(filter).connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.20);
  }

  // Razor P5 Cut-In blade slash + Em9 dramatic funk brass hit!
  playCutIn() {
    if (!this.sfxEnabled) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;
    this.duckBgm(1000);
    const now = ctx.currentTime;

    // 1) White-noise blade slash sweep
    const bufLen = Math.floor(ctx.sampleRate * 0.22);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 1.4);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(3200, now);
    bp.frequency.exponentialRampToValueAtTime(750, now + 0.20);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.28, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    noise.connect(bp).connect(ng).connect(ctx.destination);
    noise.start(now);

    // 2) Dramatic Em9 P5 Acid-Jazz brass stab
    [164.81, 246.94, 293.66, 369.99, 493.88].forEach((f) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(f, now + 0.04);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(2800, now + 0.04);
      lp.frequency.exponentialRampToValueAtTime(700, now + 0.55);
      g.gain.setValueAtTime(0.08, now + 0.04);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.58);
      osc.connect(lp).connect(g).connect(ctx.destination);
      osc.start(now + 0.04);
      osc.stop(now + 0.60);
    });
  }

  // Grand Finale All-Out Attack Champion Fanfare
  playChampion() {
    if (!this.sfxEnabled) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;
    this.duckBgm(1600);
    const now = ctx.currentTime;
    const notes = [329.63, 392.0, 493.88, 659.25, 783.99, 987.77];
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sawtooth";
      const t0 = now + i * 0.055;
      osc.frequency.setValueAtTime(f, t0);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(3600, t0);
      lp.frequency.exponentialRampToValueAtTime(1100, t0 + 0.75);
      g.gain.setValueAtTime(0.09, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.85);
      osc.connect(lp).connect(g).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.88);
    });
  }
}

window.P5AudioEngine = P5AudioEngine;
