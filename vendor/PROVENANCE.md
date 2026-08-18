# What is in vendor/

## vosk.js

A byte-for-byte copy of `dist/vosk.js` from the npm package
[`vosk-browser`](https://www.npmjs.com/package/vosk-browser) version **0.0.8**,
Apache-2.0, © Ciaran O'Reilly. It bundles a WebAssembly build of
[Vosk](https://alphacephei.com/vosk/) (Apache-2.0, © Alpha Cephei Inc), with the
WASM binary embedded as a `data:` URI and the decoding worker inlined, which is why
the file is ~5.8MB and why the game fetches nothing to start recognising speech.

    sha256  29504515526e974f4cb053cf08811c4de5fb2a74007c0a5a957db50eaa8d5d0c

`tests/guardrails.test.mjs` checks that hash on every run. It is vendored rather
than installed so that the code a child's browser executes is in this repository and
can be read, and so that no build step or registry sits between the source and the
page.

To update it deliberately:

    npm pack vosk-browser@<version>
    tar xzf vosk-browser-<version>.tgz
    cp package/dist/vosk.js vendor/vosk.js
    sha256sum vendor/vosk.js        # then update the hash above and in the test

If the test fails and nobody updated it on purpose, the file has been changed by
something else. Do not update the hash to match; find out what changed it.

## The speech model

Not stored here. `tools/fetch_model.py` downloads
`vosk-model-small-en-us-0.15.zip` from Alpha Cephei, checks it against a pinned
sha256, and repacks it into `models/`. The pin is in that script.
