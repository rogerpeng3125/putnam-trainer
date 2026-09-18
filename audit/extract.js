/* Blinded problem extraction for the difficulty auditor.  node audit/extract.js
   Writes audit/blinded.json (what the auditor sees) and audit/key.json (the answer key, which the
   auditor must never see).

   Why blinding: research on LLM item-difficulty estimation finds models conflate provenance with item
   properties -- a problem labelled "Putnam A6" gets rated hard because of the label. Stripping the
   label is what makes the audit an independent signal rather than an echo of the seed table.

   Blinding removes structured provenance (source, bucket, tier, pid) AND scrubs contest names from the
   prose, since solutions written for a unit often mention where the problem came from. Every scrub is
   reported so the blinding itself stays auditable. */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const OUT = __dirname;

/* ---------- load units the same way the app does ---------- */

const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const contentFiles = [...indexHtml.matchAll(/<script src="(content\/[^"]+)"><\/script>/g)].map(m => m[1]);

const sandbox = { console: { log() {}, warn() {}, error() {} }, localStorage: { getItem: () => null, setItem() {} } };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ['js/rating.js', 'js/state.js', 'js/session.js', ...contentFiles]) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
}
const PT = sandbox.window.PT;

/* ---------- scrubbing ---------- */

// Anything that could betray provenance in free prose.
const SCRUB = [
  /\bPutnam\b/gi,
  /\bAIME\b/gi,
  /\bAMC\s*(8|10|12)?\b/gi,
  /\bUSA?J?MO\b/gi,
  /\bIMO\b/gi,
  /\bShortlist\b/gi,
  /\bolympiad\b/gi,
  /\bChina TST\b/gi,
  /\bKorea\b/gi,
  // Contest-position labels like "A6", "B--1", "problem 3/6", used in prose.
  /\b[AB]\s*-{0,2}\s*[1-6]\b/g,
  /\bproblem\s+\d\s*\/\s*\d\b/gi,
  // Our own cross-references, which encode tier via the pid prefix.
  /\b\d\.\d\.\d-[a-z]\d{2}\b/gi,
  /\b(drill|warmup|core tier|stretch tier)\b/gi,
  // Kill any stray URL.
  /https?:\/\/\S+/g
];

/* Whole paragraphs get dropped, not word-redacted, when they reference course-internal material.
   The first audit caught this: solutions ending "From the lecture..." or "the same move as in exercise
   c05" reliably separate authored exercises from sourced problems, which is the very signal blinding
   exists to remove. Word-level redaction also leaks through leftovers — "What to take from an
   [REDACTED]" still discloses that a contest name was there. Dropping the paragraph is cleaner, and
   these are pedagogical asides rather than part of the mathematics. */
const DROP_PARAGRAPH = [
  /\[REDACTED\]/,
  // \s+ (not a literal space) because authored HTML wraps mid-sentence across lines in the .js source --
  // a literal space in these patterns silently fails to match "the\nlecture", letting the reference
  // through. This cost a real audit run: 2.1.3-d05's "stated in the\nlecture" survived blinding entirely
  // because of this exact gap.
  /\bthe\s+lecture\b/i,
  /\bthis\s+(unit|problem\s+set|bank)\b/i,
  /\byour\s+(topic|unit|bank)\b/i,
  // Narrow, not bare "corollary": a numbered reference like "corollary 3" points at the lecture's own
  // enumerated list and is course-internal, but "corollary" alone is ordinary math vocabulary (as in
  // "Cauchy-Schwarz's AM-HM corollary") and must not be dropped. An earlier version of this pattern was
  // bare /\bcorollar(y|ies)\b/i, which silently deleted a whole hint that used the word normally.
  /\bcorollar(y|ies)\s+#?\d+\b/i,
  /\bsection\s+\d+\.\d+/i,
  /\b(exercise|problem|drill)\s+[cdwp]?\d+\b/i,
  /\bworked\s+example\b/i,
  /\bproblem\s+bank\b/i,
  // Bare unit ids like "2.1.2" or "unit 2.1.3", used in prose as a cross-reference even without the
  // pid's [a-z]\d{2} suffix (which the SCRUB list below already catches).
  /\b\d\.\d\.\d\b/,
  // A method-forbidding parenthetical ("Do not use Cauchy-Schwarz") reveals that the problem is a
  // deliberately-paired teaching twin of another item elsewhere in the bank that solves it the intended
  // way -- an authored-vs-sourced signal, same category as a lecture cross-reference.
  /\bdo not use\b/i
];

/* Years that plausibly name a contest edition ("as in the 2019 Putnam...") are provenance and must be
   scrubbed from prose. But a year-shaped number can also BE the mathematics -- Putnam 2019 A3 asks about
   a degree-2019 polynomial, so "2019" appears a dozen times as the actual problem parameter, always
   inside $...$ or $$...$$. Testing the raw text against a bare year regex nuked that problem's entire
   statement, every hint, and the solution, since every paragraph contained a "year". Kept separate from
   SCRUB (rather than just narrowing the regex) so the paragraph-drop test can special-case it: a year
   is only a leak when it sits outside math markup. (No separate inline-scrub handling is needed --
   any part that leaks a year outside math is already dropped wholesale by the paragraph filter below,
   same as every other SCRUB pattern, so nothing containing a real leak ever reaches the inline pass.) */
const YEAR_RE = /\b(19[5-9]\d|20[0-2]\d)\b/g;

function mathRanges(s) {
  const ranges = [];
  const re = /\$\$[\s\S]*?\$\$|\$[^$]*?\$/g;
  let m;
  while ((m = re.exec(s))) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}
function insideAnyRange(ranges, idx) {
  return ranges.some(([a, b]) => idx >= a && idx < b);
}
function yearLeaksOutsideMath(s) {
  const ranges = mathRanges(s);
  YEAR_RE.lastIndex = 0;
  let m;
  while ((m = YEAR_RE.exec(s))) {
    if (!insideAnyRange(ranges, m.index)) return true;
  }
  return false;
}

let scrubCount = 0;
let droppedParagraphs = 0;
const scrubLog = [];

/* "the seed inequality" is house style for x^2 >= 0 and appears only in the authored prose, so its
   presence/absence cleanly separates authored from sourced. Normalise the wording instead of dropping
   the paragraph, since these sentences carry the actual mathematics.
   Order matters: longer phrases must come before their sub-strings, or "the seed inequality" gets
   half-replaced by the bare "the seed" rule first and comes out "the basic inequality inequality". The
   final bare-word rules exist because "seed" is also used as a plain noun ("the same seed", "all three
   seeds") without the word "inequality" attached -- an audit run caught the previous version of this list
   (which mapped bare "seed" to just "basic", and had no plural rule at all) producing "the same basic to
   the pairs" and leaving "seeds" completely unscrubbed. */
const NORMALISE = [
  [/\bthe seed inequality\b/gi, 'the basic inequality'],
  [/\bthe seeds\b/gi, 'the basic inequalities'],
  [/\bseed inequalities\b/gi, 'basic inequalities'],
  [/\bseed inequality\b/gi, 'basic inequality'],
  [/\bthe seed\b/gi, 'the basic inequality'],
  [/\bseeds\b/gi, 'basic inequalities'],
  [/\bseed\b/gi, 'basic inequality']
];

function scrub(text, where) {
  if (!text) return text;

  // Split on paragraph boundaries, keeping the delimiter, and drop offending paragraphs outright.
  // Paragraphs are tested against BOTH lists: a paragraph naming a contest is dropped rather than
  // word-redacted, because redaction leaves tells like "What to take from an ." behind.
  const parts = text.split(/(?<=<\/p>)/);
  const kept = parts.filter(part => {
    if (!part.trim()) return false;
    if (DROP_PARAGRAPH.some(re => re.test(part)) || yearLeaksOutsideMath(part) ||
        SCRUB.some(re => { re.lastIndex = 0; return re.test(part); })) {
      droppedParagraphs++;
      scrubLog.push({ where, removed: '[whole paragraph]' });
      return false;
    }
    return true;
  });
  let out = kept.join('');

  // Anything not inside a <p> (hints are bare strings) still needs word-level handling.
  for (const re of SCRUB) {
    out = out.replace(re, m => {
      scrubCount++;
      scrubLog.push({ where, removed: m });
      return '';
    });
  }
  // Preserve capitalisation: a sentence-initial "The seed inequality..." must become "The basic
  // inequality...", not "the basic inequality...". A flat-string replacement here previously lowercased
  // sentence starts, which an audit run read as a lead-in clause having been silently cut.
  for (const [re, replacement] of NORMALISE) {
    out = out.replace(re, m => (/^[A-Z]/.test(m) ? replacement[0].toUpperCase() + replacement.slice(1) : replacement));
  }

  return out;
}

/* ---------- build the two files ---------- */

// Opaque, stable ids. Sorted by a hash of the pid so ordering leaks nothing about tier either.
function hashId(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

const blinded = [];
const key = [];

for (const u of PT.state.units()) {
  for (const p of u.problems || []) {
    const id = 'X' + hashId(p.pid);
    blinded.push({
      id,
      topic: u.title,           // the technique is legitimate context, not provenance
      statement: scrub(p.statement, p.pid + '.statement'),
      // Drop hints emptied by blinding rather than leaving "" behind — an empty hint reads as a
      // deletion, which is itself a signal, and the first audit flagged exactly that.
      hints: (p.hints || []).map((h, i) => scrub(h, p.pid + '.hint' + i)).filter(h => h && h.trim()),
      solution: scrub(p.solution, p.pid + '.solution'),
      altSolution: scrub(p.altSolution, p.pid + '.altSolution')
    });
    key.push({
      id,
      pid: p.pid,
      unitId: u.id,
      tier: p.tier,
      bucket: p.bucket,
      authored: !!(p.source && p.source.authored),
      seedRating: Math.round(PT.rating.seedFor(p.bucket)),
      source: p.source || null
    });
  }
}

blinded.sort((a, b) => (a.id < b.id ? -1 : 1));

fs.writeFileSync(path.join(OUT, 'blinded.json'), JSON.stringify(blinded, null, 2));
fs.writeFileSync(path.join(OUT, 'key.json'), JSON.stringify(key, null, 2));

console.log(`Wrote ${blinded.length} blinded problems to audit/blinded.json`);
console.log(`Wrote the answer key to audit/key.json (the auditor must not read this)`);
console.log(`Dropped ${droppedParagraphs} course-internal paragraph(s); redacted ${scrubCount} inline mention(s).`);

// Course-internal cross-references separate authored from sourced problems just as effectively as a
// contest name, so treat surviving ones as blinding failures too.
const crossRef = blinded.filter(b => DROP_PARAGRAPH.some(re => re.test(JSON.stringify(b))));
if (crossRef.length) {
  console.log(`\nFAIL: course-internal references survive in ${crossRef.length} item(s): ${crossRef.map(c => c.id).join(', ')}`);
  process.exit(1);
}

// Fail loudly if anything obviously identifying survived.
// Word boundaries matter: a bare /AIME/ matches "clAIMEd", and /IMO/ matches "optIMOm"-style words.
const leak = blinded.filter(b =>
  /\bPutnam\b|\bAIME\b|\bUSAMO\b|\bUSAJMO\b|\bIMO\b|\bShortlist\b|artofproblemsolving|kskedlaya|huggingface/i
    .test(JSON.stringify(b)));
if (leak.length) {
  console.log(`\nFAIL: provenance survived blinding in ${leak.length} item(s): ${leak.map(l => l.id).join(', ')}`);
  process.exit(1);
}
console.log('Blinding check passed: no provenance markers survive in blinded.json.');

if (scrubLog.length) {
  console.log('\nRedactions by field:');
  const byWhere = {};
  for (const s of scrubLog) (byWhere[s.where] ||= []).push(s.removed);
  for (const [w, list] of Object.entries(byWhere)) console.log(`  ${w}: ${list.join(', ')}`);
}
