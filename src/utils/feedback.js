// Signaux courts synthétisés avec Web Audio : aucun réseau, aucune latence de fichier.

export const PLAYER_FEEDBACK_CUES = Object.freeze({
  exerciseStart: {
    notes: [
      { frequency: 523.25, offsetMs: 0, durationMs: 110, gain: 0.72 },
      { frequency: 659.25, offsetMs: 85, durationMs: 120, gain: 0.78 },
      { frequency: 783.99, offsetMs: 175, durationMs: 190, gain: 0.88 },
    ],
    vibration: [35, 35, 65],
  },
  restStart: {
    notes: [
      { frequency: 659.25, offsetMs: 0, durationMs: 150, gain: 0.62 },
      { frequency: 440, offsetMs: 120, durationMs: 230, gain: 0.56 },
    ],
    vibration: [55],
  },
  restEnding: {
    notes: [
      { frequency: 880, offsetMs: 0, durationMs: 70, gain: 0.38 },
      { frequency: 880, offsetMs: 125, durationMs: 70, gain: 0.38 },
    ],
    vibration: [22, 70, 22],
  },
  setComplete: {
    notes: [
      { frequency: 783.99, offsetMs: 0, durationMs: 85, gain: 0.52 },
      { frequency: 1046.5, offsetMs: 70, durationMs: 130, gain: 0.64 },
    ],
    vibration: [35],
  },
  roundComplete: {
    notes: [
      { frequency: 587.33, offsetMs: 0, durationMs: 110, gain: 0.58 },
      { frequency: 783.99, offsetMs: 90, durationMs: 130, gain: 0.66 },
      { frequency: 987.77, offsetMs: 190, durationMs: 210, gain: 0.74 },
    ],
    vibration: [40, 35, 75],
  },
  workoutComplete: {
    notes: [
      { frequency: 523.25, offsetMs: 0, durationMs: 150, gain: 0.65 },
      { frequency: 659.25, offsetMs: 105, durationMs: 160, gain: 0.7 },
      { frequency: 783.99, offsetMs: 215, durationMs: 180, gain: 0.76 },
      { frequency: 1046.5, offsetMs: 340, durationMs: 270, gain: 0.88 },
      { frequency: 1318.51, offsetMs: 500, durationMs: 320, gain: 0.68 },
    ],
    vibration: [60, 45, 60, 45, 110],
  },
  personalRecord: {
    notes: [
      { frequency: 659.25, offsetMs: 0, durationMs: 125, gain: 0.62 },
      { frequency: 830.61, offsetMs: 80, durationMs: 145, gain: 0.68 },
      { frequency: 987.77, offsetMs: 165, durationMs: 170, gain: 0.74 },
      { frequency: 1318.51, offsetMs: 270, durationMs: 260, gain: 0.86 },
      { frequency: 1567.98, offsetMs: 430, durationMs: 330, gain: 0.62 },
    ],
    vibration: [45, 35, 45, 35, 45, 55, 120],
  },
});

let sharedAudioContext = null;
let activeOscillators = [];

export function getVibrationFeedbackAvailability() {
  if (typeof window === "undefined" || typeof window.navigator === "undefined") {
    return { supported: false, apiAvailable: false, mobileDevice: false };
  }
  const nav = window.navigator;
  const apiAvailable = typeof nav.vibrate === "function";
  const userAgent = String(nav.userAgent || "");
  const mobileDevice = /Android/i.test(userAgent) || nav.userAgentData?.mobile === true;
  return {
    supported: apiAvailable && mobileDevice,
    apiAvailable,
    mobileDevice,
  };
}

export function triggerFeedbackVibration(pattern) {
  const availability = getVibrationFeedbackAvailability();
  if (!availability.supported) return false;
  try {
    return window.navigator.vibrate(pattern) !== false;
  } catch {
    return false;
  }
}

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!sharedAudioContext || sharedAudioContext.state === "closed") {
    sharedAudioContext = new AudioContextClass();
  }
  return sharedAudioContext;
}

function stopActiveCue() {
  activeOscillators.forEach((oscillator) => {
    try {
      oscillator.stop();
    } catch {}
  });
  activeOscillators = [];
}

export async function primeFeedbackAudio() {
  try {
    const context = getAudioContext();
    if (!context) return false;
    if (context.state === "suspended") await context.resume();
    return context.state === "running";
  } catch {
    return false;
  }
}

export async function playFeedback(
  cueName = "setComplete",
  { soundEnabled = true, hapticsEnabled = true, volume = 1 } = {}
) {
  const cue = PLAYER_FEEDBACK_CUES[cueName] || PLAYER_FEEDBACK_CUES.setComplete;

  if (hapticsEnabled) triggerFeedbackVibration(cue.vibration);

  if (!soundEnabled) return false;

  try {
    const context = getAudioContext();
    if (!context) return false;
    if (context.state === "suspended") await context.resume();
    if (context.state !== "running") return false;

    stopActiveCue();

    const now = context.currentTime + 0.012;
    const master = context.createGain();
    master.gain.setValueAtTime(Math.max(0, Math.min(Number(volume) || 0, 1)) * 0.22, now);
    master.connect(context.destination);

    const oscillators = cue.notes.map((note) => {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      const startAt = now + note.offsetMs / 1000;
      const endAt = startAt + note.durationMs / 1000;
      const peak = Math.max(0.0001, Math.min(note.gain || 0.7, 1));

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(note.frequency, startAt);
      envelope.gain.setValueAtTime(0.0001, startAt);
      envelope.gain.exponentialRampToValueAtTime(peak, startAt + 0.018);
      envelope.gain.exponentialRampToValueAtTime(0.0001, endAt);
      oscillator.connect(envelope);
      envelope.connect(master);
      oscillator.start(startAt);
      oscillator.stop(endAt + 0.02);
      oscillator.onended = () => {
        activeOscillators = activeOscillators.filter((item) => item !== oscillator);
        try {
          oscillator.disconnect();
          envelope.disconnect();
        } catch {}
      };
      return oscillator;
    });

    activeOscillators = oscillators;
    const cueEndMs = Math.max(...cue.notes.map((note) => note.offsetMs + note.durationMs));
    window.setTimeout(() => {
      try {
        master.disconnect();
      } catch {}
    }, cueEndMs + 120);
    return true;
  } catch {
    return false;
  }
}
