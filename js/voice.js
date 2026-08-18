// Reads a word back to a child who is stuck.
//
// Only voices the browser reports as local (voice.localService) are used, so
// this stays consistent with the rest of the game: no audio and no text goes to
// a network service. If the browser offers only network voices, the game stays
// silent rather than quietly phoning home.

const synth = window.speechSynthesis;

let voice = null;
let voiceChecked = false;
let quietUntil = 0;

function pickVoice() {
  if (!synth) return null;
  const voices = synth.getVoices().filter((candidate) => candidate.localService);
  if (!voices.length) return null;
  return voices.find((v) => /^en[-_]US/i.test(v.lang))
    || voices.find((v) => /^en/i.test(v.lang))
    || null; // a non-English voice would mispronounce the word
}

function refreshVoice() {
  voice = pickVoice();
  voiceChecked = true;
}

if (synth) {
  refreshVoice();
  synth.addEventListener?.('voiceschanged', refreshVoice);
}

export function localVoiceAvailable() {
  if (!voiceChecked) refreshVoice();
  return Boolean(voice);
}

// True while the game is talking. The recognizer stops accepting audio during
// this window so a spoken hint cannot credit itself.
export function selfSpeaking() {
  return performance.now() < quietUntil;
}

export function say(text, { rate = 0.8 } = {}) {
  const word = (text || '').replace(/[^A-Za-z'-]/g, '');
  if (!synth || !word) return;
  if (!localVoiceAvailable()) return;

  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.voice = voice;
  utterance.lang = voice.lang;
  utterance.rate = rate;
  utterance.pitch = 1.15;

  // Cover the gaps before onstart and after onend, which are unreliable.
  const estimate = 600 + (word.length / rate) * 90;
  quietUntil = performance.now() + estimate;
  utterance.onstart = () => { quietUntil = performance.now() + estimate; };
  utterance.onend = () => { quietUntil = performance.now() + 350; };
  utterance.onerror = () => { quietUntil = 0; };

  synth.speak(utterance);
}
