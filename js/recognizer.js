// Local speech recognition, using Vosk (Kaldi compiled to WebAssembly).
//
// Nothing leaves the machine. The acoustic model is served from this project's
// models/ folder, decoding happens in a Web Worker, and the microphone audio is
// never sent anywhere. There is no cloud service and no network call after the
// one-time model download.
//
// The trick that makes this work for children: a reading game already knows
// which words the child is supposed to say, so each sentence is decoded against
// a grammar built from just those words plus "[unk]" for anything else. A
// general recognizer has to choose between every word in English and does badly
// on young voices; this one only has to tell a handful of words apart.

import { selfSpeaking } from './voice.js';
import { DECOY_WORDS } from './decoys.js';
import { editDistance } from './matcher.js';

const MODEL_URL = 'models/vosk-model-small-en-us-0.15.tar.gz';

// Vosk reports out-of-grammar speech as this token.
const UNKNOWN = '[unk]';

// How many times the sentence's own words, and the whole sentence as one phrase,
// are repeated in the grammar relative to the decoys. Tuned against recorded
// speech in tests/speech.test.mjs.
// Weighted higher and the decoder starts force-fitting the sentence onto noise:
// at 6 it emitted "the sun" while completely unrelated speech was playing.
const TARGET_WEIGHT = 4;
const PHRASE_WEIGHT = 3;

function grammarWords(words) {
  const cleaned = words
    .map((word) => word.toLowerCase().replace(/[^a-z']/g, ''))
    .filter(Boolean);
  return [...new Set(cleaned)];
}

// Decoys exist to catch wrong speech, but one that sounds like a word in the
// sentence does the opposite: it steals a correct reading. "so" and "saw" would
// both swallow "the sun", and "the" read with a schwa lands on "saw" rather than
// on "the". Anything within two edits of a target word is dropped, which is a
// coarse stand-in for phonetic similarity but catches the cases that matter:
// short words differing by a vowel or a final consonant.
function usefulDecoys(vocabulary) {
  return DECOY_WORDS.filter((decoy) => {
    if (vocabulary.includes(decoy)) return false;
    return !vocabulary.some((target) => editDistance(decoy, target) <= 2);
  });
}

export class Recognizer {
  constructor({ onWords, onUnknown, onStatus, onProgress, onLevel, onError, onRaw } = {}) {
    this.onWords = onWords || (() => {});
    this.onRaw = onRaw || (() => {}); // raw transcripts, for the diagnostics panel
    this.onUnknown = onUnknown || (() => {});
    this.onStatus = onStatus || (() => {});
    this.onProgress = onProgress || (() => {});
    this.onLevel = onLevel || (() => {});
    this.onError = onError || (() => {});

    this.model = null;
    this.kaldi = null;
    this.stream = null;
    this.audioContext = null;
    this.enabled = false;
    // High-water mark of words credited in the current utterance. It never moves
    // backwards: Vosk can re-hypothesise a partial into something SHORTER, and
    // counting down would re-emit words when it grows again, crediting a word
    // the child never said.
    this.credited = 0;
    this.sampleRate = 16000;
    this.grammarFailed = false;
  }

  get ready() {
    return Boolean(this.model);
  }

  // Downloads and unpacks the model. Reports progress so a child is not staring
  // at a dead screen for 40MB.
  async load() {
    if (this.model) return;
    if (!window.Vosk) throw new Error('vendor/vosk.js did not load');

    this.onStatus('loading');
    let modelSource = MODEL_URL;

    // Fetch it ourselves to get a real progress bar, then hand Vosk a blob URL
    // so the bytes are not downloaded twice.
    try {
      const response = await fetch(MODEL_URL);
      if (!response.ok) throw new Error(`model fetch failed: ${response.status}`);
      const total = Number(response.headers.get('content-length')) || 0;

      if (response.body) {
        const reader = response.body.getReader();
        const chunks = [];
        let loaded = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          loaded += value.length;
          this.onProgress(total ? loaded / total : null, loaded, total);
        }
        this.blobUrl = URL.createObjectURL(new Blob(chunks));
        modelSource = this.blobUrl;
      }
    } catch (error) {
      // Fall back to letting Vosk fetch the URL itself.
      this.onProgress(null, 0, 0);
      modelSource = MODEL_URL;
    }

    this.onStatus('unpacking');
    try {
      this.model = await window.Vosk.createModel(modelSource);
    } catch (error) {
      if (modelSource !== MODEL_URL) {
        // Some builds refuse blob URLs inside the worker; retry with the path.
        this.model = await window.Vosk.createModel(MODEL_URL);
      } else {
        throw error;
      }
    }
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }
  }

  // Opens the microphone. One stream feeds both the recognizer and the level
  // meter, so we never ask for the microphone twice.
  async listen() {
    if (this.stream) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser cannot open the microphone');
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioCtx();
    await this.audioContext.resume();
    this.sampleRate = this.audioContext.sampleRate;

    const source = this.audioContext.createMediaStreamSource(this.stream);
    const processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (event) => {
      const samples = event.inputBuffer.getChannelData(0);

      let sum = 0;
      for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
      this.onLevel(Math.sqrt(sum / samples.length));

      // Don't let the recognizer hear our own hint voice through the speakers.
      if (!this.enabled || !this.kaldi || selfSpeaking()) return;
      try {
        this.kaldi.acceptWaveform(event.inputBuffer);
      } catch (error) {
        this.onError(`audio: ${error.message}`);
      }
    };

    // A ScriptProcessorNode only runs while connected to the destination, so
    // route it through a silent gain rather than to the speakers.
    const silence = this.audioContext.createGain();
    silence.gain.value = 0;
    source.connect(processor);
    processor.connect(silence);
    silence.connect(this.audioContext.destination);

    this.processor = processor;
    this.onStatus('listening');
  }

  // Rebuilds the decoder for one sentence. Called every time a sentence loads.
  setTarget(words) {
    if (!this.model) return;

    const vocabulary = grammarWords(words);
    this.replaceKaldi(vocabulary, vocabulary.join(' '));
  }

  replaceKaldi(vocabulary, phrase = '') {
    if (this.kaldi) {
      try { this.kaldi.remove(); } catch { /* already gone */ }
      this.kaldi = null;
    }
    this.credited = 0;

    const build = (grammar) => {
      const kaldi = grammar
        ? new this.model.KaldiRecognizer(this.sampleRate, grammar)
        : new this.model.KaldiRecognizer(this.sampleRate);
      kaldi.setWords(true);
      kaldi.on('partialresult', (message) => this.handlePartial(message.result.partial));
      kaldi.on('result', (message) => this.handleFinal(message.result.text));
      kaldi.on('error', (message) => this.handleKaldiError(message, Boolean(grammar)));
      return kaldi;
    };

    if (vocabulary.length && !this.grammarFailed) {
      // "[unk]" gives out-of-grammar speech somewhere to go, and the decoys give
      // it somewhere plausible. Without both, the decoder forces unrelated
      // speech onto the target words and the balloon rises for words the child
      // never said. See js/decoys.js.
      const decoys = usefulDecoys(vocabulary);
      // Vosk estimates a small language model from this list, so what goes in it
      // decides what the decoder expects to hear.
      //
      // The sentence itself goes in as a whole phrase, several times over. That
      // is what teaches the decoder the ORDER of the words, and it matters more
      // than any per-word tuning: without it, one long decoy can swallow two
      // short target words ("the sun" decoded as "south"), because nothing tells
      // the decoder that "the" is followed by "sun" here. The individual words go
      // in too, so a child who stops mid-sentence or re-reads a word is still
      // understood, and the decoys go in to catch speech that is none of the above.
      const weighted = [];
      if (phrase) for (let i = 0; i < PHRASE_WEIGHT; i++) weighted.push(phrase);
      for (let i = 0; i < TARGET_WEIGHT; i++) weighted.push(...vocabulary);
      const grammar = JSON.stringify([...weighted, ...decoys, UNKNOWN]);
      try {
        this.kaldi = build(grammar);
        return;
      } catch (error) {
        this.grammarFailed = true;
        this.onError(`grammar rejected, using full vocabulary: ${error.message}`);
      }
    }
    this.kaldi = build(null);
  }

  handleKaldiError(message, hadGrammar) {
    const text = message?.error || String(message);
    if (hadGrammar && !this.grammarFailed) {
      // A word missing from the model's dictionary kills the grammar; fall back
      // to the full vocabulary rather than going deaf for that sentence.
      this.grammarFailed = true;
      this.onError(`grammar rejected, using full vocabulary: ${text}`);
      this.replaceKaldi([]);
      return;
    }
    this.onError(text);
  }

  // Vosk's partial results usually grow as the child speaks, so emit only the
  // new tail. A partial that comes back shorter is a re-hypothesis, not speech
  // being taken back: credit nothing and hold the mark where it is.
  handlePartial(text) {
    if (text) this.onRaw('partial', text);
    const tokens = this.tokens(text);
    if (tokens.length <= this.credited) return;
    this.emit(tokens.slice(this.credited));
    this.credited = tokens.length;
  }

  handleFinal(text) {
    this.onRaw('final', text || '(silence)');
    const tokens = this.tokens(text);
    this.emit(tokens.slice(this.credited));
    this.credited = 0; // the next utterance starts fresh

    if (tokens.unknowns) this.onUnknown(tokens.unknowns);
  }

  // Splits a transcript, keeping a count of the "[unk]" tokens it contained.
  tokens(text) {
    const raw = (text || '').trim().split(/\s+/).filter(Boolean);
    const words = raw.filter((word) => word !== UNKNOWN);
    words.unknowns = raw.length - words.length;
    return words;
  }

  emit(words) {
    if (!words.length) return;
    // Same shape the game expects: one array of alternatives per spoken word.
    this.onWords(words.map((word) => [word]));
  }

  setEnabled(value) {
    this.enabled = value;
    this.onStatus(value ? 'listening' : 'paused');
  }

  stop() {
    this.enabled = false;
    if (this.processor) this.processor.onaudioprocess = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.audioContext?.close().catch(() => {});
    this.audioContext = null;
    this.onLevel(0);
    this.onStatus('off');
  }
}
