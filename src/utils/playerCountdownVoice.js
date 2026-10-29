import { getAudioContext, primeFeedbackAudio } from './feedback';

const languages = new Set(['fr', 'en', 'de', 'es', 'it', 'ru', 'ar']);
const clips = new Map();
let generation = 0;
let sources = [];
const languageKey = language => {
  const key = String(language).toLowerCase().split(/[-_]/)[0];
  return languages.has(key) ? key : 'fr';
};

// Decode ahead of time; playback never waits for browser speech synthesis.
export function preloadCountdownVoice(language = 'fr') {
  const lang = languageKey(language);
  if (!clips.has(lang)) {
    const request = (async () => {
      const context = getAudioContext();
      if (!context) return null;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        return await Promise.all([3, 2, 1].map(async number => {
          const response = await fetch(`/audio/countdown/${lang}-${number}.wav`, { signal: controller.signal });
          if (!response.ok) throw new Error('countdown-audio-unavailable');
          return context.decodeAudioData(await response.arrayBuffer());
        }));
      } finally { clearTimeout(timeout); }
    })().catch(() => { clips.delete(lang); return null; });
    clips.set(lang, request);
  }
  return clips.get(lang);
}

export function stopCountdownVoice() {
  generation++;
  sources.forEach(source => {
    try { source.stop(); source.disconnect(); } catch { /* Already ended. */ }
  });
  sources = [];
}

// Schedule all three numbers on the audio clock, independent of React renders
// and JavaScript timer jitter. A pause/new timer invalidates pending downloads.
export async function scheduleCountdownVoice(targetAt, language = 'fr') {
  stopCountdownVoice();
  const current = generation;
  const [buffers, ready] = await Promise.all([preloadCountdownVoice(language), primeFeedbackAudio()]);
  if (current !== generation || !ready) return false;
  const context = getAudioContext();
  const wallNow = Date.now();
  const audioNow = context.currentTime;
  [3, 2, 1].forEach((number, index) => {
    const delay = (targetAt - number * 1000 - wallNow) / 1000;
    // Never queue a stale number after a slow load or return from background.
    if (delay < -0.15) return;
    const startAt = audioNow + Math.max(0, delay);
    let source;
    if (buffers) {
      source = context.createBufferSource();
      source.buffer = buffers[index];
      source.connect(context.destination);
      source.start(startAt);
    } else {
      // Offline/cache miss: retain precisely timed beeps instead of late speech.
      source = context.createOscillator();
      const gain = context.createGain();
      source.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.2, startAt + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.12);
      source.connect(gain); gain.connect(context.destination);
      source.start(startAt); source.stop(startAt + 0.13);
      source.onended = () => gain.disconnect();
    }
    sources.push(source);
  });
  return true;
}
