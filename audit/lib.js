/* Shared helpers for the audit tools: loading, joining, and calibration statistics. */

const fs = require('fs');
const path = require('path');

const DIR = __dirname;

function read(f) {
  return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
}

function load() {
  let audit;
  try { audit = read('audit-results.json'); } catch {
    console.log('No audit/audit-results.json found. Run: node audit/extract.js, then the difficulty-auditor agent.');
    process.exit(1);
  }
  const key = read('key.json');
  const keyById = Object.fromEntries(key.map(k => [k.id, k]));
  const rows = audit
    .filter(a => keyById[a.id])
    .map(a => ({ ...a, ...keyById[a.id], delta: a.rating - keyById[a.id].seedRating }));
  const missing = key.filter(k => !audit.some(a => a.id === k.id));
  return { rows, missing, key };
}

function ranks(xs) {
  const idx = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

function spearman(a, b) {
  if (a.length < 3) return null;
  const ra = ranks(a), rb = ranks(b);
  const n = a.length;
  const mean = xs => xs.reduce((s, x) => s + x, 0) / n;
  const ma = mean(ra), mb = mean(rb);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : null;
}

/* Calibration against contest-position seeds, which are the only held-out ground truth available.
   This is not a judgment call for the user to make -- it is a sanity check that the audit run itself
   was not broken. A run that cannot recover known ordering is a malfunction, not an opinion. */
function calibrate(rows) {
  const contest = rows.filter(r => !r.authored);
  if (contest.length < 3) {
    return { verdict: 'UNKNOWN', n: contest.length, rho: null, mae: null, bias: null };
  }
  const rho = spearman(contest.map(r => r.rating), contest.map(r => r.seedRating));
  const mae = contest.reduce((s, r) => s + Math.abs(r.delta), 0) / contest.length;
  const bias = contest.reduce((s, r) => s + r.delta, 0) / contest.length;

  let verdict;
  if (rho === null) verdict = 'UNKNOWN';
  else if (rho >= 0.7 && mae <= 250) verdict = 'TRUSTWORTHY';
  else if (rho >= 0.4) verdict = 'WEAK';
  else verdict = 'UNTRUSTWORTHY';

  return { verdict, n: contest.length, rho, mae, bias, contest };
}

module.exports = { read, load, spearman, calibrate, DIR };
