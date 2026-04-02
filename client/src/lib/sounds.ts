let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function playTone(freq: number, duration: number, type: OscillatorType = "sine", gain = 0.3) {
  try {
    const ac = getCtx();
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    g.gain.exponentialRampToValueAtTime(0.01, ac.currentTime + duration);
    osc.connect(g);
    g.connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + duration);
  } catch {
    // Audio not available
  }
}

function playSequence(notes: { freq: number; dur: number; delay: number }[], type: OscillatorType = "sine") {
  for (const n of notes) {
    setTimeout(() => playTone(n.freq, n.dur, type), n.delay);
  }
}

export function playBirdieSound() {
  playSequence([
    { freq: 880, dur: 0.15, delay: 0 },
    { freq: 1108, dur: 0.15, delay: 120 },
    { freq: 1318, dur: 0.3, delay: 240 },
  ]);
}

export function playEagleSound() {
  playSequence([
    { freq: 784, dur: 0.15, delay: 0 },
    { freq: 988, dur: 0.15, delay: 100 },
    { freq: 1318, dur: 0.15, delay: 200 },
    { freq: 1568, dur: 0.5, delay: 300 },
  ]);
}

export function playAlbatrossSound() {
  playSequence([
    { freq: 660, dur: 0.12, delay: 0 },
    { freq: 880, dur: 0.12, delay: 80 },
    { freq: 1108, dur: 0.12, delay: 160 },
    { freq: 1318, dur: 0.12, delay: 240 },
    { freq: 1568, dur: 0.12, delay: 320 },
    { freq: 1760, dur: 0.6, delay: 400 },
  ], "triangle");
}

export function playScoredSound() {
  playTone(600, 0.08, "sine", 0.15);
}

export function playScoreSound(gross: number, par: number) {
  const diff = gross - par;
  if (diff <= -3) playAlbatrossSound();
  else if (diff === -2) playEagleSound();
  else if (diff === -1) playBirdieSound();
  else playScoredSound();
}
