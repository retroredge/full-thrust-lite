/**
 * Sound effects, all generated with the Web Audio API: no sound files.
 *
 * Browsers only let a page make sound after the player has clicked or
 * pressed a key, so the audio context is created on demand and resumed on
 * the first gesture (see `enableSoundOnFirstGesture`). Until then every
 * effect is silently skipped. Effects are fire-and-forget: each schedules its
 * own short-lived nodes on the audio clock.
 */

type AudioContextClass = typeof AudioContext;

let context: AudioContext | null = null;
let master: GainNode | null = null;
let reverb: ConvolverNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

const MASTER_VOLUME = 0.55;

interface Audio {
  ctx: AudioContext;
  /** Straight to the speakers (through the master volume and limiter). */
  out: GainNode;
  /** Into a large, spacey reverb; send a share of a sound here to give it a tail. */
  reverb: AudioNode;
}

/** A generated impulse response: stereo noise dying away over `seconds`. */
function impulseResponse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / length) ** decay;
    }
  }
  return buffer;
}

function audio(): Audio | null {
  if (typeof window === 'undefined') {
    return null;
  }
  if (context === null) {
    const Constructor: AudioContextClass | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextClass }).webkitAudioContext;
    if (Constructor === undefined) {
      return null;
    }
    context = new Constructor();
    master = context.createGain();
    master.gain.value = MASTER_VOLUME;
    // A compressor keeps several loud sounds at once (a full volley of beams,
    // an explosion) from clipping.
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -16;
    limiter.knee.value = 8;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    master.connect(limiter).connect(context.destination);
    reverb = context.createConvolver();
    reverb.buffer = impulseResponse(context, 2.6, 3);
    reverb.connect(master);
  }
  if (context.state !== 'running') {
    return null;
  }
  return { ctx: context, out: master!, reverb: reverb! };
}

/** Lets sound play once the player has clicked or pressed a key, as browsers require. */
export function enableSoundOnFirstGesture(): void {
  if (typeof window === 'undefined') {
    return;
  }
  const unlock = () => {
    audio();
    preloadSounds();
    if (context !== null && context.state === 'suspended') {
      void context.resume();
    }
  };
  for (const type of ['pointerdown', 'keydown'] as const) {
    window.addEventListener(type, unlock, { capture: true });
  }
}

/** One second of white noise, shared by every noisy effect. */
function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer === null || noiseBuffer.sampleRate !== ctx.sampleRate) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
  }
  return noiseBuffer;
}

/** A gain node that rises to `peak` over `attack` seconds, then decays to silence by `end`. */
function envelope(ctx: AudioContext, start: number, peak: number, attack: number, end: number): GainNode {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  return gain;
}

/** A burst of filtered noise. */
function noiseBurst(
  ctx: AudioContext,
  out: AudioNode,
  start: number,
  duration: number,
  peak: number,
  filter: { type: BiquadFilterType; from: number; to?: number; q?: number },
): void {
  const source = ctx.createBufferSource();
  source.buffer = noise(ctx);
  source.loop = true;
  const shaping = ctx.createBiquadFilter();
  shaping.type = filter.type;
  shaping.Q.value = filter.q ?? 1;
  shaping.frequency.setValueAtTime(filter.from, start);
  if (filter.to !== undefined) {
    shaping.frequency.exponentialRampToValueAtTime(filter.to, start + duration);
  }
  const gain = envelope(ctx, start, peak, Math.min(0.01, duration / 4), start + duration);
  source.connect(shaping).connect(gain).connect(out);
  source.start(start, Math.random() * 0.5);
  source.stop(start + duration + 0.05);
}

/** A tone that glides from one pitch to another. */
function tone(
  ctx: AudioContext,
  out: AudioNode,
  start: number,
  duration: number,
  peak: number,
  type: OscillatorType,
  from: number,
  to = from,
  attack = 0.005,
): void {
  const oscillator = ctx.createOscillator();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, start);
  if (to !== from) {
    oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
  }
  const gain = envelope(ctx, start, peak, attack, start + duration);
  oscillator.connect(gain).connect(out);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.05);
}

// ----- Alerts -----

/** How a klaxon sounds: a run of "whah" pulses at a steady pitch. */
interface AlarmSettings {
  name: string;
  pulses: number;
  /** Length of each pulse, and the gap after it, in seconds. */
  pulseS: number;
  gapS: number;
  /** Base pitch in Hz, and the waveforms layered on it as [type, pitch ratio]. */
  pitch: number;
  waves: readonly (readonly [OscillatorType, number])[];
  /** The resonant filter that makes the "wah": its frequency at the start, at its peak and at the end, in Hz. */
  filter: readonly [number, number, number];
  /** When the filter peaks, in seconds after the pulse starts. */
  peakS: number;
  /** Resonance of the filter. */
  q: number;
  volume: number;
  /** How much of the sound goes to the reverb. */
  reverb: number;
  /** Optional grit, as a distortion amount. */
  grit?: number;
  /** How far the pitch sags at the end of each pulse, as a fraction (0.1 = 10%). */
  sag: number;
}

/** The klaxon for a threshold check: "Battle stations", a single deep "whah" with some grit. */
const THRESHOLD_ALARM: AlarmSettings = {
  name: 'Battle stations',
  pulses: 1,
  pulseS: 0.5,
  gapS: 0.16,
  pitch: 130,
  waves: [
    ['sawtooth', 1],
    ['sawtooth', 1.006],
    ['square', 0.5],
  ],
  filter: [250, 1800, 320],
  peakS: 0.14,
  q: 9,
  volume: 0.17,
  reverb: 0.35,
  grit: 3,
  sag: 0.06,
};

/**
 * Plays a klaxon: "whah, whah, whah". Each pulse is a buzzy tone at a steady
 * pitch through a resonant filter that opens fast and closes again, which
 * gives the "wah", with a slight sag in pitch at the end.
 */
function playAlarm(settings: AlarmSettings): void {
  const sound = audio();
  if (sound === null) {
    return;
  }
  const { ctx, out, reverb } = sound;
  const now = ctx.currentTime + 0.02;
  const [from, peak, to] = settings.filter;
  for (let pulse = 0; pulse < settings.pulses; pulse += 1) {
    const start = now + pulse * (settings.pulseS + settings.gapS);
    const end = start + settings.pulseS;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = settings.q;
    filter.frequency.setValueAtTime(from, start);
    filter.frequency.exponentialRampToValueAtTime(peak, start + settings.peakS);
    filter.frequency.exponentialRampToValueAtTime(to, end);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(settings.volume, start + 0.025);
    gain.gain.setValueAtTime(settings.volume, end - 0.07);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    let input: AudioNode = filter;
    if (settings.grit !== undefined) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = distortion(settings.grit);
      filter.connect(shaper);
      input = shaper;
    }
    input.connect(gain);
    gain.connect(out);
    const send = ctx.createGain();
    send.gain.value = settings.reverb;
    gain.connect(send).connect(reverb);

    for (const [type, ratio] of settings.waves) {
      const pitch = settings.pitch * ratio;
      const oscillator = ctx.createOscillator();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(pitch, start);
      oscillator.frequency.setValueAtTime(pitch, end - 0.1);
      oscillator.frequency.exponentialRampToValueAtTime(pitch * (1 - settings.sag), end);
      // Quieter layers when there are more of them, so every alarm is about as loud as one of two layers.
      const level = ctx.createGain();
      level.gain.value = Math.SQRT2 / Math.sqrt(settings.waves.length);
      oscillator.connect(level).connect(filter);
      oscillator.start(start);
      oscillator.stop(end + 0.05);
    }
  }
}

/** The klaxon for a threshold check. */
export function playThresholdAlarm(): void {
  playAlarm(THRESHOLD_ALARM);
}

// ----- Interface -----

/** A quiet tick for button presses. */
export function playClick(): void {
  const a = audio();
  if (a === null) {
    return;
  }
  const now = a.ctx.currentTime;
  tone(a.ctx, a.out, now, 0.035, 0.05, 'triangle', 1900, 1500);
}

/** A short blip when a weapon is chosen (rising) or held back (falling). */
export function playSelect(chosen: boolean): void {
  const a = audio();
  if (a === null) {
    return;
  }
  const now = a.ctx.currentTime;
  tone(a.ctx, a.out, now, 0.08, 0.08, 'sine', chosen ? 700 : 1200, chosen ? 1200 : 700);
}

/** A soft two-note chime when a new phase is announced. */
export function playChime(): void {
  const a = audio();
  if (a === null) {
    return;
  }
  const now = a.ctx.currentTime;
  tone(a.ctx, a.out, now, 0.9, 0.09, 'sine', 659.3, 659.3, 0.02);
  tone(a.ctx, a.out, now, 0.9, 0.025, 'sine', 1318.5, 1318.5, 0.02);
  tone(a.ctx, a.out, now + 0.14, 1.1, 0.09, 'sine', 987.8, 987.8, 0.02);
  tone(a.ctx, a.out, now + 0.14, 1.1, 0.02, 'sine', 1975.5, 1975.5, 0.02);
}

/**
 * A bright, rising two-note ping for a system that passes its threshold check:
 * a fifth up, with a little shimmer and reverb.
 */
export function playSystemOk(): void {
  const a = audio();
  if (a === null) {
    return;
  }
  const now = a.ctx.currentTime;
  for (const [delay, pitch] of [
    [0, 1318.5],
    [0.07, 1975.5],
  ] as const) {
    tone(a.ctx, a.out, now + delay, 0.45, 0.075, 'sine', pitch, pitch, 0.004);
    tone(a.ctx, a.out, now + delay, 0.25, 0.018, 'triangle', pitch * 2, pitch * 2, 0.004);
    tone(a.ctx, a.reverb, now + delay, 0.45, 0.03, 'sine', pitch, pitch, 0.004);
  }
}

// ----- Dice -----

/** Dice rattling in the hand and across the table, for `durationMs`. */
export function playDiceRattle(durationMs: number, dice: number): void {
  const a = audio();
  if (a === null) {
    return;
  }
  const start = a.ctx.currentTime;
  const end = start + durationMs / 1000;
  // More dice, more clatter.
  const density = Math.min(3, 1 + dice * 0.25);
  let at = start;
  while (at < end) {
    const peak = 0.05 + Math.random() * 0.08;
    noiseBurst(a.ctx, a.out, at, 0.018 + Math.random() * 0.015, peak, {
      type: 'bandpass',
      from: 2200 + Math.random() * 2600,
      q: 3,
    });
    at += (0.025 + Math.random() * 0.05) / density;
  }
}

/** One die landing on the table. */
export function playDieLand(): void {
  const a = audio();
  if (a === null) {
    return;
  }
  const now = a.ctx.currentTime;
  noiseBurst(a.ctx, a.out, now, 0.05, 0.22, { type: 'bandpass', from: 1600 + Math.random() * 800, q: 2 });
  tone(a.ctx, a.out, now, 0.07, 0.12, 'sine', 240 + Math.random() * 60, 140);
}

// ----- Weapons and damage -----

const distortionCurves = new Map<number, Float32Array<ArrayBuffer>>();

/** A soft-clipping curve for a wave shaper; higher amounts are grittier. */
function distortion(amount: number): Float32Array<ArrayBuffer> {
  let curve = distortionCurves.get(amount);
  if (curve === undefined) {
    curve = new Float32Array(1024);
    for (let index = 0; index < curve.length; index += 1) {
      const x = (index / (curve.length - 1)) * 2 - 1;
      curve[index] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
    }
    distortionCurves.set(amount, curve);
  }
  return curve;
}

/** How long a beam of this class sounds, in seconds, not counting its reverb tail. */
function beamDuration(beamClass: number): number {
  return 0.7 + Math.max(1, Math.min(3, beamClass)) * 0.15;
}

/**
 * A beam weapon firing, in the style of a sci-fi phaser: a buzzing energy
 * whine that zings in, sags in pitch as it holds, and fades into a big
 * reverb. A phaser effect (a chain of swept all-pass filters) makes it swirl.
 * Bigger classes are deeper, louder, longer and carry more low end.
 * `delay` is in seconds from now.
 */
export function playBeam(beamClass: number, delay = 0): void {
  const a = audio();
  if (a === null) {
    return;
  }
  const { ctx } = a;
  const size = Math.max(1, Math.min(3, beamClass));
  const start = ctx.currentTime + delay;
  const duration = beamDuration(size);
  const end = start + duration;
  const pitch = [0, 528, 400, 304][size]!;
  const loudness = 0.13 + size * 0.07;

  // Everything goes to one bus, heard both dry and through the reverb.
  const bus = ctx.createGain();
  bus.connect(a.out);
  const send = ctx.createGain();
  send.gain.value = 0.45 + size * 0.12;
  bus.connect(send).connect(a.reverb);

  // Held at full strength, then fading over the last part.
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(loudness, start + 0.012);
  amp.gain.exponentialRampToValueAtTime(loudness * 0.75, start + duration * 0.55);
  amp.gain.exponentialRampToValueAtTime(0.0001, end);
  amp.connect(bus);

  // Tone: soft grit, then a low-pass that closes as the beam fades.
  const shaper = ctx.createWaveShaper();
  shaper.curve = distortion(3 + size * 3);
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.Q.value = 1.5;
  lowpass.frequency.setValueAtTime(6500 - size * 1200, start);
  lowpass.frequency.exponentialRampToValueAtTime(1400 - size * 250, end);
  shaper.connect(lowpass).connect(amp);

  // Phaser: the dry signal plus a copy through swept all-pass filters, so
  // moving notches swirl through the sound.
  const phaserIn = ctx.createGain();
  phaserIn.connect(shaper);
  const sweep = ctx.createOscillator();
  sweep.frequency.value = 5.5 - size;
  const sweepDepth = ctx.createGain();
  sweepDepth.gain.value = 900;
  sweep.connect(sweepDepth);
  let stage: AudioNode = phaserIn;
  for (let index = 0; index < 6; index += 1) {
    const allpass = ctx.createBiquadFilter();
    allpass.type = 'allpass';
    allpass.frequency.value = 1300;
    allpass.Q.value = 0.6;
    sweepDepth.connect(allpass.frequency);
    stage.connect(allpass);
    stage = allpass;
  }
  stage.connect(shaper);

  // The buzz: a fast square wave wobbling the pitch of every voice.
  const buzz = ctx.createOscillator();
  buzz.type = 'square';
  buzz.frequency.value = [0, 74, 58, 44][size]!;
  const buzzDepth = ctx.createGain();
  buzzDepth.gain.value = pitch * 0.09;
  buzz.connect(buzzDepth);

  const oscillators: OscillatorNode[] = [buzz, sweep];
  for (const [type, multiple, detune, level] of [
    ['sawtooth', 1, 0, 0.5],
    ['sawtooth', 1, 14, 0.5],
    ['square', 0.5, -6, 0.35 + size * 0.1],
    ['sine', 3.01, 0, 0.18],
  ] as const) {
    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.detune.value = detune;
    // Zings in from above, settles, then sags as the beam drains.
    oscillator.frequency.setValueAtTime(pitch * multiple * 1.6, start);
    oscillator.frequency.exponentialRampToValueAtTime(pitch * multiple, start + 0.07);
    oscillator.frequency.exponentialRampToValueAtTime(pitch * multiple * 0.8, end);
    buzzDepth.connect(oscillator.frequency);
    const gain = ctx.createGain();
    gain.gain.value = level;
    oscillator.connect(gain).connect(phaserIn);
    oscillators.push(oscillator);
  }
  for (const oscillator of oscillators) {
    oscillator.start(start);
    oscillator.stop(end + 0.05);
  }

  // A low thump under the bigger beams.
  tone(ctx, bus, start, duration * 0.6, loudness * (0.2 + size * 0.25), 'sine', pitch / 3, pitch / 7, 0.006);
  // The crack as the beam lets go.
  noiseBurst(ctx, bus, start, 0.07 + size * 0.02, loudness * 0.6, { type: 'bandpass', from: 4200, to: 900, q: 1.2 });
  // A thin sizzle of energy along the beam.
  noiseBurst(ctx, bus, start, duration, loudness * 0.12, { type: 'highpass', from: 5000 });
}

// ----- Recorded sounds -----

const samples = new Map<string, Promise<AudioBuffer | null>>();

/** Fetches and decodes a recorded sound once; later calls share the result. Null if it can't be loaded. */
function loadSample(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
  let sample = samples.get(url);
  if (sample === undefined) {
    sample = fetch(url)
      .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(`${response.status} ${url}`))))
      .then((data) => ctx.decodeAudioData(data))
      .catch((error: unknown) => {
        console.warn('Could not load sound', url, error);
        samples.delete(url);
        return null;
      });
    samples.set(url, sample);
  }
  return sample;
}

export interface SampleOptions {
  /** 0 to 1 and beyond; 1 plays it as recorded. */
  volume?: number;
  /** Repeat until stopped. */
  loop?: boolean;
  /** Seconds to fade in over, rather than starting at full volume. */
  fadeIn?: number;
}

/**
 * Plays a recorded sound file. It loads on first use, so the first play may
 * start a moment late. Returns a function that fades it out and stops it.
 */
export function playSample(url: string, options: SampleOptions = {}): () => void {
  const a = audio();
  if (a === null) {
    return () => undefined;
  }
  const { ctx } = a;
  let stopped = false;
  let stopNow: (() => void) | null = null;
  void loadSample(ctx, url).then((buffer) => {
    if (buffer === null || stopped) {
      return;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = options.loop ?? false;
    const gain = ctx.createGain();
    const volume = options.volume ?? 1;
    if (options.fadeIn) {
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + options.fadeIn);
    } else {
      gain.gain.value = volume;
    }
    source.connect(gain).connect(a.out);
    source.start();
    stopNow = () => {
      const at = ctx.currentTime;
      gain.gain.cancelScheduledValues(at);
      gain.gain.setValueAtTime(gain.gain.value, at);
      gain.gain.linearRampToValueAtTime(0, at + 0.3);
      source.stop(at + 0.35);
    };
  });
  return () => {
    stopped = true;
    stopNow?.();
  };
}

// ----- Damage and movement -----

/** Recorded sounds from Kenney's Sci-Fi Sounds pack (CC0); see the README's credits. */
const SOUNDS_URL = `${import.meta.env.BASE_URL}sounds/kenney/`;
const HULL_HIT_SOUND = `${SOUNDS_URL}explosionCrunch_000.ogg`;
const SHIP_DESTROYED_SOUND = `${SOUNDS_URL}explosionCrunch_004.ogg`;
const ENGINE_SOUND = `${SOUNDS_URL}thrusterFire_001.ogg`;
/** A pulse torpedo launching: Laser 2 from Kenney's Digital SFX Set. */
const TORPEDO_SOUND = `${import.meta.env.BASE_URL}sounds/kenney-digital/laser2.mp3`;
/**
 * Half as loud again as recorded. The limiter on the output still holds
 * the loudest peaks down, so the gain shows most in the body of the blast.
 */
const SHIP_DESTROYED_VOLUME = 1.5;

/** Starts loading the recorded sounds, so the first of each plays on time. */
function preloadSounds(): void {
  if (context === null) {
    return;
  }
  for (const url of [HULL_HIT_SOUND, SHIP_DESTROYED_SOUND, ENGINE_SOUND, TORPEDO_SOUND]) {
    void loadSample(context, url);
  }
}

/** A pulse torpedo launching. */
export function playTorpedo(): void {
  playSample(TORPEDO_SOUND);
}

/** One hull box taking damage: a short explosive crunch. */
export function playHullHit(): void {
  playSample(HULL_HIT_SOUND);
}

/** A ship blowing up: a long explosive crunch. */
export function playExplosion(): void {
  playSample(SHIP_DESTROYED_SOUND, { volume: SHIP_DESTROYED_VOLUME });
}

let stopEngine: (() => void) | null = null;

/** Starts or stops the thruster sound played while ships move. It fades in and out. */
export function setEngineSound(running: boolean): void {
  if (!running) {
    stopEngine?.();
    stopEngine = null;
    return;
  }
  if (stopEngine === null && audio() !== null) {
    stopEngine = playSample(ENGINE_SOUND, { loop: true, fadeIn: 0.4 });
  }
}
