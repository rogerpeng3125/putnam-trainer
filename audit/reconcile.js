/* Reconcile the blind audit against known contest-position seeds.  node audit/reconcile.js

   This is the step that decides whether the audit is worth anything.

   Contest problems already have a defensible difficulty from their contest position. Those act as
   held-out ground truth: if the auditor -- which never saw provenance -- recovers their ordering, its
   judgment has earned some trust. If it does not, its opinions are noise and must be ignored, including
   on the authored problems where no other signal exists.

   That is the whole point: trust is CALIBRATION-GATED, not assumed. This script never writes to the
   app's rating state. It produces a report; a human decides what to do with it. */

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const read = f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));

let audit;
try { audit = read('audit-results.json'); } catch {
  console.log('No audit/audit-results.json found. Run the difficulty-auditor agent first.');
  process.exit(1);
}
const key = read('key.json');
const keyById = Object.fromEntries(key.map(k => [k.id, k]));

const rows = audit
  .filter(a => keyById[a.id])
  .map(a => ({ ...a, ...keyById[a.id], delta: a.rating - keyById[a.id].seedRating }));

const missing = key.filter(k => !audit.some(a => a.id === k.id));

/* ---------- Spearman rank correlation ---------- */

function ranks(xs) {
  const idx = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;           // average rank for ties
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

/* ---------- calibration on contest problems ---------- */

const contest = rows.filter(r => !r.authored);
const authored = rows.filter(r => r.authored);

console.log(`Audited ${rows.length} problems — ${contest.length} contest (ground truth available), ${authored.length} authored.`);
if (missing.length) console.log(`WARNING: ${missing.length} problem(s) were not graded: ${missing.map(m => m.id).join(', ')}`);

console.log('\n=== CALIBRATION (contest problems only) ===');

if (contest.length < 3) {
  console.log('Too few contest problems to calibrate. Treat all audit output as unvalidated.');
} else {
  const rho = spearman(contest.map(r => r.rating), contest.map(r => r.seedRating));
  const mae = contest.reduce((s, r) => s + Math.abs(r.delta), 0) / contest.length;
  const bias = contest.reduce((s, r) => s + r.delta, 0) / contest.length;

  const hi = contest.filter(r => r.confidence === 'high');
  const rhoHi = hi.length >= 3 ? spearman(hi.map(r => r.rating), hi.map(r => r.seedRating)) : null;

  console.log(`  Spearman rho vs contest-position seeds : ${rho === null ? 'n/a' : rho.toFixed(3)}  (n=${contest.length})`);
  if (rhoHi !== null) console.log(`  ... restricted to high-confidence          : ${rhoHi.toFixed(3)}  (n=${hi.length})`);
  console.log(`  Mean absolute error                    : ${Math.round(mae)} rating points`);
  console.log(`  Mean signed bias                       : ${bias >= 0 ? '+' : ''}${Math.round(bias)} (positive = audit rates harder than position)`);

  let verdict;
  if (rho === null) verdict = 'UNKNOWN';
  else if (rho >= 0.7 && mae <= 250) verdict = 'TRUSTWORTHY';
  else if (rho >= 0.4) verdict = 'WEAK';
  else verdict = 'UNTRUSTWORTHY';

  console.log(`\n  VERDICT: ${verdict}`);
  const guidance = {
    TRUSTWORTHY: 'The auditor recovers known difficulty ordering. Its estimates on authored problems are\n           earned and reasonable to adopt as starting ratings.',
    WEAK: 'The auditor tracks ordering only loosely. Use it to FLAG outliers for human review,\n           not to set ratings. Do not adopt its authored-problem estimates wholesale.',
    UNTRUSTWORTHY: 'The auditor does not recover known ordering. Ignore its numbers entirely, including on\n           authored problems. The qualitative "hardest step" notes may still be useful.',
    UNKNOWN: 'Not enough data to judge.'
  }[verdict];
  console.log(`           ${guidance}`);
  if (Math.abs(bias) > 150) {
    console.log(`\n  NOTE: a systematic bias of ${Math.round(bias)} points suggests the band table is mis-anchored\n        rather than the ordering being wrong. Ordering (rho) matters more than absolute level.`);
  }
}

/* ---------- divergences: the actually interesting output ---------- */

console.log('\n=== LARGEST DIVERGENCES (contest problems) ===');
console.log('These are problems whose content reads harder or easier than their contest position implies —');
console.log('exactly the within-position variation that contest position cannot capture.\n');

const diverged = contest.slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 10);
for (const r of diverged) {
  const src = r.source || {};
  const label = src.contest ? `${src.contest} ${src.year || ''} ${src.number || ''}`.trim() : r.bucket;
  const dir = r.delta > 0 ? 'HARDER' : 'easier';
  console.log(`  ${String(r.delta >= 0 ? '+' + r.delta : r.delta).padStart(6)}  ${r.pid.padEnd(12)} seed ${r.seedRating} -> audit ${r.rating}  [${r.confidence}]  ${dir} than position`);
  console.log(`          ${label}`);
  console.log(`          hardest step: ${r.hardestStep}`);
}

/* ---------- authored problems ---------- */

if (authored.length) {
  console.log('\n=== AUTHORED PROBLEMS (no ground truth; all currently seeded at the drill floor) ===');
  console.log('Adopt these only if the verdict above is TRUSTWORTHY.\n');
  for (const r of authored.slice().sort((a, b) => a.rating - b.rating)) {
    console.log(`  ${r.pid.padEnd(12)} tier=${r.tier.padEnd(7)} seed ${r.seedRating} -> audit ${r.rating} [${r.confidence}]`);
    console.log(`          hardest step: ${r.hardestStep}`);
  }
}

/* ---------- flags ---------- */

const flagged = rows.filter(r => (r.flags || []).length);
if (flagged.length) {
  console.log('\n=== FLAGS RAISED ===');
  for (const r of flagged) {
    console.log(`  ${r.pid}: ${r.flags.join(', ')}`);
    if (r.notes) console.log(`          ${r.notes}`);
  }
}

/* ---------- machine-readable report ---------- */

fs.writeFileSync(path.join(DIR, 'reconciled.json'), JSON.stringify(rows, null, 2));
console.log('\nWrote audit/reconciled.json (audit joined to provenance).');
console.log('Nothing was written to the app\'s rating state. Adopting any of this is a human decision.');
