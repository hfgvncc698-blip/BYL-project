# Player countdown audio

Numbers 1–3, generated locally using macOS speech voices (Thomas, Samantha,
Anna, Mónica, Alice, Milena, Majed) at 210 words/minute. Mono PCM WAV, 24 kHz.
Leading/trailing silence trimmed with a small margin; peaks normalized to
28000/32768. Every clip is shorter than one second.

Loaded and decoded before countdown playback by playerCountdownVoice.js.
Web Audio schedules each number against the timer deadline, avoiding the
latency and cancellation behavior of live browser speech synthesis.
