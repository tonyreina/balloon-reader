// Wires the DOM, the local recognizer and the game loop together.

import { Scene } from './scene.js';
import { Game } from './game.js';
import { CUSTOM_INDEX } from './sentences.js';
import { Recognizer } from './recognizer.js';
import { say, localVoiceAvailable } from './voice.js';
import { Store, checkCustomSentences } from './store.js';
import { canAddOwnSentences } from './env.js';

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
  lettersToggle: $('#letters-toggle'),
  spacingToggle: $('#spacing-toggle'),
  progressButtons: document.querySelectorAll('[data-progress]'),
  sentencesBtn: $('#sentences-btn'),
  sentencesScreen: $('#sentences-screen'),
  sentencesInput: $('#sentences-input'),
  sentencesProblems: $('#sentences-problems'),
  sentencesSave: $('#sentences-save'),
  sentencesCancel: $('#sentences-cancel'),
  progressScreen: $('#progress-screen'),
  progressBody: $('#progress-body'),
  progressClose: $('#progress-close'),
  progressForget: $('#progress-forget'),
};

const store = new Store();

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
const game = new Game(scene, ui, store);

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
    onUnknown: () => { if (!paused) game.noteUnknown(); },
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

  const choice = els.levelSelect.value;
  const own = choice === OWN_SENTENCES_VALUE && ownSentencesAllowed && store.custom.length > 0;
  const numbered = Number.parseInt(choice, 10);
  game.start({
    levelIndex: own ? CUSTOM_INDEX : Math.max(0, (Number.isFinite(numbered) ? numbered : 1) - 1),
    gentle: els.gentleToggle.checked,
    custom: own ? store.custom : [],
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

// --- settings -----------------------------------------------------------
function applyComfort() {
  document.body.classList.toggle('easy-letters', els.lettersToggle.checked);
  document.body.classList.toggle('wide-spacing', els.spacingToggle.checked);
}

function restoreSettings() {
  const saved = store.settings;
  // Both default to on: the audience is children who are still learning the
  // letter shapes, so the readable choice is the right default.
  els.lettersToggle.checked = saved.easyLetters !== false;
  els.spacingToggle.checked = saved.wideSpacing !== false;
  els.gentleToggle.checked = saved.gentle !== false;
  if (saved.level) {
    const wanted = String(saved.level);
    const exists = [...els.levelSelect.options].some((option) => option.value === wanted);
    if (exists) els.levelSelect.value = wanted;
  }
  applyComfort();
}

for (const [element, key] of [[els.lettersToggle, 'easyLetters'], [els.spacingToggle, 'wideSpacing']]) {
  element.addEventListener('change', () => {
    applyComfort();
    store.saveSettings({ [key]: element.checked });
  });
}
els.gentleToggle.addEventListener('change', () => store.saveSettings({ gentle: els.gentleToggle.checked }));
els.levelSelect.addEventListener('change', () => store.saveSettings({ level: els.levelSelect.value }));

// --- a grown-up's own sentences -----------------------------------------
// Only offered when the game is served from this machine. See js/env.js.
const OWN_SENTENCES_VALUE = 'own';
const ownSentencesAllowed = canAddOwnSentences();

function refreshOwnSentencesOption() {
  const existing = els.levelSelect.querySelector(`option[value="${OWN_SENTENCES_VALUE}"]`);
  const count = store.custom.length;
  if (!ownSentencesAllowed || !count) {
    existing?.remove();
    return;
  }
  const option = existing || document.createElement('option');
  option.value = OWN_SENTENCES_VALUE;
  option.textContent = `Your own sentences (${count})`;
  if (!existing) els.levelSelect.append(option);
}

if (ownSentencesAllowed) els.sentencesBtn.hidden = false;

function openSentences() {
  els.sentencesInput.value = store.custom.join('\n');
  els.sentencesProblems.hidden = true;
  els.sentencesScreen.hidden = false;
}

els.sentencesBtn.addEventListener('click', openSentences);
els.sentencesCancel.addEventListener('click', () => { els.sentencesScreen.hidden = true; });

els.sentencesSave.addEventListener('click', () => {
  const { sentences, problems } = checkCustomSentences(els.sentencesInput.value);
  if (problems.length) {
    els.sentencesProblems.textContent = problems.join('\n');
    els.sentencesProblems.hidden = false;
    return;
  }
  store.saveCustom(sentences);
  refreshOwnSentencesOption();
  if (sentences.length) {
    // Setting a select from script fires no change event, so the choice has to be
    // saved here or it is forgotten on the next load.
    els.levelSelect.value = OWN_SENTENCES_VALUE;
    store.saveSettings({ level: OWN_SENTENCES_VALUE });
  }
  els.sentencesScreen.hidden = true;
});

// --- progress for the grown-up ------------------------------------------
function renderProgress() {
  const sessions = store.sessions;
  const practice = store.wordsNeedingPractice();

  if (!sessions.length) {
    els.progressBody.innerHTML = '<p class="progress-empty">No finished rounds yet. '
      + 'Play a round and the reading will show up here.</p>';
    return;
  }

  const totals = sessions.reduce((sum, s) => ({
    read: sum.read + (s.wordsRead || 0),
    helped: sum.helped + (s.wordsHelped || 0),
    sentences: sum.sentences + (s.sentencesDone || 0),
    seconds: sum.seconds + (s.seconds || 0),
  }), { read: 0, helped: 0, sentences: 0, seconds: 0 });

  const attempted = totals.read + totals.helped;
  const accuracy = attempted ? Math.round((totals.read / attempted) * 100) : 0;
  const pace = totals.seconds ? Math.round((totals.read / totals.seconds) * 60) : 0;

  const recent = sessions.slice(-14);
  const tallest = Math.max(...recent.map((s) => (s.wordsRead || 0) + (s.wordsHelped || 0)), 1);
  const bars = recent.map((s) => {
    const read = s.wordsRead || 0;
    const helped = s.wordsHelped || 0;
    const when = new Date(s.at).toLocaleDateString();
    return `<div class="bar" title="${when}: ${read} read, ${helped} needed help">`
      + `<i class="helped" style="height:${(helped / tallest) * 100}%"></i>`
      + `<i class="read" style="height:${(read / tallest) * 100}%"></i></div>`;
  }).join('');

  els.progressBody.innerHTML = `
    <div class="progress-tiles">
      <div><strong>${sessions.length}</strong><span>rounds played</span></div>
      <div><strong>${totals.read}</strong><span>words read</span></div>
      <div><strong>${accuracy}%</strong><span>read without help</span></div>
      <div><strong>${pace}</strong><span>words a minute</span></div>
    </div>
    <div class="progress-section">
      <h2>Each round</h2>
      <div class="session-chart">${bars}</div>
      <p class="chart-key">
        <b><i class="read" style="background:var(--read)"></i>read alone</b>
        <b><i class="helped" style="background:#e8b93f"></i>needed help</b>
      </p>
    </div>
    <div class="progress-section">
      <h2>Words to practise</h2>
      ${practice.length
        ? `<ul class="practice-list">${practice.map((entry) =>
            `<li>${entry.word}<small>${entry.helped}×</small></li>`).join('')}</ul>
           <p class="fine-print">The game brings these back on their own, in sentences,
           when they are due. Little words like "the" and "is" are left out — the
           microphone mishears those more often than a child does.</p>`
        : '<p class="progress-empty">Nothing needing practice. Every word was read alone.</p>'}
    </div>`;
}

for (const button of els.progressButtons) {
  button.addEventListener('click', () => {
    renderProgress();
    els.progressScreen.hidden = false;
  });
}
els.progressClose.addEventListener('click', () => { els.progressScreen.hidden = true; });
els.progressForget.addEventListener('click', () => {
  const ok = window.confirm(
    'Forget all saved progress, practice words, settings and your own sentences on '
    + 'this computer? This cannot be undone.',
  );
  if (!ok) return;
  store.clearAll();
  restoreSettings();
  refreshOwnSentencesOption();
  renderProgress();
});

refreshOwnSentencesOption();
restoreSettings();
setMicStatus('off');

// Handle for the browser tests in tests/.
window.__balloon = { game, scene, get recognizer() { return recognizer; }, beginPlay, debug, debugHistory };
