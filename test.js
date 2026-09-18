/* Test suite. Run with:  node test.js
   Exits non-zero on failure, so it can gate a commit.

   Loads the app's logic layer outside a browser and checks the invariants that are easy to break
   silently while writing content. Content files are discovered from index.html, so a unit that was
   written but never registered will be caught here rather than by you noticing it missing in the UI. */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
let failures = 0;
let checks = 0;

function check(ok, label, detail) {
  checks++;
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  return ok;
}
function section(name) { console.log(`\n--- ${name} ---`); }

/* ---------- load ---------- */

const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const contentFiles = [...indexHtml.matchAll(/<script src="(content\/[^"]+)"><\/script>/g)].map(m => m[1]);

const onDisk = fs.existsSync(path.join(ROOT, 'content'))
  ? fs.readdirSync(path.join(ROOT, 'content')).filter(f => f.endsWith('.js')).map(f => 'content/' + f)
  : [];

const store = {};
const sandbox = {
  console: { log: () => {}, warn: () => {}, error: (...a) => console.log('  [app error]', ...a) },
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); }
  }
};
// In a browser, window IS the global object; mirror that so bare `PT` resolves as it does on the page.
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const f of ['js/rating.js', 'js/state.js', 'js/session.js', ...contentFiles]) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
}

const PT = sandbox.window.PT;
PT.state.load();
const units = PT.state.units();

console.log(`Loaded ${units.length} unit(s) from index.html: ${units.map(u => u.id).join(', ')}`);

/* ---------- registration ---------- */

section('unit registration');
for (const f of onDisk) {
  check(contentFiles.includes(f), 'content file is registered in index.html', f);
}

/* ---------- seed table ---------- */

section('seed formula');
/* Every seed must reproduce from rating(w) = 1300 + (w - 0.5) * 136.84, where w is the midpoint of the
   AoPS competition-ratings range. Keep this table in sync with build-instructions.md. */
const W = {
  'amc12-1-10': 1.5, 'amc12-11-20': 3.0, 'amc12-21-25-easier': 3.5, 'amc12-21-25-harder': 4.75,
  'aime-1-5': 2.25, 'aime-6-9': 3.75, 'aime-10-12': 5.0, 'aime-13-15': 6.0,
  'usajmo-1-4': 4.75, 'usajmo-2-5': 6.25, 'usajmo-3-6': 7.0,
  'usamo-1-4': 6.5, 'usamo-2-5': 7.5, 'usamo-3-6': 8.5,
  'putnam-12': 7.0, 'putnam-34': 8.0, 'putnam-56': 9.0,
  'isl-1-2': 6.25, 'isl-3-4': 7.0, 'isl-5-6': 8.5, 'isl-7plus': 9.25,
  'imo-1-4': 6.5, 'imo-2-5': 7.5, 'imo-3-6': 9.5,
  'korea-1-4': 7.0, 'korea-2-5': 7.75, 'korea-3-6': 8.5,
  'chinatst-1-4': 8.25, 'chinatst-2-5': 9.0, 'chinatst-3-6': 9.75,
  'drill': 0.5
};
const slope = (2600 - 1300) / (10 - 0.5);
for (const [k, w] of Object.entries(W)) {
  const expected = Math.round(1300 + (w - 0.5) * slope);
  check(Math.abs((PT.rating.SEEDS[k] ?? NaN) - expected) <= 1,
    'seed reproduces from formula', `${k}: table=${PT.rating.SEEDS[k]} formula=${expected}`);
}
for (const k of Object.keys(PT.rating.SEEDS)) {
  check(k in W, 'seed is documented in the formula table', k);
}

/* ---------- per-problem content rules ---------- */

section('problem content');
const seenPids = new Set();
const band = r => (r < 1600 ? 'warmup' : r < 2000 ? 'core' : 'stretch');

for (const u of units) {
  for (const p of u.problems || []) {
    const at = `${p.pid}`;
    check(!seenPids.has(p.pid), 'pid is unique', at);
    seenPids.add(p.pid);
    check(['warmup', 'core', 'stretch'].includes(p.tier), 'tier is valid', at);
    check(PT.rating.SEEDS[p.bucket] != null, 'bucket exists in the seed table', `${at} bucket=${p.bucket}`);
    check(!!p.statement, 'has a statement', at);
    check(!!p.solution, 'has a solution', at);
    check(Array.isArray(p.hints) && p.hints.length >= 1, 'has at least one hint', at);

    const authored = !!(p.source && p.source.authored);
    if (authored) {
      check(!p.source.contest, 'authored problem has no contest attribution', at);
      check(p.tier !== 'stretch', 'authored problem is not in the stretch tier', at);
      check(p.bucket === 'drill', 'authored problem uses the drill bucket', at);
    } else {
      check(!!(p.source && p.source.contest), 'contest problem names its contest', at);
      check(!!(p.source && p.source.url), 'contest problem has a source url', at);
      // Once a problem is audited the audit rating governs, so the stored tier is authoring intent
      // rather than a claim about difficulty; drift is reported below, not failed. Un-audited contest
      // problems are still held to their contest-position band.
      if (!PT.state.hasAuditRating(p.pid)) {
        const r = PT.state.problemRating(p);
        check(band(r) === p.tier, 'tier matches rating band',
          `${at} tier=${p.tier} rating=${Math.round(r)} band=${band(r)}`);
      }
    }
  }
}

/* ---------- hints are never a cost ---------- */

section('hints cost nothing');
const cleanCredit = PT.rating.outcomeByKey('clean').xpCredit;
const hintedCredit = PT.rating.outcomeByKey('hinted').xpCredit;
for (const e of [0.1, 0.3, 0.5, 0.7, 0.9]) {
  check(PT.rating.xpFor(e, hintedCredit) === PT.rating.xpFor(e, cleanCredit),
    'hinted solve pays the same XP as a clean solve', `E=${e}`);
}
check(PT.rating.outcomeByKey('hinted').s < PT.rating.outcomeByKey('clean').s,
  'a hint still lowers the rating score (honest measurement)');

/* ---------- session + persistence ---------- */

section('session and persistence');
for (const u of units) {
  const picks = PT.session.build(u.id);
  check(picks.length > 0, 'session builds a non-empty queue', u.id);
  check(new Set(picks.map(p => p.pid)).size === picks.length, 'session has no duplicates', u.id);
}

const firstUnit = units[0];
if (firstUnit) {
  const before = PT.state.get().xp;
  const res = PT.state.recordAttempt(firstUnit.problems[0].pid, 'clean');
  check(!!res, 'an attempt is recorded');
  check(PT.state.get().xp > before, 'recording an attempt awards XP');

  const json = PT.state.exportJson();
  PT.state.reset();
  check(PT.state.get().xp === 0, 'reset clears progress');
  PT.state.importJson(json);
  check(PT.state.get().xp > 0, 'import restores progress');
}

/* ---------- spread report (informational) ---------- */

section('bank spread (informational, not a failure)');
for (const u of units) {
  const t = { warmup: 0, core: 0, stretch: 0 };
  let audited = 0, drift = 0;
  for (const p of u.problems || []) {
    t[PT.state.tierOf(p)]++;
    if (PT.state.hasAuditRating(p.pid)) {
      audited++;
      if (PT.state.tierOf(p) !== p.tier) drift++;
    }
  }
  const total = (u.problems || []).length;
  console.log(`  ${u.id}: ${total} problems — warmup ${t.warmup}/5, core ${t.core}/12, stretch ${t.stretch}/8`);
  console.log(`         ${audited}/${total} audited; ${drift} moved tier vs the authored intent`);
}

/* ---------- result ---------- */

console.log(`\n${failures ? 'FAILED' : 'PASSED'}: ${checks - failures}/${checks} checks`);
process.exit(failures ? 1 : 0);
