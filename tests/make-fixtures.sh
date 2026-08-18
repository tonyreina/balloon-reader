#!/usr/bin/env bash
# Builds the fake-microphone audio used by tests/speech.test.mjs.
#
# Chromium can be handed a WAV file as its microphone, which is how the speech
# path gets tested without a person in the room. espeak is a formant synthesiser,
# so it sounds nothing like a child - it is a smoke test of the pipeline, not a
# measure of real-world accuracy. Word gaps are added because that is how a
# beginning reader actually sounds.
#
# Needs: espeak, ffmpeg
set -euo pipefail
cd "$(dirname "$0")/audio"

silence() { ffmpeg -y -loglevel error -f lavfi -i "anullsrc=r=48000:cl=mono" -t "$1" "$2"; }
speak() {  # speak <text> <outfile>
  espeak -w /tmp/br-raw.wav -s 95 -g 22 "$1"
  ffmpeg -y -loglevel error -i /tmp/br-raw.wav -ar 48000 -ac 1 -sample_fmt s16 "$2"
}
pad() {    # pad <speechfile> <outfile>  - lead-in and trailing silence so Vosk finalises
  silence 1.2 /tmp/br-lead.wav
  silence 3.0 /tmp/br-tail.wav
  printf "file '%s'\n" /tmp/br-lead.wav "$1" /tmp/br-tail.wav > /tmp/br-list.txt
  ffmpeg -y -loglevel error -f concat -safe 0 -i /tmp/br-list.txt -c copy "$2"
}

speak "I can see the sun" /tmp/br-correct.wav
pad /tmp/br-correct.wav correct-sentence.wav

speak "elephants dance quietly beside purple mountains" /tmp/br-wrong.wav
pad /tmp/br-wrong.wav wrong-sentence.wav

# "the" reduced to a schwa, the way most people actually say it ("thuh", not
# "thee"). This used to fail: a decoy word swallowed "the sun" whole.
speak "I can see thuh sun" /tmp/br-schwa.wav
pad /tmp/br-schwa.wav schwa-the.wav

# The same schwa, but starting the sentence. Harder: a child pauses after it, so
# the decoder gets a 100ms schwa in an utterance of its own with no context.
speak "thuh cat is on my lap" /tmp/br-initial.wav
pad /tmp/br-initial.wav initial-the.wav

rm -f /tmp/br-*.wav /tmp/br-list.txt
echo "fixtures written to $(pwd)"
ls -la *.wav
