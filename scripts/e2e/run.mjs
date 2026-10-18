// Runs end-to-end checks one after another and prints a tally per script.
//   node scripts/e2e/run.mjs            every script on this branch
//   node scripts/e2e/run.mjs 1.3        one release's scripts
//   node scripts/e2e/run.mjs resume     scripts whose name contains "resume"
// See docs/e2e.md. Build first (`npm run build`); set FIREFOX if Firefox isn't in its usual place.
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { S } from './lib.mjs';

/** The scripts that check each release, in the order to run them. */
const RELEASES = {
  '1.2': ['menu-firefox', 'alt-firefox', 'drop-firefox', 'media-firefox'],
  '1.3': ['resume-firefox', 'progress-bars-firefox', 'watched-firefox'],
  '1.4': ['stop-point-firefox', 'sort-firefox', 'filter-firefox', 'playlist-firefox'],
  '1.5': ['shelf-firefox', 'share-firefox'],
};

const exists = (name) => fs.existsSync(path.join(S, `${name}.mjs`));
const all = Object.values(RELEASES).flat().filter(exists);
const args = process.argv.slice(2);
const chosen = args.length === 0 ? all : args.flatMap((a) => RELEASES[a]?.filter(exists) ?? all.filter((n) => n.includes(a)));
if (chosen.length === 0) {
  console.error(`No e2e scripts match ${args.join(' ')}. On this branch: ${all.join(', ')}`);
  process.exit(2);
}

const tally = [];
for (const name of [...new Set(chosen)]) {
  console.log(`\n━━ ${name} ━━`);
  const started = Date.now();
  const output = await new Promise((resolve) => {
    let text = '';
    const child = spawn(process.execPath, [path.join(S, `${name}.mjs`)], { stdio: ['ignore', 'pipe', 'inherit'] });
    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      text += chunk;
    });
    child.on('close', (code) => resolve({ text, code }));
  });
  const counts = /(\d+)\/(\d+) passed/.exec(output.text);
  tally.push({ name, passed: counts ? Number(counts[1]) : 0, total: counts ? Number(counts[2]) : 0, ok: output.code === 0 && Boolean(counts), seconds: Math.round((Date.now() - started) / 1000) });
}

console.log('\n━━ Summary ━━');
for (const t of tally) console.log(`${t.ok ? 'PASS' : 'FAIL'}  ${t.name.padEnd(24)} ${String(t.passed).padStart(3)}/${String(t.total).padEnd(3)} ${t.seconds}s`);
process.exitCode = tally.every((t) => t.ok) ? 0 : 1;
