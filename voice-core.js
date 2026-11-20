// Voice shaping for My Voice (milestone M3). Pure maths, no audio, so node tests run it.
//
// Child-like pitch with no extra download: Kokoro is asked to speak a little slower,
// then the audio is played a little faster. Playing faster raises the pitch and the
// formants together (a smaller-sounding voice) and the two speed changes cancel, so
// the words take the same time as before.
//
// Expressive voice: the message's own words nudge rate and pitch. "Yay!" comes out a
// bit brighter, "I'm sad" a bit lower and slower. The nudges are small on purpose.

// Kokoro v1.0 voices. The last four are lighter voices that suit a child or teen.
export const VOICES = [
  ["af_heart", "Heart, American English"], ["af_bella", "Bella, American English"], ["am_michael", "Michael, American English"],
  ["bf_emma", "Emma, British English"], ["bm_george", "George, British English"],
  ["af_sky", "Sky, American English (lighter)"], ["af_nicole", "Nicole, American English (soft)"],
  ["am_puck", "Puck, American English (younger)"], ["bf_isabella", "Isabella, British English (lighter)"],
];

export const PITCH_STEPS = [0, 1, 2, 3, 4]; // semitones offered in settings
export const factor = (semitones) => 2 ** (Number(semitones || 0) / 12);

const MOODS = [
  { re: /!|\b(yay|yes|wow|love|happy|excited|fun|great|cool|awesome|my turn)\b/i, st: 1, rate: 1.06, mood: "bright" },
  { re: /\b(sad|tired|sorry|hurts?|sick|scared|lonely|miss|cry|ouch)\b/i, st: -1, rate: 0.9, mood: "soft" },
  { re: /\b(stop|no|don't|not|go away|leave me)\b/i, st: 0, rate: 0.94, mood: "firm" },
];
// How the words should sound. Returns semitone and rate nudges, and a name for tests.
export function prosody(text, { expressive = true } = {}) {
  if (!expressive) return { st: 0, rate: 1, mood: "plain" };
  const m = MOODS.find((x) => x.re.test(String(text || "")));
  return m ? { st: m.st, rate: m.rate, mood: m.mood } : { st: 0, rate: 1, mood: "plain" };
}

// Everything the player needs. speed is the user's rate setting (1 = normal).
//  synthSpeed: what to ask Kokoro for; playbackRate: how fast to play the result;
//  devicePitch / deviceRate: for the device's own voices (SpeechSynthesisUtterance, pitch 0 to 2).
export function plan({ text = "", speed = 1, semitones = 0, expressive = true } = {}) {
  const p = prosody(text, { expressive });
  const st = Math.max(-4, Math.min(6, Number(semitones || 0) + p.st));
  const f = factor(st), rate = Math.max(0.5, Math.min(2, Number(speed || 1) * p.rate));
  return {
    mood: p.mood, semitones: st,
    synthSpeed: +(rate / f).toFixed(3), playbackRate: +f.toFixed(4),
    devicePitch: Math.max(0.1, Math.min(2, f)), deviceRate: rate,
  };
}
