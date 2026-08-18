// Game rules: read the sentence aloud, each correct word puffs the balloon up.

import { matches, isFiller, isFunctionWord } from './matcher.js';
import { LEVELS, levelAt, pickSentence, CUSTOM_INDEX } from './sentences.js';
import { say } from './voice.js';

const SENTENCES_PER_LEVEL = 4;
const HINT_DELAY = 5.5;     // seconds stuck on a word before we read it aloud
const HINT_REPEAT = 6;
// No recognizer hears every child every time. Rather than let a word the
// microphone refuses to hear trap the child forever, the game reads it aloud
// twice and then gives it to them, marked as helped rather than read.
const HINTS_BEFORE_HELP = 2;
const HELP_DELAY = 5;

// Used when no store is supplied, so the game runs the same with nothing to
// remember (and so tests need not stub persistence).
const FORGETFUL = {
  noteWord() {},
  dueWords() { return new Set(); },
  endSession() {},
};

export class Game {
  constructor(scene, ui, store = FORGETFUL) {
    this.scene = scene;
    this.ui = ui;
    this.store = store;
    this.running = false;
  }

  start({ levelIndex = 0, gentle = false, custom = [] } = {}) {
    this.levelIndex = levelIndex;
    this.custom = custom;
    this.sentenceIndex = 0;
    this.recent = [];          // the last few sentences, so none repeats at once
    this.startedAt = Date.now();
    this.completedThisLevel = 0;
    this.gentle = gentle;
    this.hearts = gentle ? 5 : 3;
    this.score = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.wordsRead = 0;
    this.wordsHelped = 0;
    this.sentencesDone = 0;
    this.running = true;
    this.applyLevel();
    this.loadSentence();
    this.ui.renderStats(this);
  }

  applyLevel() {
    const level = levelAt(this.levelIndex, this.custom);
    this.scene.sink = level.sink * (this.gentle ? 0.6 : 1);
    this.scene.lift = level.lift * (this.gentle ? 1.25 : 1);
    this.ui.setLevelName(level.name);
  }

  loadSentence() {
    // Prefer a sentence containing words the child has needed help with and that
    // are due for another go; otherwise carry on through the level in order.
    const text = pickSentence({
      levelIndex: this.levelIndex,
      custom: this.custom,
      dueWords: this.store.dueWords(),
      recent: this.recent,
      cursor: this.sentenceIndex,
    });
    if (!text) return;
    this.recent = [text, ...this.recent].slice(0, 3);
    this.words = text.split(/\s+/).map((word) => ({ text: word, state: 'pending' }));
    this.index = 0;
    this.sinceProgress = 0;
    this.hintsGiven = 0;
    this.transition = 0;
    this.scene.reset();
    this.scene.quiet = false;
    this.ui.renderSentence(this.words, this.index);
    this.ui.flashBanner(null);
    // The recognizer decodes against just this sentence's words.
    this.ui.onSentence?.(this.words.map((word) => word.text));
  }

  // --- input ------------------------------------------------------------

  // words: array of alternative-lists, one per spoken word, in spoken order.
  handleSpoken(spokenWords) {
    if (!this.running || this.transition > 0) return;

    for (const options of spokenWords) {
      const target = this.words[this.index];
      if (!target) return;

      if (options.some((option) => matches(option, target.text))) {
        this.acceptWord();
        continue;
      }

      const next = this.words[this.index + 1];
      if (next && options.some((option) => matches(option, next.text))) {
        // Child read past a word the microphone missed.
        if (isFunctionWord(target.text)) {
          this.acceptWord();
        } else {
          target.state = 'skipped';
          this.index += 1;
          this.streak = 0;
        }
        this.acceptWord();
        continue;
      }

      if (options.every(isFiller)) continue;
      this.nudgeUnlessFunctionWord(target);
    }
  }

  // Wiggling a word tells a child they got it wrong, so it must only happen when
  // they probably did. Recognizers are unreliable on unstressed function words:
  // a child who says "The" clearly, pausing after it, leaves the decoder a 100ms
  // schwa on its own, which comes back as some other word entirely. Saying
  // nothing is honest; saying "wrong" is not. The word is credited anyway as soon
  // as they read the next one.
  nudgeUnlessFunctionWord(target) {
    if (target && isFunctionWord(target.text)) return;
    this.ui.nudge();
  }

  // Speech the recognizer could not place at all.
  noteUnknown() {
    if (!this.running || this.transition > 0) return;
    this.nudgeUnlessFunctionWord(this.words[this.index]);
  }

  acceptWord({ helped = false } = {}) {
    const word = this.words[this.index];
    if (!word) return;
    word.state = helped ? 'helped' : 'read';
    this.index += 1;
    if (helped) {
      this.wordsHelped += 1;
      this.streak = 0;
    } else {
      this.wordsRead += 1;
      this.streak += 1;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      this.score += 10 + Math.min(this.streak, 10);
    }
    this.sinceProgress = 0;
    this.hintsGiven = 0;

    this.store.noteWord(word.text, { helped });

    // Longer words are harder, so they lift a little more. A helped word lifts
    // less: it keeps the balloon flying without rewarding it as a read word.
    const power = (1 + Math.min(word.text.length, 10) * 0.035) * (helped ? 0.6 : 1);
    this.scene.puff(power);
    this.scene.quiet = false;
    this.scene.cheer(helped ? 0.5 : 1);
    this.ui.renderSentence(this.words, this.index);
    this.ui.renderStats(this);

    if (this.index >= this.words.length) this.finishSentence();
  }

  // Parent/teacher override, and the fallback when speech is unavailable.
  creditCurrentWord() {
    if (this.running && this.transition <= 0) this.acceptWord();
  }

  finishSentence() {
    this.transition = 2.0;
    this.sentencesDone += 1;
    this.completedThisLevel += 1;
    this.score += 50;
    this.scene.escape();
    this.scene.cheer(2.6);
    this.ui.renderStats(this);

    const levellingUp = this.levelIndex !== CUSTOM_INDEX
      && this.completedThisLevel >= SENTENCES_PER_LEVEL
      && this.levelIndex < LEVELS.length - 1;
    this.ui.flashBanner(levellingUp ? 'Level up!' : 'Nice reading!');
    this.pendingLevelUp = levellingUp;
  }

  advance() {
    if (this.pendingLevelUp) {
      this.levelIndex += 1;
      this.completedThisLevel = 0;
      this.pendingLevelUp = false;
      this.applyLevel();
    }
    this.sentenceIndex += 1;
    this.loadSentence();
  }

  landed() {
    this.hearts -= 1;
    this.streak = 0;
    this.ui.renderStats(this);
    if (this.hearts <= 0) {
      this.running = false;
      this.recordSession();
      this.ui.showGameOver(this);
      return;
    }
    this.ui.flashBanner('Try that sentence again!');
    this.transition = 1.6;
    this.retryPending = true;
  }

  // Kept for the grown-up's progress screen.
  recordSession() {
    this.store.endSession({
      seconds: Math.round((Date.now() - this.startedAt) / 1000),
      level: this.levelIndex === CUSTOM_INDEX ? 'own' : this.levelIndex + 1,
      gentle: this.gentle,
      sentencesDone: this.sentencesDone,
      wordsRead: this.wordsRead,
      wordsHelped: this.wordsHelped,
      bestStreak: this.bestStreak,
      score: this.score,
    });
  }

  update(dt) {
    if (!this.running) return;

    if (this.transition > 0) {
      this.transition -= dt;
      if (this.transition <= 0) {
        if (this.retryPending) {
          this.retryPending = false;
          this.loadSentence();
        } else {
          this.advance();
        }
      }
      return;
    }

    if (this.scene.grounded) {
      this.landed();
      return;
    }

    // Stuck on a word: read it aloud so the child can try again, and if the
    // microphone still will not hear it, hand it over rather than trap them.
    this.sinceProgress += dt;

    if (this.hintsGiven >= HINTS_BEFORE_HELP
        && this.sinceProgress > HINT_DELAY + (HINTS_BEFORE_HELP - 1) * HINT_REPEAT + HELP_DELAY) {
      this.acceptWord({ helped: true });
      return;
    }

    const due = HINT_DELAY + this.hintsGiven * HINT_REPEAT;
    if (this.sinceProgress > due && this.hintsGiven < HINTS_BEFORE_HELP) {
      this.hintsGiven += 1;
      this.scene.quiet = true;
      const word = this.words[this.index];
      if (word) {
        this.ui.highlightHint();
        say(word.text);
      }
    }
  }
}
