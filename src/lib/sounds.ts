let _ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!_ctx) {
      _ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    if (_ctx.state === 'suspended') _ctx.resume().catch(() => {});
    return _ctx;
  } catch {
    return null;
  }
}

function osc(
  c: AudioContext,
  freq: number,
  startAt: number,
  duration: number,
  vol: number,
  type: OscillatorType = 'sine',
) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, startAt);
  g.gain.linearRampToValueAtTime(vol, startAt + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  o.connect(g);
  g.connect(c.destination);
  o.start(startAt);
  o.stop(startAt + duration + 0.01);
}

function burst(
  c: AudioContext,
  startAt: number,
  duration: number,
  vol: number,
  hpFreq = 2000,
) {
  const bufSize = Math.ceil(c.sampleRate * duration);
  const buf = c.createBuffer(1, bufSize, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = hpFreq;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, startAt);
  g.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  src.connect(hp);
  hp.connect(g);
  g.connect(c.destination);
  src.start(startAt);
}

export function playMove() {
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime;
  burst(c, t, 0.06, 0.12, 2800);
  osc(c, 480, t, 0.06, 0.07);
}

export function playCapture() {
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime;
  burst(c, t, 0.1, 0.2, 1200);
  osc(c, 260, t, 0.09, 0.1, 'triangle');
}

export function playCorrect() {
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime;
  osc(c, 523, t, 0.14, 0.09);        // C5
  osc(c, 659, t + 0.1, 0.14, 0.09);  // E5
}

export function playWrong() {
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime;
  osc(c, 280, t, 0.18, 0.08, 'sawtooth');
  osc(c, 210, t + 0.1, 0.18, 0.06, 'sawtooth');
}

export function playComplete() {
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime;
  osc(c, 523, t, 0.18, 0.1);          // C5
  osc(c, 659, t + 0.13, 0.18, 0.1);   // E5
  osc(c, 784, t + 0.26, 0.28, 0.08);  // G5
}
