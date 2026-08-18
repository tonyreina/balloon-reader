// What the game remembers between sessions: which words a child found hard, the
// sentences a grown-up has added, a log of past sessions, and their settings.
//
// Everything is kept in this browser's localStorage. Nothing is uploaded, and
// "Forget everything" in the progress screen deletes it. If localStorage is
// unavailable — private browsing, or a locked-down browser — the game carries on
// with an in-memory copy for the session rather than breaking.

import { isFunctionWord, normalize } from './matcher.js';
import { unsafeWordsIn } from './safe-words.js';

const KEY = 'balloon-reader';
const VERSION = 1;
const MAX_SESSIONS = 120;

// How long a word rests before it is worth practising again. A child plays for a
// few minutes at a time, so the early steps are in minutes rather than days: a
// word missed at the start of a session should come back before the end of it.
const RESTS = [
  0,                  // just missed: due immediately
  2 * 60 * 1000,      // 2 minutes
  10 * 60 * 1000,     // 10 minutes
  24 * 60 * 60 * 1000,
  3 * 24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
];

const blank = () => ({
  version: VERSION,
  words: {},
  sessions: [],
  custom: [],
  settings: {},
});

function readStorage() {
  try {
    return window.localStorage;
  } catch {
    return null; // blocked entirely by the browser
  }
}

export class Store {
  constructor({ storage = readStorage(), now = () => Date.now() } = {}) {
    this.storage = storage;
    this.now = now;
    this.memory = null; // fallback when storage cannot be written
    this.data = this.read();
  }

  read() {
    try {
      const raw = this.storage?.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === VERSION) return { ...blank(), ...parsed };
      }
    } catch {
      // Corrupt or unreadable: start fresh rather than refuse to play.
    }
    return blank();
  }

  write() {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.data));
    } catch {
      this.memory = this.data; // out of quota or read-only; keep going in memory
    }
  }

  // --- settings ---------------------------------------------------------
  get settings() {
    return this.data.settings;
  }

  saveSettings(patch) {
    Object.assign(this.data.settings, patch);
    this.write();
  }

  // --- words a child found hard ----------------------------------------
  // Called for every word read. `helped` means the game had to give it away.
  noteWord(word, { helped = false } = {}) {
    const key = normalize(word);
    // Function words are skipped: a missed "the" is nearly always the microphone,
    // and practising it would teach the child nothing about their own reading.
    if (!key || isFunctionWord(key)) return;

    const now = this.now();
    const entry = this.data.words[key] || { strength: 0, dueAt: 0, seen: 0, helped: 0, lastSeen: 0 };
    entry.seen += 1;
    entry.lastSeen = now;

    if (helped) {
      entry.helped += 1;
      entry.strength = 0;
      entry.dueAt = now; // straight back into the queue
    } else {
      entry.strength = Math.min(entry.strength + 1, RESTS.length - 1);
      entry.dueAt = now + RESTS[entry.strength];
    }

    this.data.words[key] = entry;
    this.write();
  }

  // Words worth putting in front of the child again.
  dueWords() {
    const now = this.now();
    return new Set(
      Object.entries(this.data.words)
        .filter(([, entry]) => entry.helped > 0 && entry.dueAt <= now)
        .map(([word]) => word),
    );
  }

  // For the grown-up's progress screen: hardest first.
  wordsNeedingPractice(limit = 12) {
    return Object.entries(this.data.words)
      .filter(([, entry]) => entry.helped > 0)
      .sort((a, b) => (b[1].helped - a[1].helped) || (a[1].strength - b[1].strength))
      .slice(0, limit)
      .map(([word, entry]) => ({ word, ...entry }));
  }

  // --- sessions ---------------------------------------------------------
  endSession(stats) {
    this.data.sessions.push({ at: this.now(), ...stats });
    if (this.data.sessions.length > MAX_SESSIONS) {
      this.data.sessions = this.data.sessions.slice(-MAX_SESSIONS);
    }
    this.write();
  }

  get sessions() {
    return this.data.sessions;
  }

  // --- sentences a grown-up added ---------------------------------------
  get custom() {
    return this.data.custom;
  }

  saveCustom(sentences) {
    this.data.custom = sentences;
    this.write();
  }

  clearAll() {
    this.data = blank();
    try {
      this.storage?.removeItem(KEY);
    } catch {
      // Nothing more we can do; the blank object above is what the game now sees.
    }
  }
}

// Validates sentences typed in by a grown-up. Returns cleaned lines plus a
// problem for each line that cannot be used, so the message can name the line.
export function checkCustomSentences(text, { maxWords = 14 } = {}) {
  const problems = [];
  const sentences = [];

  const lines = String(text || '').split('\n').map((line) => line.trim()).filter(Boolean);
  for (const [index, line] of lines.entries()) {
    const at = `Line ${index + 1}`;
    if (/[0-9]/.test(line)) {
      problems.push(`${at}: write numbers as words ("three", not "3").`);
      continue;
    }
    // The game shows bare words, so punctuation would appear as part of a word.
    const cleaned = line.replace(/[.,!?;:"()]/g, '').replace(/\s+/g, ' ').trim();
    if (!/^[A-Za-z' -]+$/.test(cleaned)) {
      problems.push(`${at}: letters and apostrophes only.`);
      continue;
    }
    const count = cleaned.split(' ').length;
    if (count < 2) {
      problems.push(`${at}: needs at least two words.`);
      continue;
    }
    if (count > maxWords) {
      problems.push(`${at}: too long — ${count} words, keep it under ${maxWords}.`);
      continue;
    }
    // Until now only the characters were checked, never the meaning: a line could be
    // any words at all as long as it was spelled with letters. See js/safe-words.js.
    const unsafe = unsafeWordsIn(cleaned);
    if (unsafe.length) {
      problems.push(`${at}: not for a young reader — "${unsafe[0]}".`);
      continue;
    }
    sentences.push(cleaned);
  }

  return { sentences, problems };
}
