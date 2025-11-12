// src/utils/feedback.js
// Petit bip en WebAudio : 0 CORS, 0 réseau, fonctionne offline.

export function playFeedback({
  frequency = 880,     // Hz
  durationMs = 160,    // durée
  attackMs = 10,
  releaseMs = 120,
  type = "sine",       // 'sine' | 'square' | 'sawtooth' | 'triangle'
} = {}) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);

    // enveloppe
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + attackMs / 1000);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + (durationMs + releaseMs) / 1000);

    // libère l’audio context
    osc.onended = () => {
      try { ctx.close(); } catch {}
    };
  } catch {}
}

