# 🎈 Balloon Reader

A browser game that helps a child learn to read aloud fluently — with speech
recognition that runs entirely on your own machine.

A sentence sits at the bottom of the screen. A red balloon drifts down from the
top. The child reads the sentence out loud; each word the microphone recognizes
gives the balloon a puff of air. Read smoothly and the balloon stays up — pause
too long and it settles into the grass.

## Run it

With [pixi](https://pixi.sh) (Linux, macOS, Windows):

```bash
pixi run start          # downloads the speech model on first run, then serves
```

Then open <http://localhost:8000>. Without pixi, any Python 3 will do:

```bash
python tools/fetch_model.py     # once: fetches the ~40MB speech model
python serve.py 8000
```

Use a Chromium-based browser (Chrome or Edge) or Firefox — the game needs
`AudioWorklet`-era audio and WebAssembly, not any particular speech API. The
microphone only works on `localhost` or over HTTPS, so open it through the
server rather than double-clicking `index.html`; the game will tell you if you
have opened it the wrong way.

## Everything stays on your computer

Recognition runs locally, in a Web Worker, using [Vosk](https://alphacephei.com/vosk/)
— the Kaldi speech engine compiled to WebAssembly. The acoustic model is served from
this project's `models/` folder. Your child's voice never leaves the machine.

That is a deliberate change from the browser's built-in `SpeechRecognition` API,
which sends microphone audio to Google's servers in Chrome.

This is a claim worth checking rather than trusting, so
[tests/privacy.test.mjs](tests/privacy.test.mjs) checks it two ways: it scans the
shipped files for anything a browser would fetch from another host on its own — a
stylesheet, font, script, `url()`, absolute `fetch`, socket or beacon — and then
plays a real session in Chromium with every request from the page *and its worker*
recorded. Measured on the published site, a full session makes **20 requests, all of
them to the game's own address**, every one a `GET`, with no socket and nothing
uploaded. Even the WebAssembly binary is embedded as a `data:` URI inside
[vendor/vosk.js](vendor/vosk.js), so it is not fetched at all.

What that leaves, stated plainly:

- **Static files are downloaded from wherever you host it.** On GitHub Pages that
  means GitHub serves the page, scripts, fonts and the 40MB speech model, and — like
  any web host — its logs will show your IP address, the time, and which files were
  requested. That is the cost of hosting a page anywhere; it is not the game sending
  anything. Run it from your own computer and even that stops.
- **Audio is never uploaded.** The microphone stream goes to an `AudioContext`, into
  a Web Worker by `postMessage`, and no further.
- **Sentences are part of the download**, not fetched per round, and nothing you type
  is transmitted.
- **Spoken hints use local voices only.** [js/voice.js](js/voice.js) filters
  `speechSynthesis` to voices the browser reports as `localService`, so a hint is
  never sent to a network text-to-speech service. If a browser offers only network
  voices, hints stay silent instead.
- **There is no analytics, no error reporting, no fonts from a CDN, and no backend.**
  The single external link on the page is the "Source code" link, which is inert
  until clicked and carries `rel="noreferrer"`.

### The trick that makes it work on a young voice

General speech recognition is bad at children — and a reading game that punishes a
child for the recognizer's mistakes teaches them they are bad at reading. But a
reading game has an advantage no dictation app has: **it already knows what the
child is supposed to say.**

So each sentence is decoded against a grammar built for that sentence rather than
all of English. Instead of choosing between thirty thousand words, the recognizer
only has to tell a handful apart. You can watch this happen — press <kbd>D</kbd>
in the game and every transcript appears in a panel.

The grammar has four parts, and each one is there because leaving it out broke
something measurable:

1. **The sentence itself, as a whole phrase.** This is the part that matters most,
   and it was the last to be added. Vosk estimates a small language model from the
   grammar, so putting the sentence in teaches the decoder the *order* of the
   words. Without it, nothing said that "the" is followed by "sun" here, and a
   single long decoy word swallowed the pair: `the sun` came back as `south`.
2. **The individual words**, repeated to bias the decoder toward them, so a child
   who stops mid-sentence, re-reads a word, or reads out of order is still heard.
3. **A decoy vocabulary** ([js/decoys.js](js/decoys.js)) of multi-syllable common
   words, so wrong speech has somewhere *plausible* to go. This matters more than
   it sounds: with the sentence's words alone, 3 of 5 target words were credited
   during 30 seconds of completely unrelated speech — the balloon flew on words
   the child never said.

   Two screens decide which decoys survive, and both came from listening to what
   went wrong. **Only multi-syllable decoys** are used, because every theft ever
   observed was by a monosyllable: `the sun` heard as `south`, `sun` as `saw`, and
   a schwa `the` as `stop` or `story`. A short unstressed word can only be outbid
   by another short word, so long decoys cannot steal one. And **nothing that
   looks like a word in this sentence** is kept, as a coarse guard for the longer
   words.
4. **`[unk]`**, with real prior weight — not a single mention among a hundred
   entries. This is the honest sink for wrong reading, and screening the decoys
   down to multi-syllable words left fewer of them to absorb it, so `[unk]` takes
   up the slack. Unrelated speech lands there instead of on a word of the sentence.

The prior mass given to each part is set as an explicit share rather than by
counting entries, so screening decoys can't quietly shift the balance. Those
shares are measured, not guessed: pushing the sentence's own share to 0.6 let
unrelated speech finish a whole sentence, which is the one thing that must never
happen.

None of this is tuned by intuition. [tests/speech.test.mjs](tests/speech.test.mjs)
hands Chromium a recorded WAV file as its microphone and measures what the game
actually credits, including the two cases that drove most of the
design: **"the" said the way people really say it.** Most of us reduce it to a
schwa — "thuh", not "thee" — and that used to stall the sentence outright. Worse
when the sentence *starts* with "The": a child pauses after it, so Vosk ends the
utterance there and has to decode a 100ms schwa alone, with no word order to help.
Both are regression tests now.

Some of it a recognizer simply cannot win, so the game covers the gap instead. A
short function word the microphone misses is credited as soon as the child reads
the next word — and crucially, the game **never wiggles a function word** to say
it was wrong. Telling a child who read "The" perfectly well that they got it wrong
is worse than saying nothing.

There is one more safeguard that does not depend on the recognizer at all. If a
word still cannot be heard after the game has read it aloud twice, the game gives
the word to the child, marks it blue as *helped* rather than green as *read*, and
moves on. No child is ever trapped on a word their microphone refuses to hear.

## How it plays

- **Read the highlighted word.** The current word is dark and underlined in red;
  words already read turn green.
- **Tap any word to hear it.** The computer reads it back slowly, using a local
  voice only — if your browser offers just network voices, it stays silent rather
  than sending the text away.
- **Stuck?** After about five seconds the game reads the word aloud. If it still
  cannot hear the word after two tries, it hands the word over and moves on,
  marked in blue as *helped* rather than read. No child ever gets trapped on a
  word the microphone refuses to hear.
- **Space bar** credits the current word — the escape hatch for a grown-up when
  the microphone keeps mishearing, and the way to play with no microphone at all.
- **Hearts** are spent when the balloon lands. That sentence restarts, because
  re-reading a sentence is how fluency is built. Three landings (five in Gentle
  mode) ends the round.
- **Gentle mode** (on by default) slows the fall, strengthens each puff and gives
  five hearts. Turn it off for older or more confident readers.
- **Press D** for the diagnostics panel: what the recognizer heard, word by word.

## The dragon

A purple dragon hovers below the balloon, and it is where the puff of air comes
from. When a child reads a word it huffs: the head tips back, the jaw opens, the
wings beat down and a jet of air rises from its mouth to the balloon. Finishing a
sentence sets it off properly.

This is not decoration. The puff particles are emitted from the dragon's mouth
rather than from under the balloon, so what a child sees and what the game does are
the same event — [tests/scene.test.mjs](tests/scene.test.mjs) asserts that every
particle starts at the mouth, travels upwards and begins below the balloon.

It patrols from one side of the balloon to the other rather than hanging in one
spot, turning to face the balloon as it crosses. The turn is eased rather than
snapped, so mid-turn it is genuinely edge-on and reads as turning round instead of
flipping.

It is drawn in [js/dragon.js](js/dragon.js) as real anatomy — a serpentine neck,
membrane wings on finger struts, overlapping belly plates, four clawed limbs, a
spaded tail, a dorsal ridge — with proportions that keep it a hatchling rather than
a wyvern: an oversized skull, a short snout and a big gold eye. The finest detail is
skipped when it is drawn small, because at forty pixels belly plates and wing struts
stop being detail and become dirt.

## The wildlife

Birds and butterflies cross the sky, and a caterpillar, cat or dog wanders the
grass. The ground animals hop when the child reads a word, and all of them
celebrate when a sentence is finished — they never say anything, because no text
should compete with the words being read.

Decoration in a reading game has to earn its place, so [js/critters.js](js/critters.js)
is built around restraint, and [tests/scene.test.mjs](tests/scene.test.mjs)
asserts every part of it:

- **Never many:** at most two in the sky and one on the ground.
- **Never often:** long random gaps, about two arrivals a minute, and the sky is
  empty a good part of the time.
- **Never in the way:** the flight band stops below the HUD and above the grass,
  so nothing drifts over the sentence, and everything is drawn behind the balloon.
- **Never while a child is struggling:** nothing new arrives once the game has
  started helping with a stuck word.
- **Never if unwanted:** no wildlife at all when the browser asks for reduced
  motion.

## What the game remembers

Everything below is kept in this browser's localStorage on the device it is played
on. Nothing is uploaded, there is no account, and **Forget everything** on the
progress screen deletes all of it. In private browsing, or where storage is blocked,
the game keeps going without remembering anything rather than refusing to play.

### Which sentence comes next

How often each sentence has been read is remembered, so the game can pick at random
from among the ones a child has seen least. Without it, most of every level was
unreachable — see "Levels and difficulty". The randomness is injectable, which is how
the tests that need a known sentence — the recorded speech fixtures say one specific
line — pin it.

### Practice for the words they got wrong

Words the game had to give away come back on their own. Each one rests for a while
and then becomes due again — two minutes, ten minutes, a day, three days, a week,
stepping up each time it is read correctly and dropping straight back to due when it
is not. When a sentence is chosen, one containing due words wins over the next in
sequence, so practice is targeted while **every sentence stays a real sentence**;
stringing a child's missed words together would make nonsense, which is the last
thing a beginning reader needs.

Little words — `the`, `a`, `is`, `my` — are deliberately never added to the practice
list. The recognizer mishears those far more often than a child does, so a list
built from them would be a list of the microphone's weaknesses rather than the
reader's.

### Progress, for the grown-up

The **Progress** screen shows rounds played, words read, the share read without
help, pace in words a minute, a bar per round split into read-alone and
needed-help, and the words currently due for practice.

### Your own sentences

A child's reading book from school beats any list I could write, so sentences can be
typed in — one per line, letters and apostrophes only, punctuation stripped, digits
refused. They then appear as their own choice in the level menu.

**This is only offered when the game is served from the machine it is played on**
(`localhost`, or a `.local` name). On any published copy — GitHub Pages included —
the feature is hidden, and no URL flag turns it on. The reason is not that one
visitor could see another's sentences: localStorage is private to a single browser
on a single origin, so nothing typed on one device can reach another. The reason is
the shared device. On a classroom or library computer, whatever one child types is
still there for the next child who sits down, and the person accountable for what a
child is asked to read aloud should be the person who owns the computer it runs on.
See [js/env.js](js/env.js).

### Reading comfort

Two settings for the reading text, defaulting to the readable choice because the
audience is children still learning letter shapes. Both apply only to the words
being read; the rest of the game keeps its own look.

**Letters** offers three faces, shown as three buttons on the start screen, each
displaying `a g` in its own letters so the difference can be seen without picking
one. (It began as a dropdown labelled "Letters", which hid the fact that the choice
existed at all.)

- **Rounded a and g** (default) — [Andika](https://software.sil.org/andika/), designed
  by SIL for beginning readers. It has a single-story `a` and `g`, the letterforms
  children are taught to write. Most display fonts, including the Baloo 2 used
  elsewhere in the game, do not.
- **OpenDyslexic** — [OpenDyslexic](https://opendyslexic.org/) by Abbie Gonzalez,
  whose letters are weighted at the bottom, which some readers find makes them
  harder to flip or confuse. Offered as a choice rather than a default: the evidence
  for it is mixed, and whether it helps a particular reader is a matter of trying it.
- **Storybook** — the game's own Baloo 2, if a child prefers it.

**Wide spacing** opens up letter and word spacing, which makes it easier to track
along a line.

Long sentences are also stepped down in size automatically, from their word count. A
twelve-word sentence at full size wrapped onto four lines, which is hard to follow
and left the balloon little sky; it now fits in two.

## Levels and difficulty

Five levels, ten sentences each before promotion, from CVC words and sight words up to
full storybook sentences. Levels do not have to hold the same number of sentences; a
longer one simply offers more variety before it repeats.

Which sentence comes next is decided in this order:

1. one containing a word that is **due for practice**, then
2. **at random** among the sentences this child has read **least often**.

Both halves of that second rule matter. Least-read first means a level is exhausted
before anything repeats — choosing purely by position served the same few sentences
every game and left most of each level unread, 29 of 46 reachable and 17 that could
never appear however long anyone played. Random among the equals means the order is
different every playthrough rather than a fixed march through the list. Together they
mean a full run now reads all 53 sentences, in a different order each time.

Edit [js/sentences.js](js/sentences.js) to change the content; the levels are plain
arrays of strings.

Each level sets `sink` (how much of the sky the balloon loses per second of
silence) and `lift` (how much one correct word gains back), both as fractions of
the visible sky, so difficulty is identical on a phone and a monitor. What those
numbers mean in practice, from `pixi run -e dev balance`:

| Level | Slowest pace that stays aloft | Gentle mode | Seconds per word | Fall from rest |
| --- | --- | --- | --- | --- |
| 1 · First Words | 10 wpm | 6 wpm | 6.0s | 20.1s |
| 2 · Blends | 15 wpm | 9 wpm | 4.0s | 14.2s |
| 3 · Long Vowels | 21 wpm | 13 wpm | 2.9s | 9.9s |
| 4 · Two Syllables | 28 wpm | 17 wpm | 2.1s | 8.3s |
| 5 · Storytime | 36 wpm | 22 wpm | 1.7s | 7.2s |

Level 1 gives a child six seconds a word to sound it out; level 5 asks for
something close to fluent pace. If that curve is wrong for your reader, change
`sink` and `lift` and re-run the balance script to see the new numbers.

## Guardrails

Both promises this game makes are enforced by mechanisms, not by intentions. An
adversarial review of the project raised 59 candidate problems; what follows is what
survived being attacked, and what was done about it.

### Nothing personal leaves the device

- **A Content-Security-Policy in [index.html](index.html)** is the enforcement. Its
  load-bearing directive is `connect-src 'self'`: no `fetch`, `XMLHttpRequest`,
  `sendBeacon`, `WebSocket` or `EventSource` can reach another host, so a future
  mistake or a compromised dependency cannot send audio anywhere either. Measured
  without it, five exfiltration attempts reached the network, one of them a `POST`
  that got a real response back. With it, none do —
  [tests/guardrails.test.mjs](tests/guardrails.test.mjs) tries all seven routes every
  run.
- **The microphone is closed, not muted**, when the game pauses, when the round ends,
  and when the tab is hidden. Muting a live track leaves the browser's recording
  indicator lit, and a parent is looking at that indicator, not at our flag. It was
  found still open in all three states.
- **`window.__balloon`**, the handle the tests drive, is withheld on a published copy.
  It exposes the live `MediaStream` and every transcript so far.
- **The vendored recognizer and the speech model are pinned** to sha256 hashes
  ([vendor/PROVENANCE.md](vendor/PROVENANCE.md), [tools/fetch_model.py](tools/fetch_model.py)).
  The model decides which words the game believes it heard, so a substituted one is a
  content problem as much as a security one. A mismatch refuses the download.

### Nothing objectionable reaches a child

- **[js/safe-words.js](js/safe-words.js)** is one blocklist used in two places: the
  sentences a grown-up types are rejected if they contain any of it, and the bundled
  sentences in [js/sentences.js](js/sentences.js) are held to the same list by
  [tests/content.test.mjs](tests/content.test.mjs). Matching is whole-word — a filter
  that rejects "grass" and "Scunthorpe" teaches a child the computer is arbitrary —
  and light disguises (`sh1t`, `@ss`) are undone first.
- **A grown-up check** stands in front of the sentence editor: an arithmetic question
  written out in words, so reading the question is itself part of the barrier. The
  editor used to be gated on the URL alone, which is a fact about the address bar and
  not about who is sitting at the keyboard — on a family laptop an older sibling could
  type anything for a younger one to read aloud.
- **Saving sentences no longer switches the game to them.** It used to select the new
  level and persist that choice, so whatever was typed became what the next person to
  press Start was handed. The start screen now also **shows the sentences** before
  anyone presses Start.
- **Nothing publishes without passing.** [.github/workflows/pages.yml](.github/workflows/pages.yml)
  runs the content and guardrail suites, and `deploy` declares `needs: test`. Pull
  requests are checked but never published. Before this, a word added to the sentence
  list or a `<script src>` pointing at another host went live within a minute with
  nothing having looked at it.

  The gate is verified by tampering rather than assumed. Against a clean checkout it
  publishes; against each of these it does not:

  | change | blocked by |
  | --- | --- |
  | an unsuitable word added to a sentence | content |
  | an analytics script from another host | guardrails |
  | the vendored recognizer altered | guardrails |
  | the Content-Security-Policy removed | guardrails |
  | the policy loosened to allow any host | guardrails |
  | the content filter disabled in `store.js` | guardrails |

### What the review found was already sound

Worth knowing so effort goes elsewhere: local decoding is real (the WASM is a `data:`
URI, the model is same-origin, audio reaches the worker only by `postMessage`); the
`localhost`-only rule for custom sentences is enforced in three independent places and
cannot be turned on by a query string; all 403 decoy words are clean, so the recognizer
structurally cannot surface an unsafe word from the bundled levels; `speechSynthesis` is
correctly restricted to local voices; and the store degrades gracefully on corrupt data.

Three plausible-sounding worries were investigated and are **not** real: the
full-dictionary fallback cannot print slurs to the diagnostics panel (out-of-vocabulary
words are a Kaldi warning, not a failure, and the panel is not shown on error); the
progress screen's `innerHTML` has no injection path (every interpolated value is an
integer or a word already reduced to `a-z`); and `zipfile.extractall` in the model
fetcher is not path-traversable.

## Checking the reading content

The sentences are a hand-written list in [js/sentences.js](js/sentences.js). Nothing
is generated, fetched or randomised at runtime, so that file is the only place words
come from and it can be read end to end in a couple of minutes.

`pixi run -e dev words` is the shortcut. It prints **every distinct word the game
will ever ask a child to read**, grouped by the level it first appears in, so the
whole vocabulary can be reviewed at a glance rather than by reading forty sentences.
It also checks the things that are easy to break when editing the list: letters and
apostrophes only, capitalised, no trailing punctuation, all unique, level 1 kept
short, and difficulty that climbs. There is a not-for-children word list too, but
treat that as a tripwire for future edits, not a filter — it cannot judge tone or
context.

## Being fair to a young reader

Beyond the grammar trick, the matching in [js/matcher.js](js/matcher.js) is
deliberately generous:

- homophones count (`to` / `two` / `too`)
- near-misses count, scaled by word length — `elefant` passes for `elephant`,
  but `cap` never passes for `cat`
- plural and tense slips count
- `um` and `uh` are ignored rather than treated as wrong
- unstressed words the recognizer swallows (`a`, `the`, `is`) are credited when
  the child has audibly moved on to the next word
- a wrong word costs nothing — the word wiggles and the child tries again

## Layout

| File | What it does |
| --- | --- |
| [index.html](index.html) | Page shell, HUD, start and end screens |
| [css/style.css](css/style.css) | All styling and animation |
| [js/main.js](js/main.js) | Wires the DOM, the recognizer and the game loop |
| [js/game.js](js/game.js) | Rules: words, hearts, levels, hints, helping out |
| [js/scene.js](js/scene.js) | Canvas sky, balloon physics and rendering |
| [js/critters.js](js/critters.js) | The birds, butterflies and ground animals |
| [js/dragon.js](js/dragon.js) | The dragon that breathes the balloon aloft |
| [js/recognizer.js](js/recognizer.js) | Local speech recognition via Vosk |
| [js/decoys.js](js/decoys.js) | Decoy vocabulary that keeps the grammar honest |
| [js/voice.js](js/voice.js) | Local-only text-to-speech for hints |
| [js/matcher.js](js/matcher.js) | Forgiving word matching |
| [js/sentences.js](js/sentences.js) | Reading content by level, and choosing what to read next |
| [js/store.js](js/store.js) | What is remembered: practice words, sessions, settings |
| [js/env.js](js/env.js) | Whether this copy may accept a grown-up's own sentences |
| [js/safe-words.js](js/safe-words.js) | The words this game will not put in front of a child |
| [serve.py](serve.py) | Static server with the right MIME types and caching |
| [tools/fetch_model.py](tools/fetch_model.py) | Downloads and packs the speech model |

## Tests

```bash
pixi run -e dev setup     # once: Playwright and its Chromium
pixi run -e dev check     # everything
```

Or individually:

| Task | What it covers |
| --- | --- |
| `test` | Word matching, hearts, levels, sentence flow, the never-stuck rule |
| `test-recognizer` | Transcript bookkeeping: re-hypothesised partials, `[unk]`, the hint gate |
| `test-scene` | Balloon geometry, the dragon, and that the wildlife stays out of the way |
| `test-store` | Practice scheduling, the session log, sentence validation, the local-only rule |
| `test-ui` | Reading-comfort settings, the sentence editor and the progress screen |
| `test-privacy` | A whole session sends nothing to any other host, and the mic is released |
| `test-guardrails` | The content filter, the pinned recognizer, and the browser refusing to send anything |
| `words` | Prints every word the game will ask a child to read, and audits the sentences |
| `balance` | Physics simulation; prints the difficulty table above |
| `test-browser` | Drives the real page in Chromium: rendering, physics, layout |
| `test-speech` | **Feeds recorded speech to Chromium as a microphone** and checks what the game credits, including the schwa "the" |

`test`, `test-recognizer`, `test-scene`, `test-store`, `words` and `balance` need
nothing but Node. The browser
tests start `serve.py` themselves, so they work as a single command on all three
operating systems.

The speech test is the interesting one: Chromium can be handed a WAV file as its
microphone, so the whole path — audio in, Vosk decode, grammar, word credited,
balloon rises — is tested without a person in the room. It checks that correct
reading is credited, that a *different* sentence is not, that "the" reduced to a
schwa still works, and that all 40 sentences can be built into a grammar (a word
missing from the model's dictionary would break a whole sentence).

The fixtures in `tests/audio/` are generated by `espeak`, which sounds nothing
like a child; they are a test of the pipeline, not a measure of real-world
accuracy. Regenerate them with `pixi run -e dev fixtures` (needs system `espeak`
and `ffmpeg`).

## Putting it online (GitHub Pages)

The game is entirely static and every path in it is relative, so it runs from a
project subpath such as `https://tonyreina.github.io/balloon-reader/` with no
changes. Pages serves over HTTPS, which is a secure context, so the microphone
works there.

[.github/workflows/pages.yml](.github/workflows/pages.yml) does the deployment. It
fetches the speech model during the build instead of storing it in git, so the
repository stays around 9MB while the published site carries the ~46MB it needs.

Turn it on once: **Settings → Pages → Build and deployment → Source: GitHub
Actions**. Every push to `main` then republishes. Until Pages is enabled the
workflow fails at its `configure-pages` step.

Two things to know before pointing a classroom at it:

- **Each new visitor downloads about 40MB** of speech model. GitHub Pages has a
  soft bandwidth limit of 100GB a month, which is roughly 2,400 first-time
  visitors. Returning visitors revalidate against an ETag and get a `304`, so they
  do not download it again — unless their browser has evicted a file that big.
- **Recognition is still local.** Hosting the page on GitHub changes nothing about
  where the listening happens: the model runs in the visitor's own browser, and no
  audio is transmitted — see "Everything stays on your computer" for the measured
  request log. What GitHub does see is what any web host sees: the IP address and
  which files were requested. The browser will ask permission for the microphone the
  first time, as it does on localhost.
- **Typing in your own sentences is switched off on a published copy**, because a
  shared computer keeps whatever one child typed for the next child who sits down.
  Run the game locally to use that. See "Your own sentences" above.

## Third-party components

- **[Vosk](https://alphacephei.com/vosk/)** and the vendored
  [vosk-browser](https://github.com/ccoreilly/vosk-browser) build in
  [vendor/vosk.js](vendor/vosk.js) — Apache-2.0, © Alpha Cephei Inc and
  Ciaran O'Reilly.
- **`vosk-model-small-en-us-0.15`** — Apache-2.0, © Alpha Cephei Inc. Fetched by
  `tools/fetch_model.py`, not stored here.
- **Baloo 2** in [fonts/](fonts/) — SIL Open Font License 1.1, © Ek Type.
- **Andika** in [fonts/](fonts/) — SIL Open Font License 1.1, © SIL International.
  The default reading font, for its single-story `a` and `g`.
- **OpenDyslexic** in [fonts/](fonts/) — SIL Open Font License 1.1, © Abbie Gonzalez.
  Offered as an alternative reading font.
