// SOLMARA — a make.fun gta6-01 entry (Node 22, standard library only). The game is
// this directory's game/ folder: plain static files a desktop browser loads offline
// (game/index.html and its ES modules, no library and no network request). This program
// hands it in: it copies game/ and screenshots/ from beside this file to /output and
// writes /output/dossier.json, the summary the judge reads, with the vendored make.fun
// library. Before it copies anything it checks the scorer's caps itself and refuses
// to build an entry the scorer would refuse, then prints a short summary of what it
// handed in.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The scorer's own caps (reference/gate.json): at most 4 screenshots, each at most
// 256 KiB; at most 993 files in game/, at most 48 MiB of game files in all, and no
// path under game/ over 1000 bytes (game/ counts beside /output's own 1000-entry cap,
// its screenshots/ and dossier.json).
const CAPS = {
  screenshotsMax: 4,
  screenshotMaxBytes: 262144,
  gameMaxFiles: 993,
  gameMaxBytes: 50331648,
  gamePathMaxBytes: 1000,
  textMaxBytes: 163840,
};

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function fail(message) {
  console.error(`main.ts: ${message}`);
  process.exit(1);
}

function walkGame(dir, prefix, files) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkGame(full, rel, files);
    } else if (entry.isFile()) {
      files.push({ rel, full, bytes: statSync(full).size });
    }
  }
  return files;
}

// Cap-gate validation, before anything is copied.
const shotDir = join(here, 'screenshots');
const shotNames = existsSync(shotDir)
  ? readdirSync(shotDir).filter((name) => statSync(join(shotDir, name)).isFile()).sort()
  : [];
if (shotNames.length === 0) fail('no screenshots in screenshots/');
if (shotNames.length > CAPS.screenshotsMax) {
  fail(`${shotNames.length} screenshots, cap is ${CAPS.screenshotsMax}`);
}
const shotBytes = [];
for (const name of shotNames) {
  const bytes = statSync(join(shotDir, name)).size;
  if (bytes > CAPS.screenshotMaxBytes) {
    fail(`screenshots/${name} is ${bytes} bytes, cap is ${CAPS.screenshotMaxBytes}`);
  }
  shotBytes.push(bytes);
}
const gameFiles = walkGame(join(here, 'game'), '', []);
if (gameFiles.length > CAPS.gameMaxFiles) {
  fail(`${gameFiles.length} files in game/, cap is ${CAPS.gameMaxFiles}`);
}
let gameBytes = 0;
for (const file of gameFiles) {
  gameBytes += file.bytes;
  if (Buffer.byteLength(file.rel, 'utf8') > CAPS.gamePathMaxBytes) {
    fail(`game/${file.rel} path is over ${CAPS.gamePathMaxBytes} bytes`);
  }
}
if (gameBytes > CAPS.gameMaxBytes) {
  fail(`game/ is ${gameBytes} bytes, cap is ${CAPS.gameMaxBytes}`);
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(shotDir)) cpSync(shotDir, join(out, 'screenshots'), { recursive: true });

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: CAPS.textMaxBytes,
    screenshots: { max: CAPS.screenshotsMax, max_bytes: CAPS.screenshotMaxBytes },
    game_max_files: CAPS.gameMaxFiles,
    game_max_bytes: CAPS.gameMaxBytes,
    game_path_max_bytes: CAPS.gamePathMaxBytes,
  }),
);

const dossierBytes = statSync(join(out, 'dossier.json')).size;
console.log(`SOLMARA -> ${out}`);
console.log(`  game: ${gameFiles.length} files, ${gameBytes} bytes`);
console.log(`  screenshots: ${shotNames.length} (${shotNames.join(', ')})`);
console.log(`  screenshot bytes: ${shotBytes.join(', ')}`);
console.log(`  dossier.json: ${dossierBytes} bytes`);
