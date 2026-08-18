// Starts serve.py if it is not already running, so the browser tests work as a
// single command on Linux, macOS and Windows without shell backgrounding.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function isUp(base) {
  try {
    const response = await fetch(`${base}/index.html`, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

function launch(command, port) {
  return spawn(command, ['serve.py', String(port)], {
    cwd: repoRoot,
    stdio: 'ignore',
    windowsHide: true,
  });
}

// Returns a stop function. Safe to call even when we did not start anything.
export async function ensureServer(base = 'http://localhost:8000') {
  if (await isUp(base)) return () => {};

  const port = Number(new URL(base).port || 80);
  const candidates = process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python'];

  for (const command of candidates) {
    let child;
    try {
      child = launch(command, port);
    } catch {
      continue;
    }
    let died = false;
    child.on('error', () => { died = true; });
    child.on('exit', () => { died = true; });

    for (let waited = 0; waited < 10000; waited += 200) {
      await new Promise((done) => setTimeout(done, 200));
      if (died) break;
      if (await isUp(base)) {
        console.log(`(started serve.py on ${base} with ${command})`);
        return () => child.kill();
      }
    }
    if (!died) child.kill();
  }

  throw new Error(`could not reach ${base} and could not start serve.py — run it yourself in another terminal`);
}
