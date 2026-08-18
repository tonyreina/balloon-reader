// Wires the DOM, the local recognizer and the game loop together.

import { Scene } from './scene.js';
import { Game } from './game.js';
import { Recognizer } from './recognizer.js';
import { say, localVoiceAvailable } from './voice.js';

const $ = (selector) => document.querySelector(selector);

const els = {
  canvas: $('#sky'),
  sentence: $('#sentence'),
  hearts: $('#hearts'),
  score: $('#score'),
  levelName: $('#level-name'),
  banner: $('#banner'),
  micDot: $('#mic-dot'),
  micLabel: $('#mic-label'),
  micLevel: $('#mic-level'),
  startScreen: $('#start-screen'),
  overScreen: $('#over-screen'),
  overStats: $('#over-stats'),
  playBtn: $('#play-btn'),
  againBtn: $('#again-btn'),
  levelSelect: $('#level-select'),
  gentleToggle: $('#gentle-toggle'),
  pauseBtn: $('#pause-btn'),
  setup: $('#setup'),
  loading: $('#loading'),
  loadingLabel: $('#loading-label'),
  loadingBar: $('#loading-bar'),
  trouble: $('#trouble'),
  troubleText: $('#trouble-text'),
  debug: $('#debug'),
  debugLog: $('#debug-log'),
};

const ui = {
  renderSentence(words, current) {
    els.sentence.replaceChildren(...words.map((word, i) => {
      const span = document.createElement('button');
      span.type = 'button';
      span.className = `word ${word.state}${i === current ? ' current' : ''}`;
      span.textContent = word.text;
      span.title = 'Tap to hear this word';
      span.addEventListener('click', () => say(word.text));
      return span;
    }));
  },

  renderStats(game) {
    els.hearts.textContent = '❤'.repeat(Math.max(game.hearts, 0));
    els.score.textContent = String(game.score);
  },

  setLevelName(name) {
    els.levelName.textContent = name;
  },

  flashBanner(text) {
    els.banner.textContent = text || '';
    els.banner.classList.toggle('show', Boolean(text));
  },

  nudge() {
    const current = els.sentence.querySelector('.word.current');
    if (!current) return;
    current.classList.remove('nudge');
    void current.offsetWidth; // restart the animation
    current.classList.add('nudge');
  },

  highlightHint() {
    els.sentence.querySelector('.word.current')?.classList.add('hinted');
  },

  // Each new sentence retunes the recognizer to just those words.
  onSentence(words) {
    recognizer?.setTarget(words);
    debug(`listening for: ${words.join(' ')}`);
  },

  showGameOver(game) {
    els.overStats.innerHTML = `
      <div><strong>${game.score}</strong><span>points</span></div>
      <div><strong>${game.sentencesDone}</strong><span>sentences</span></div>
      <div><strong>${game.wordsRead}</strong><span>words read</span></div>
      <div><strong>${game.bestStreak}</strong><span>best streak</span></div>
      ${game.wordsHelped ? `<div><strong>${game.wordsHelped}</strong><span>needed help</span></div>` : ''}`;
    els.overScreen.hidden = false;
    recognizer?.setEnabled(false);
  },
};

const scene = new Scene(els.canvas);
const game = new Game(scene, ui);

let recognizer = null;
let paused = false;

// --- diagnostics --------------------------------------------------------
// Visible with ?debug in the URL or by pressing D. This is what turns "it just
// doesn't work" into a report someone can act on.
const debugOn = new URLSearchParams(location.search).has('debug');
const debugLines = [];
const debugHistory = []; // unbounded, read by tests/speech.test.mjs

function debug(line) {
  debugHistory.push(line);
  debugLines.push(line);
  if (debugLines.length > 14) debugLines.shift();
  els.debugLog.textContent = debugLines.join('\n');
}

function toggleDebug(force) {
  els.debug.hidden = force === undefined ? !els.debug.hidden : !force;
}
if (debugOn) toggleDebug(true);

function setMicStatus(status) {
  const labels = {
    listening: 'Listening',
    paused: 'Paused',
    loading: 'Getting ready',
    unpacking: 'Getting ready',
    off: 'Microphone off',
    error: 'Microphone problem',
  };
  els.micLabel.textContent = labels[status] || status;
  els.micDot.dataset.state = status;
  debug(`status: ${status}`);
}

// A problem the child cannot fix must be visible to the grown-up in the room,
// not hidden behind a small coloured dot.
function showTrouble(message, detail) {
  els.troubleText.innerHTML = message;
  els.trouble.hidden = false;
  if (detail) debug(detail);
  toggleDebug(true);
}

// --- loop ---------------------------------------------------------------
let lastFrame = performance.now();

function frame(now) {
  const dt = Math.min((now - lastFrame) / 1000, 1 / 20);
  lastFrame = now;
  if (!paused) {
    game.update(dt);
    scene.update(dt);
  }
  scene.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// --- starting up --------------------------------------------------------
function buildRecognizer() {
  return new Recognizer({
    onWords: (words) => {
      debug(`heard: ${words.map((w) => w[0]).join(' ')}`);
      if (!paused) game.handleSpoken(words);
    },
    onUnknown: () => { if (!paused) ui.nudge(); },
    onRaw: (kind, text) => debug(`${kind}: ${text}`),
    onStatus: setMicStatus,
    onLevel: (rms) => {
      els.micLevel.style.setProperty('--level', Math.min(1, rms * 6).toFixed(3));
    },
    onProgress: (fraction, loaded, total) => {
      if (fraction === null) {
        els.loadingLabel.textContent = 'Getting the listener ready…';
        els.loadingBar.style.setProperty('--fraction', '0.15');
        return;
      }
      const mb = (bytes) => (bytes / 1048576).toFixed(0);
      els.loadingLabel.textContent = `Getting the listener ready… ${mb(loaded)} of ${mb(total)} MB`;
      els.loadingBar.style.setProperty('--fraction', String(fraction));
    },
    onError: (message) => {
      debug(`error: ${message}`);
      setMicStatus('error');
    },
  });
}

async function beginPlay() {
  els.overScreen.hidden = true;
  els.trouble.hidden = true;

  if (!recognizer) {
    recognizer = buildRecognizer();
    els.setup.hidden = true;
    els.loading.hidden = false;
    els.loadingLabel.textContent = 'Getting the listener ready…';

    try {
      await recognizer.load();
    } catch (error) {
      showTrouble(
        'Could not load the speech files. Run <code>pixi run fetch-model</code> '
        + '(or <code>python tools/fetch_model.py</code>) to download them, then '
        + 'reload this page.',
        `model load failed: ${error.message}`,
      );
      els.loading.hidden = true;
      els.setup.hidden = false;
      return;
    }

    els.loadingLabel.textContent = 'Turning on the microphone…';
    els.loadingBar.style.setProperty('--fraction', '1');
    try {
      await recognizer.listen();
    } catch (error) {
      const denied = /denied|not allowed|NotAllowed/i.test(error.name + error.message);
      showTrouble(
        denied
          ? 'The microphone is blocked. Click the microphone icon in the address '
            + 'bar and allow it, then reload. You can still play with the '
            + '<kbd>Space</kbd> bar.'
          : `The microphone could not be opened (${error.name || 'error'}). `
            + 'You can still play with the <kbd>Space</kbd> bar.',
        `getUserMedia failed: ${error.name}: ${error.message}`,
      );
      els.loading.hidden = true;
      els.setup.hidden = false;
      return;
    }

    if (!localVoiceAvailable()) {
      debug('no local text-to-speech voice; hints will be silent');
    }
    els.loading.hidden = true;
  }

  els.startScreen.hidden = true;
  setPaused(false);

  game.start({
    levelIndex: Number(els.levelSelect.value) - 1,
    gentle: els.gentleToggle.checked,
  });
  recognizer.setEnabled(true);
}

function setPaused(value) {
  paused = value;
  els.pauseBtn.dataset.paused = String(value);
  els.pauseBtn.setAttribute('aria-label', value ? 'Resume' : 'Pause');
  recognizer?.setEnabled(!value);
}

els.playBtn.addEventListener('click', beginPlay);
els.againBtn.addEventListener('click', beginPlay);
els.pauseBtn.addEventListener('click', () => setPaused(!paused));

window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyD' && !event.metaKey && !event.ctrlKey) {
    toggleDebug();
    return;
  }
  if (event.code !== 'Space') return;
  event.preventDefault();
  // Space credits the current word: the escape hatch when the recognizer keeps
  // missing a child's voice, and the way to play without a microphone at all.
  if (!els.startScreen.hidden) { beginPlay(); return; }
  if (!els.overScreen.hidden) { beginPlay(); return; }
  game.creditCurrentWord();
});

if (!window.isSecureContext) {
  showTrouble(
    'This page needs a secure address to use the microphone. Open it as '
    + '<code>http://localhost:8000</code> rather than by IP address or file path.',
    `insecure context: ${location.origin}`,
  );
}

setMicStatus('off');

// Handle for the browser tests in tests/.
window.__balloon = { game, scene, get recognizer() { return recognizer; }, beginPlay, debug, debugHistory };
