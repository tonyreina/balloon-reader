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
— the Kaldi speech engine compiled to WebAssembly. The acoustic model is served
from this project's `models/` folder. After the one-time model download the game
makes **no network requests at all**: no cloud speech service, no analytics, no
web fonts. Your child's voice never leaves the machine.

That is a deliberate change from the browser's built-in `SpeechRecognition` API,
which sends microphone audio to Google's servers in Chrome.

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

## Levels and difficulty

Five levels, four sentences each before promotion, from CVC words and sight words
up to full storybook sentences. Edit [js/sentences.js](js/sentences.js) to use
your own — the levels are plain arrays of strings.

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
| [js/recognizer.js](js/recognizer.js) | Local speech recognition via Vosk |
| [js/decoys.js](js/decoys.js) | Decoy vocabulary that keeps the grammar honest |
| [js/voice.js](js/voice.js) | Local-only text-to-speech for hints |
| [js/matcher.js](js/matcher.js) | Forgiving word matching |
| [js/sentences.js](js/sentences.js) | Reading content by level |
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
| `test-scene` | Balloon geometry, and that the wildlife stays rare and out of the way |
| `balance` | Physics simulation; prints the difficulty table above |
| `test-browser` | Drives the real page in Chromium: rendering, physics, layout |
| `test-speech` | **Feeds recorded speech to Chromium as a microphone** and checks what the game credits, including the schwa "the" |

`test`, `test-recognizer`, `test-scene` and `balance` need nothing but Node. The browser
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
  audio is transmitted. The browser will ask permission for the microphone the
  first time, as it does on localhost.

## Third-party components

- **[Vosk](https://alphacephei.com/vosk/)** and the vendored
  [vosk-browser](https://github.com/ccoreilly/vosk-browser) build in
  [vendor/vosk.js](vendor/vosk.js) — Apache-2.0, © Alpha Cephei Inc and
  Ciaran O'Reilly.
- **`vosk-model-small-en-us-0.15`** — Apache-2.0, © Alpha Cephei Inc. Fetched by
  `tools/fetch_model.py`, not stored here.
- **Baloo 2** in [fonts/](fonts/) — SIL Open Font License 1.1, © Ek Type.
