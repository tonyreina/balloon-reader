#!/usr/bin/env python3
"""Downloads the Vosk speech model the game listens with.

The model is ~40MB of binary data, so it is not kept in the repository. This
fetches it from Alpha Cephei and repacks it into the gzipped tar archive that
vosk-browser expects. Runs on Linux, macOS and Windows with nothing but Python.

    python tools/fetch_model.py

It does nothing if the model is already in place.
"""

import io
import shutil
import sys
import tarfile
import urllib.request
import zipfile
from pathlib import Path

MODEL = 'vosk-model-small-en-us-0.15'
SOURCE = f'https://alphacephei.com/vosk/models/{MODEL}.zip'
REPO = Path(__file__).resolve().parent.parent
TARGET = REPO / 'models' / f'{MODEL}.tar.gz'


def report(done: int, total: int) -> None:
    if not total:
        return
    share = done / total
    bar = '#' * int(share * 30)
    sys.stdout.write(f'\r  [{bar:<30}] {share * 100:5.1f}%  {done / 1048576:.0f} of {total / 1048576:.0f} MB')
    sys.stdout.flush()


def download(url: str) -> bytes:
    print(f'downloading {url}')
    chunks = []
    with urllib.request.urlopen(url) as response:  # noqa: S310 - fixed, known URL
        total = int(response.headers.get('Content-Length') or 0)
        done = 0
        while True:
            chunk = response.read(262144)
            if not chunk:
                break
            chunks.append(chunk)
            done += len(chunk)
            report(done, total)
    print()
    return b''.join(chunks)


def main() -> int:
    if TARGET.exists():
        print(f'{TARGET.relative_to(REPO)} is already here ({TARGET.stat().st_size / 1048576:.0f} MB)')
        return 0

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    staging = TARGET.parent / '_unpacking'
    if staging.exists():
        shutil.rmtree(staging)

    try:
        archive = download(SOURCE)
    except Exception as error:  # network, DNS, TLS - all the same to the user
        print(f'\ncould not download the model: {error}', file=sys.stderr)
        print(f'download {SOURCE} by hand, unzip it, and repack it as {TARGET}', file=sys.stderr)
        return 1

    print('unpacking')
    with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
        zipped.extractall(staging)

    root = staging / MODEL
    if not root.is_dir():
        print(f'unexpected archive layout: no {MODEL}/ inside the zip', file=sys.stderr)
        return 1

    # vosk-browser wants a gzipped tar containing the model directory.
    print(f'packing {TARGET.relative_to(REPO)}')
    with tarfile.open(TARGET, 'w:gz') as tar:
        tar.add(root, arcname=MODEL)

    shutil.rmtree(staging)
    print(f'done: {TARGET.relative_to(REPO)} ({TARGET.stat().st_size / 1048576:.0f} MB)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
