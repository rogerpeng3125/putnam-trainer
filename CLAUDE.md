# CLAUDE.md

Personal Putnam training app. Static, local, no server — `index.html` opens straight from disk.

## The standing command

**"build the next unit"** (or "build 5.2.3" / "build Modular Arithmetic"):

1. Read `topics.md`; take the first `[ ]` row in file order, skipping every `[-]`.
2. Follow `build-instructions.md` — it is the content spec and it is meant to be edited.
3. Write `content/<id>-<slug>.js`.
4. **Register it**: add a `<script src="content/...">` line in `index.html` between the
   `CONTENT UNITS` comment markers. An unregistered unit silently does not exist.
5. Run `node test.js`. It must pass.
6. **Run the difficulty audit** on the whole bank — see "Difficulty auditor" below — and apply its
   ratings. Do this automatically; do not wait to be asked. Re-run `node test.js` after applying. If the
   calibration verdict comes back `UNTRUSTWORTHY` or `UNKNOWN`, stop and tell the user rather than
   `--force`ing past it.
7. Flip the row in `topics.md` to `[x]` with the problem count.

Do not ask the user to restate any of this.

## Non-negotiables

These exist because the tool's entire purpose is to be more trustworthy than asking a model directly.

- **Never write a contest problem or its solution from memory.** Every contest problem needs a source
  that was actually fetched this session and a URL confirmed to resolve.
- **Never assign a difficulty by judgment while authoring.** When you write a unit, a problem's rating
  comes from its contest position via one formula, or from the `drill` bucket if it has none. You do not
  pick a number because a problem "feels" hard. Regrading is the auditor's job, not the author's — and
  the auditor only earns it by being blind and calibrated (see below).
- **Hints are free.** They never cost XP, never break a streak, never gamify. `s` and `xpCredit` are
  separate fields for exactly this reason; do not collapse them.
- **Authored problems are allowed** (warmup and core only) but must be verified, not merely composed,
  and never given a contest attribution. See `build-instructions.md`.
- Falling short of the problem-count target is fine. Padding with off-topic or unverified problems is not.

## Testing

`node test.js` — 290+ checks, exits non-zero on failure. Run it before every commit. It verifies unit
registration, that every seed reproduces from the formula, per-problem content rules, authored-problem
isolation, tier/rating-band agreement, hint XP neutrality, session building, and export/import.

There is no browser automation here. **Logic is testable; rendering is not.** Say so rather than
claiming a unit looks right. Ask the user to open `index.html` and check math rendering.

## Difficulty auditor

Regrades problems from content alone, blind to provenance. Invoke the `difficulty-auditor` agent.

```
node audit/extract.js      # -> audit/blinded.json (auditor input) + audit/key.json (answer key)
# then run the difficulty-auditor agent -> audit/audit-results.json
node audit/reconcile.js    # calibration + divergence report (read-only)
node audit/apply.js        # -> content/audit-ratings.js, which the app uses
```

Runs automatically as step 6 of "build the next unit" (see above). Also re-run all four by hand whenever
content changes outside that flow — editing an existing solution, fixing an `extract.js` blinding bug, or
anything else that changes what the blinded input looks like — or the affected problems keep stale
ratings. A pure blinding-hygiene fix (rewording so a cross-reference doesn't eat real math, tightening a
regex) still counts: the input changed, so the audit needs to see it again.

**Why blinding.** Research on LLM item-difficulty estimation finds models conflate provenance with item
properties — a problem labelled "Putnam A6" is rated hard because of the label. `extract.js` strips
structured provenance *and* drops paragraphs that name a contest or cross-reference course-internal
material ("From the lecture", "exercise c05"), because those separate authored from sourced just as
effectively. It exits non-zero if anything identifying survives. The auditor must never read
`audit/key.json`, `content/`, or `js/rating.js`.

**Trust is calibration-gated, not assumed.** Contest problems have a defensible difficulty from their
contest position, so they act as held-out ground truth. `reconcile.js` measures whether the blind audit
recovers their ordering (Spearman rho) and only then says whether its estimates on *authored* problems —
where no other signal exists — are worth adopting. Current baseline: **rho = 0.788, MAE 166 points,
n = 9**, reproducible to about ±1 band across runs. Note n is small; treat the verdict as provisional.

**The auditor has final say on a problem's rating.** `apply.js` writes its ratings to
`content/audit-ratings.js` and the app prefers them over contest-position seeds — no human approval
step. The user's position, and it is right: they are the learner, not someone positioned to judge
content difficulty, and the auditor is the only thing that actually reads the mathematics.

Two limits on that authority, both structural rather than editorial:

- **It sets the starting rating, not the final one.** The per-problem offset earned from real solve
  outcomes still moves it. Measured performance outranks any opinion, which is the whole premise of the
  tool. An audited problem also stops feeding its contest bucket, since its outcome is now evidence
  about the audit rating rather than about the bucket.
- **The calibration gate still blocks a broken run.** `apply.js` refuses on an `UNTRUSTWORTHY` verdict
  or an incomplete audit. That is not asking permission — a run that cannot recover known contest
  ordering has malfunctioned, and applying it would corrupt every rating. `--force` overrides.

`tier` in a unit file is therefore **authoring intent only**. The app derives the displayed tier from
the effective rating via `PT.state.tierOf(p)`. Expect tiers to move after an audit; that is working.

The audit also flags `topicMismatch`, `solutionUnclear` and `solutionPossiblyWrong`, which have caught
real defects. Treat those as review items, not automatic edits.

## Environment gotchas

Each of these cost real time at least once.

**Blocked hosts — do not retry.** `artofproblemsolving.com` (403 on everything, wiki included),
`maa.org` PDFs (403), `web.archive.org` (unavailable to WebFetch). Working sources are listed in
`build-instructions.md`.

**LaTeX in content files needs `String.raw`.** A plain string turns `\frac` into a formfeed. Use
``String.raw`...` `` for every field containing math, and avoid the two-character sequence `${` inside
it (it starts an interpolation). Content is HTML with `$...$` / `$$...$$`, not Markdown.

**`file://` shapes the architecture.** `fetch()` on local JSON is CORS-blocked, which is why content is
`.js` files that self-register via `PT.registerUnit(...)` rather than JSON. `localStorage` works but is
shared across all local pages and dies with "clear browsing data" — hence Export/Import.

**PowerShell is 5.1.** `&&` and `||` do not exist. `Out-File -Encoding utf8` writes a BOM, which will
end up in your commit subject line — write files with
`[System.IO.File]::WriteAllText($p, $t, (New-Object System.Text.UTF8Encoding $false))`. Here-strings
passed inline to `git commit -m` break on embedded quotes; write the message to a file and use
`git commit -F`.

**No `pdftoppm`, so `Read` cannot open PDFs.** `pip install pypdf` and extract text to a `.txt` first.

**Regexes get mangled through `python -c` in PowerShell.** Write a `.py` file and run it instead.

## Layout

```
index.html              app shell; one <script> line per content unit
js/rating.js            seed table, outcome scale, XP, mastery
js/state.js             persistence, unit registry, the single attempt-recording path
js/session.js           which problems to serve
js/app.js               views and events
content/                one file per unit
test.js                 run before committing
topics.md               roadmap + status
build-instructions.md   how a topic becomes a unit (editable spec)
```
