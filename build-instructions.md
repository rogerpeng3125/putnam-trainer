# Build Instructions

How a topic from `topics.md` becomes a unit in `content/`.

**This file is meant to be edited.** It encodes taste, not law. After the first couple of units,
change the numbers and the lecture structure to whatever actually works. The build process reads
this file every time, so edits take effect on the next unit with no other changes needed.

---

## The command

> "build the next unit" — take the first `[ ]` row in `topics.md` (top-to-bottom order, skipping `[-]`).
>
> "build 5.2.3" / "build Modular Arithmetic" — take that specific row.

Then: research → write `content/<id>-<slug>.js` → add its `<script>` tag to `index.html` → flip the
row in `topics.md` to `[x]`.

---

## Research recipe — do it in this order

Learned the slow way while building 2.1.2. Following this is roughly an order of magnitude faster than
fetching sources page by page.

**1. Pull the archives down once, then search locally.** Never fetch Putnam year by year.

```powershell
# Putnam problems + official solutions, 1995-2024 (60 files, ~30s)
foreach ($y in 1995..2024) { foreach ($s in @('','s')) {
  Invoke-WebRequest "https://kskedlaya.org/putnam-archive/$y$s.tex" -OutFile "$dir\$y$s.tex" -UseBasicParsing } }

# AIME 1983-2024, 933 problems with year / part / number / official answer
Invoke-WebRequest "https://huggingface.co/datasets/gneubig/aime-1983-2024/resolve/main/AIME_Dataset_1983_2024.csv" -OutFile "$dir\aime.csv"
```

Put them in the scratchpad. Re-downloading each session is cheap; vendoring them into the repo is not
worth it.

**2. Search Putnam *solutions*, not problems.** This is the single biggest time-saver. A problem
statement rarely announces its technique, but the official solution names it. Grep `*s.tex` for the
technique's fingerprints — `AM-GM`, `completing the square`, `discriminant`, `sum of squares`,
`(x-y)^2` — then map hits back to the problem file by year and label. This surfaced Putnam 2004 A6,
whose statement looks like heavy analysis and whose solution is one line of SOS.

Beware `nonnegative` as a search term — it produced mostly false positives.

**3. Score the AIME CSV with a script, don't skim it.** Write a `.py` file (regexes get mangled through
`python -c` in PowerShell). Score on optimization words + algebraic shape, and **subtract** for
`triangle|circle|probability|permutation` — geometry and counting problems dominate AIME and will bury
the algebra otherwise.

**4. Expect the core band to be thin.** Set expectations early: Putnam is structurally 2190+, so the
1600–2000 band can only come from AIME #6–12. For a narrow technique that may yield almost nothing
(2.1.2 found two problems across all 933). Plan on authored core exercises rather than discovering the
shortfall at the end.

**5. Verify as you go, not at the end.** For AIME, derive the answer and check it against the CSV
immediately — a mismatch means drop it, and you want to know before writing the solution prose.

## Unit build checklist

Work through this in order; the last three are the ones most easily forgotten.

- [ ] Lecture: idea → tool → 3–5 worked examples with *how you'd find this* → cues → traps
- [ ] Problems sourced and verified; every contest URL confirmed to resolve
- [ ] Authored problems verified per the rules below, marked `source: { authored: true }`, bucket `drill`
- [ ] `pid`s unique and stable (`<unit>-d01` authored warmup, `-c01` authored core, `-w01`/`-p01` contest)
- [ ] Every field containing math wrapped in `String.raw`
- [ ] **Tier matches the rating band** for contest problems (warmup <1600, core <2000, stretch ≥2000).
      Set `tier` from the computed seed, not from how hard it feels.
- [ ] **`<script>` tag added to `index.html`** — an unregistered unit silently does not exist
- [ ] **`node test.js` passes**
- [ ] `topics.md` row flipped to `[x]` with the problem count

## Audience calibration

Write for a strong AIME solver (max score ~9) with **no olympiad background** and **no linear algebra**.

This means:
- Computational fluency can be assumed. Proof-writing fluency **cannot**.
- The first time a proof technique appears, show the shape of the argument explicitly — what is
  assumed, what is being shown, why the steps connect. Don't just say "clearly."
- *Putnam and Beyond* is the reference, but the lecture should be **more gradual than the book**.
  The book's own exposition is the ceiling, not the target. If the book opens a section with a hard
  example, build up to that example instead of leading with it.
- Never use linear algebra (matrices, determinants, eigenvalues, vector spaces) in a solution, even
  when it would be slicker. If a problem's natural solution needs it, pick a different problem.

---

## Lecture structure

Target **900–1400 words**, in this order:

1. **The idea in one paragraph.** What is the technique, and what kind of problem does it crack?
   Plain language before any notation.
2. **The core tool**, stated precisely — the inequality, theorem, or identity, with hypotheses spelled out.
   Include a short proof or proof sketch when it's instructive; skip it when it's machinery.
3. **Three to five worked examples**, in increasing difficulty. Each one gets:
   - the problem statement,
   - a short *"how you'd find this"* paragraph — the motivation and false starts, not just the clean
     writeup. **This is the highest-value part of the lecture.** The book omits it and that omission is
     exactly what makes the book feel like it jumps.
   - the clean solution.
4. **Recognition cues.** A short list: "reach for this when you see …". Concrete syntactic triggers
   (a symmetric sum, a constraint like $abc = 1$, an integer-valued expression that must be bounded).
5. **Common traps.** Two or three specific ways this technique gets misapplied.

## Problem set

**~25 problems** per unit, spread:

| Tier | Count | Target rating | Purpose |
|---|---|---|---|
| Warmup | 5 | 1300–1600 | Mechanical application of the tool. Should be solvable in a few minutes. |
| Core | 12 | 1600–2000 | The working range. One real idea each. |
| Stretch | 8 | 2000–2400 | Genuine olympiad/Putnam difficulty. Expect these to be hard. |

Rules:
- **Contest problems must be real and sourced** — contest, year, problem number, and a URL that
  resolves. Never write a contest problem or its solution from memory.
- **Authored teaching problems are allowed** in the warmup tier. See below.
- Prefer variety of *source* — AIME, olympiad, Putnam — not just Putnam.
- No problem may require linear algebra, or any topic still marked `[-]` in `topics.md`.

### Authored teaching problems

Real archives skew hard — the usable ones start around 1900 — so a mechanical rep that drills the
lecture's tool often exists in no archive and has to be written. That is permitted, with conditions.

**Where they may be used:** the **warmup and core** tiers. Stretch stays real contest problems — that
tier exists to expose you to genuine competition difficulty, which cannot be simulated.

Core is open to authored problems because for many topics no real source exists in the 1600–2000 band:
Putnam is structurally 2190+, and AIME #6–12 is the only real option, which for a narrow technique may
yield almost nothing. (Unit 2.1.2 found exactly two AIME problems in that band.) An authored core
problem should be **multi-step** — chaining two applications of the tool, or a substitution followed by
a bound — not a longer drill.

**Verification is the price of authoring one.** "Verified" means the mathematics was actually checked,
not merely that the problem was composed carefully:

1. Work the solution through completely. Do not sketch it.
2. Check the equality/extremal case actually occurs, and at the claimed point.
3. Try to break it — degenerate values, sign flips, boundary cases, and (for "for all $x$" claims) at
   least one concrete substitution.
4. Confirm it genuinely exercises *this unit's* tool. If it can be solved more naturally by a different
   technique, it belongs in a different unit or nowhere. This is the check the user specifically asked
   for: the problem must actually work with the topic.

**How they are marked:** `bucket: 'drill'` and `source: { authored: true }` — never a fabricated contest
attribution. The UI labels these "Teaching drill" rather than showing a contest name.

**Rating.** *All* authored problems — warmup and core alike — go in the `drill` bucket at 1300, which is
`rating(0.5)`, the floor of the wiki scale. **No authored problem gets a hand-assigned difficulty**,
because assigning one would be exactly the difficulty judgment this tool exists to avoid. The bucket
starts with a much wider rating deviation than a contest bucket, so your real outcomes move it quickly,
and each problem's individual offset separates the genuinely harder ones from the drills as you attempt
them. It is a separate bucket precisely so authored problems can never drag contest-bucket calibration.

**Consequence to expect:** an authored core problem starts rated 1300 even though it is meant to be
harder, so early sessions will serve it as though it were easy. That is the deliberate trade for not
guessing. It self-corrects after a few attempts.

Because of this, an authored problem's `tier` records its **pedagogical role**, not its measured band,
and is exempt from the tier/rating-band agreement check that applies to contest problems.

## Where to search

**AoPS cannot be used as a source.** It returns HTTP 403 to all automated requests, including the
wiki, so no AoPS page can be fetched or verified. The Wayback Machine is also unavailable. This was
tested and confirmed — do not burn time retrying it.

**Rule: verified archives only.** Every problem statement, every solution, and every link in a unit
must come from a source that was actually fetched and read during that unit's build. Never write a
problem statement or a solution from recall, and never emit a link that was not confirmed to resolve.
Recall-written content is precisely the failure mode this tool exists to prevent.

Confirmed-good sources:

| Source | Covers | How to use |
|---|---|---|
| `kskedlaya.org/putnam-archive/` | Putnam 1985–2025 | Fetch `<year>.tex` for problems, `<year>s.tex` for full solutions. Verbatim LaTeX. Best source for the Putnam band. |
| `huggingface.co/datasets/gneubig/aime-1983-2024` | AIME 1983–2024, 933 problems | Download `AIME_Dataset_1983_2024.csv`. Columns: `ID, Year, Problem Number, Question, Answer, Part`. Statements in LaTeX **plus the official answer and the problem position** — so seeds are computable. **No worked solutions.** |
| `live.poshenloh.com/past-contests/aime/<year><part>/solutions` | AIME worked solutions + hints | e.g. `.../aime/2016I/solutions`. Carries full statements, worked solutions, and the site's own small/big hints, all as extractable text. Pair with the CSV. |
| `imo-official.org` | IMO | Official problem PDFs. |

Confirmed **blocked** — do not retry:

- `artofproblemsolving.com` (403, all pages including the wiki)
- `maa.org` official AMC/AIME PDFs (403)
- `web.archive.org` (unavailable to this tool)
- `hendrycks/competition_math` (the MATH dataset) — **under DMCA takedown**, and it carries no contest
  position anyway, so its problems could not be seeded even if available.
- `ryanrudes/amc` — problems are PNG images with no solutions.
- `davidaltizio.web.illinois.edu/CollectionOfAIMESolutions.pdf` — usable text, but the problems are
  AIME-*like* ones drawn from Mandelbrot, HMMT and Math League, **not actual AIME**. The wiki's AIME
  positions therefore do not apply, so these cannot be seeded. Do not treat them as AIME.

If a needed source can't be fetched, **drop the problem** — do not substitute a remembered one.
Falling short of 25 verified problems is acceptable; padding the bank with unverified ones is not.

### Mandatory answer check for AIME problems

Every AIME problem has an official numeric answer in the CSV, and that is the verification hook.
**The solution written into the unit must produce exactly that answer.** One of two routes:

1. **Derive it yourself, then check.** Work the solution fully and confirm the final answer equals the
   CSV `Answer`. For a numeric-answer problem this is a genuinely strong check — an independent
   derivation landing on the official value is hard to fake. Also verify the equality/extremal case and
   that any claimed optimum is actually *attained*, since that is the step most often skipped.
2. **Corroborate against Po-Shen Loh.** Fetch `live.poshenloh.com/past-contests/aime/<year><part>/solutions`
   and confirm its final answer matches the CSV too. Use this whenever the derivation is long or the
   problem is outside the warmup band. Note his archive does not cover the earliest AIME years.

Either way, **a mismatch means the problem is dropped**, not reconciled. Do not "resolve" a
disagreement by picking whichever answer looks right.

## Solutions

Every problem gets a written solution. Solutions must be derived from the fetched source's own
solution, not reconstructed independently.

- Rewrite it in your own words, scaffolded to the audience above. Where the archive's solution is
  terse (Kedlaya's often are), expand the reasoning — but do not substitute a different argument you
  have not verified against the source.
- **Rewriting is required, not optional, for Po-Shen Loh solutions and hints.** Those are his own
  authored work (the MAA problems are licensed to him; the write-ups are his). Use them to verify the
  mathematics and to check that your hints point the right way, then write the unit's prose yourself.
  Do not paste his text, and do not reproduce his hint wording.
- Where the source gives a genuinely different second approach worth seeing, add it as `altSolution`.
- Set `source.url` to the exact URL that was fetched, so every link in the app is one that resolves.
- **Hints are free.** Every problem gets 1–3 progressive hints. They cost nothing, are never
  gamified, and never affect XP. Write them as escalating nudges: the first names the technique
  category, the last is close to the key step.

---

## Difficulty seeding

Seed ratings come from **contest position only** — never from a subjective read of the problem.
This is the whole point of the tool: the app corrects these seeds from real solve outcomes.

**Source:** AoPS Wiki, "Competition ratings" — a standardized 0.5–10 difficulty scale (0.5 = easiest
AMC 8, 10 = hardest historical IMO-tier), giving a numeric range per competition and problem position.
The page cannot be fetched (AoPS returns 403); its text was supplied manually. Seeds below are
*computed* from that scale by the formula, not typed by hand.

Two caveats on the supplied text, recorded so this stays auditable:
- The AIME block arrived **without its heading**. It was identified as AIME because its 15 problems in
  1–5 / 6–9 / 10–12 / 13–15 groups match AIME's structure uniquely (AMC has 25 problems, USAMO and
  USAJMO have 6) and its examples are AIME-format integer-answer problems. If that attribution is
  wrong, every `aime-*` seed is wrong.
- One Putnam example statement arrived visibly corrupted ("concave set in the 7-D plane", a
  "hyperparabola $xyz=1$", followed by a definition of *convex*). Only the numeric ranges are used
  here, and those looked internally consistent — but the paste was not a clean copy of the page.

### The conversion formula

One linear map from the wiki scale onto our rating scale, applied uniformly:

```
rating(w) = 1300 + (w − 0.5) × (2600 − 1300) / (10 − 0.5)
          = 1300 + (w − 0.5) × 136.84
```

For a bucket whose wiki entry is a range, `w` is the **midpoint** of that range.

**The anchors are the one remaining judgment call, and they are stated here rather than buried:** the
wiki's declared endpoints (0.5, 10) are pinned to our scale's endpoints (1300, 2600). Our 1300–2600
range was itself chosen by hand, so it imports that one choice — but it is applied identically to every
bucket, so no bucket is individually tuned. Changing the anchors rescales all seeds together; changing
a single seed by hand is not permitted.

### Computed seeds

Every value below is `rating(midpoint of the wiki range)`. Nothing here was typed by hand.

| Bucket key | Wiki entry | Wiki range | `w` | Seed |
|---|---|---|---|---|
| `amc12-1-10` | AMC 12 1–10 | 1–2 | 1.50 | **1437** |
| `amc12-11-20` | AMC 12 11–20 | 2.5–3.5 | 3.00 | **1642** |
| `amc12-21-25-easier` | AMC 12 21–25 (Easier) | 3–4 | 3.50 | **1711** |
| `amc12-21-25-harder` | AMC 12 21–25 (Harder) | 4.5–5 | 4.75 | **1882** |
| `aime-1-5` | AIME 1–5 | 1.5–3 | 2.25 | **1539** |
| `aime-6-9` | AIME 6–9 | 3–4.5 | 3.75 | **1745** |
| `aime-10-12` | AIME 10–12 | 4.5–5.5 | 5.00 | **1916** |
| `aime-13-15` | AIME 13–15 | 5.5–6.5 | 6.00 | **2053** |
| `usajmo-1-4` | USAJMO 1/4 | 4.5–5 | 4.75 | **1882** |
| `usajmo-2-5` | USAJMO 2/5 | 6–6.5 | 6.25 | **2087** |
| `usajmo-3-6` | USAJMO 3/6 | 7 | 7.00 | **2190** |
| `usamo-1-4` | USAMO 1/4 | 6–7 | 6.50 | **2121** |
| `usamo-2-5` | USAMO 2/5 | 7–8 | 7.50 | **2258** |
| `usamo-3-6` | USAMO 3/6 | 8–9 | 8.50 | **2395** |
| `putnam-12` | Putnam A/B 1–2 | 7 | 7.00 | **2190** |
| `putnam-34` | Putnam A/B 3–4 | 8 | 8.00 | **2326** |
| `putnam-56` | Putnam A/B 5–6 | 9 | 9.00 | **2463** |
| `isl-1-2` | IMO Shortlist 1–2 | 6–6.5 | 6.25 | **2087** |
| `isl-3-4` | IMO Shortlist 3–4 | 6.5–7.5 | 7.00 | **2190** |
| `isl-5-6` | IMO Shortlist 5–6 | 8–9 | 8.50 | **2395** |
| `isl-7plus` | IMO Shortlist 7+ | 8.5–10 | 9.25 | **2497** |
| `imo-1-4` | IMO 1/4 | 6–7 | 6.50 | **2121** |
| `imo-2-5` | IMO 2/5 | 7–8 | 7.50 | **2258** |
| `imo-3-6` | IMO 3/6 | 9–10 | 9.50 | **2532** |
| `korea-1-4` | Korea Final Round 1/4 | 7 | 7.00 | **2190** |
| `korea-2-5` | Korea Final Round 2/5 | 7.5–8 | 7.75 | **2292** |
| `korea-3-6` | Korea Final Round 3/6 | 8–9 | 8.50 | **2395** |
| `chinatst-1-4` | China TST 1/4 | 8–8.5 | 8.25 | **2360** |
| `chinatst-2-5` | China TST 2/5 | 9 | 9.00 | **2463** |
| `chinatst-3-6` | China TST 3/6 | 9.5–10 | 9.75 | **2566** |

### Ordering finding — the old table was inverted

The old hand-typed seeds got the Putnam/USAMO relationship **backwards by about 400 points**.

The wiki rates **Putnam above USAMO at every comparable position**, by a uniform 0.5 on its scale:

| Position | Putnam | USAMO |
|---|---|---|
| 1st tier | 7.0 → 2190 | 6.5 → 2121 |
| 2nd tier | 8.0 → 2326 | 7.5 → 2258 |
| 3rd tier | 9.0 → 2463 | 8.5 → 2395 |

The old table had `olympiad-natl` (USAMO 1/4) at 2300 and `putnam-a1b1` at 1900 — USAMO 400 points
*above* Putnam A1/B1. Under the source it is 69 points *below*. Putnam A/B 1–2 also outranks IMO 1/4
(2121) and ISL 1–2 (2087). Treat "olympiad ⇒ harder than Putnam" as a disproven assumption.

Also worth knowing: USAMO 1/4 and 2/5 rate *identically* to IMO 1/4 and 2/5 (6.5 and 7.5). The two
diverge only at problem 3/6, where IMO is a full point harder.

### Bucket structure changes

Buckets follow the wiki's own groupings rather than forcing the source into our previous shape:

- `putnam-a1b1` + `putnam-a2b2` → **merged** into `putnam-12`. The wiki rates Putnam 1–2 as one tier,
  so "A2 is harder than A1" was a distinction we invented.
- `putnam-late` → **split** into `putnam-34` / `putnam-56` (a full point apart).
- `olympiad-natl` → **split** into `usamo-*` and `usajmo-*`. USAJMO 1/4 (1882) and USAMO 3/6 (2395)
  differ by over 500 points; one bucket could not carry both.
- `olympiad-hard` → **split** into `imo-*` and `isl-*`. ISL 1–2 (2087) is far easier than IMO 3/6 (2532).
- `aime-early` / `aime-mid` / `aime-late` → **regrouped** to the wiki's 1–5 / 6–9 / 10–12 / 13–15 split.
  Our old #6–10 and #11–15 boundaries did not match the source.
- `amc-hard` → **split** into the four AMC 12 tiers, including the wiki's own Easier/Harder division of
  problems 21–25.

### Still pending

| Bucket key | Status |
|---|---|
| AMC 10, AMC 8 | Not in the supplied text. AMC 12 only. Do not reuse AMC 12 seeds for AMC 10. |
| `aops-community` | **Retired.** Not a contest position, so the wiki cannot rate it by construction. A problem with no contest position has no principled seed — do not include such problems in a unit. |

### Warmup band

The warmup tier (target 1300–1600) is now seedable: `amc12-1-10` (1437) and `aime-1-5` (1539) both
land in it, with `amc12-11-20` (1642) just above. **Seeding is solved; sourcing is not** — see
"Where to search". A verified, fetchable archive of AMC/AIME problems *with* solutions is still needed
before a warmup tier can actually be built.

---

## Unit file format

`content/<id>-<slug>.js`, e.g. `content/2-1-2-x-squared-nonneg.js`.

```js
PT.registerUnit({
  id: "2.1.2",
  chapter: "Algebra",
  section: "Identities and Inequalities",
  title: "x² ≥ 0",
  blurb: "One-sentence description shown on the topic card.",

  lecture: [
    { heading: "The idea", html: "<p>…</p>" },
    { heading: "Worked example 1", html: "<p>…</p>" }
  ],

  cues: ["Reach for this when …"],
  traps: ["Don't assume …"],

  problems: [
    {
      pid: "2.1.2-p07",              // stable, never reused
      tier: "core",                  // warmup | core | stretch
      bucket: "aime-mid",            // key from the seed table above
      statement: "<p>…</p>",
      source: { contest: "AIME II", year: 2015, number: "8",
                url: "https://artofproblemsolving.com/community/…" },
      hints: ["…", "…"],
      solution: "<p>…</p>",
      altSolution: null
    }
  ]
});
```

Notes:
- **Every field containing LaTeX must use ``String.raw`...` ``.** In an ordinary JS string `\frac`
  becomes a formfeed and `\t` a tab, silently corrupting the math. Inside a `String.raw` template, avoid
  the two-character sequence `${` — it starts an interpolation regardless of the raw tag.
- `html` and `statement` are **HTML strings**, not markdown. Inline math is `$…$`, display math is
  `$$…$$` — KaTeX auto-renders after insertion.
- `pid` must be globally unique and stable forever. Progress and ratings are keyed to it, so
  renaming a `pid` silently orphans that history.
- Content files are `.js` rather than `.json` on purpose: `fetch()` on a `file://` page is blocked
  by CORS, but `<script src>` is not. Every unit must be registered with a `<script>` tag in
  `index.html` or it will not load.
