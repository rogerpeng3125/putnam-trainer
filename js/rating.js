/* Rating engine.
   Two-level difficulty model: a problem's rating is its bucket's rating plus a per-problem offset.
   With a single solver each problem is attempted about once, so individual offsets barely converge.
   The bucket ratings are what actually learn, since they pool observations across many problems. */

(function (PT) {
  'use strict';

  /* Seeds are computed, not chosen: rating(w) = 1300 + (w - 0.5) * 136.84, where w is the midpoint of
     the AoPS Wiki "Competition ratings" 0.5-10 range for that exact contest and problem position.
     See build-instructions.md for the derivation table. Never hand-edit a single value here — adjust
     the anchors and recompute all of them, or the seeds stop being auditable. */
  var SEEDS = {
    'amc12-1-10':          1437,
    'amc12-11-20':         1642,
    'amc12-21-25-easier':  1711,
    'amc12-21-25-harder':  1882,
    'aime-1-5':            1539,
    'aime-6-9':            1745,
    'aime-10-12':          1916,
    'aime-13-15':          2053,
    'usajmo-1-4':          1882,
    'usajmo-2-5':          2087,
    'usajmo-3-6':          2190,
    'usamo-1-4':           2121,
    'usamo-2-5':           2258,
    'usamo-3-6':           2395,
    'putnam-12':           2190,
    'putnam-34':           2326,
    'putnam-56':           2463,
    'isl-1-2':             2087,
    'isl-3-4':             2190,
    'isl-5-6':             2395,
    'isl-7plus':           2497,
    'imo-1-4':             2121,
    'imo-2-5':             2258,
    'imo-3-6':             2532,
    'korea-1-4':           2190,
    'korea-2-5':           2292,
    'korea-3-6':           2395,
    'chinatst-1-4':        2360,
    'chinatst-2-5':        2463,
    'chinatst-3-6':        2566,

    /* Authored teaching drills. No contest position, so the wiki cannot rate them. Seeded at
       rating(0.5) = 1300 -- the floor of the wiki's own scale, which is what a deliberately
       mechanical warm-up rep is pitched at -- so the value still comes from the formula rather than
       from taste. It starts with much wider uncertainty than a contest bucket (see NOMINAL_BUCKETS)
       because that seed is a guess in a way the contest seeds are not, and it is kept separate so
       drills never drag the calibration of a real contest bucket. */
    'drill':               1300
  };

  // Buckets whose seed is nominal rather than sourced: start uncertain so real outcomes dominate fast.
  var NOMINAL_BUCKETS = { 'drill': true };
  var NOMINAL_RD = 350;

  /* Self-report scale.
     `s` feeds the rating update — it must stay an honest measure of how it went, so a hinted solve
     scores below an unaided one there.
     `xpCredit` feeds XP, and is deliberately NOT the same number: solving with a hint pays exactly
     what solving without one pays. Hints are never a cost. */
  var OUTCOMES = [
    { key: 'clean',    label: 'Solved it cleanly',      s: 1.0,  xpCredit: 1.0,  desc: 'Found it without much struggle.' },
    { key: 'slow',     label: 'Solved it, but slowly',  s: 0.85, xpCredit: 1.0,  desc: 'Got there after real work or false starts.' },
    { key: 'hinted',   label: 'Solved it after a hint', s: 0.5,  xpCredit: 1.0,  desc: 'Needed a nudge to see the idea.' },
    { key: 'partial',  label: 'Partial progress',       s: 0.25, xpCredit: 0.6,  desc: 'Real progress but no complete solution.' },
    { key: 'read',     label: 'Read the solution',      s: 0.0,  xpCredit: 0.4,  desc: 'Did not get it this time.' }
  ];

  var START_RATING = 1500;
  var START_RD     = 350;   // player uncertainty; shrinks with attempts
  var MIN_RD       = 60;
  var BUCKET_RD    = 200;   // buckets start uncertain because seeds are only a prior
  var MIN_BUCKET_RD = 40;

  function expected(playerRating, problemRating) {
    return 1 / (1 + Math.pow(10, (problemRating - playerRating) / 400));
  }

  // K scales with uncertainty: move fast when we know little, slowly once converged.
  function kFromRd(rd, scale) {
    return scale * (rd / START_RD);
  }

  /* An unknown bucket is a content bug, not something to paper over: silently defaulting would
     reintroduce exactly the unprincipled seed the computed table removed. Complain, then use the
     midpoint of our scale so the app still runs. */
  function seedFor(bucket) {
    if (SEEDS[bucket] != null) return SEEDS[bucket];
    console.error('Unknown difficulty bucket "' + bucket + '" — fix the unit file; see build-instructions.md.');
    return 1950;
  }

  function initialRdFor(bucket) {
    return NOMINAL_BUCKETS[bucket] ? NOMINAL_RD : BUCKET_RD;
  }

  function outcomeByKey(key) {
    for (var i = 0; i < OUTCOMES.length; i++) {
      if (OUTCOMES[i].key === key) return OUTCOMES[i];
    }
    return null;
  }

  /* XP rewards difficulty relative to *you*. It takes xpCredit, never `s`, so that a hinted solve
     and an unaided solve of the same problem pay identically. */
  function xpFor(expectedScore, xpCredit) {
    var engagement = 12;                        // paid for any logged attempt
    var difficulty = 60 * (1 - expectedScore);  // harder-for-you problems pay more
    return Math.round(engagement + difficulty * xpCredit);
  }

  /* Returns the deltas to apply. Pure — callers persist the result. */
  function computeUpdate(opts) {
    var playerRating = opts.playerRating;
    var playerRd     = opts.playerRd;
    var bucketRating = opts.bucketRating;
    var bucketRd     = opts.bucketRd;
    var offset       = opts.offset || 0;
    var s            = opts.s;
    var xpCredit     = opts.xpCredit != null ? opts.xpCredit : s;

    // The base is the audit rating when one exists, else the contest-position seed.
    var baseRating = opts.baseRating != null ? opts.baseRating : bucketRating;
    var problemRating = baseRating + offset;
    var e = expected(playerRating, problemRating);

    var kPlayer = kFromRd(playerRd, 40);
    var kBucket = kFromRd(bucketRd, 8);   // small: many problems share a bucket
    var kOffset = 12;

    var newPlayerRating = playerRating + kPlayer * (s - e);
    var newBucketRating = bucketRating + kBucket * (e - s);
    var newOffset       = offset + kOffset * (e - s);

    return {
      expected: e,
      problemRating: problemRating,
      playerRating: newPlayerRating,
      playerRd: Math.max(MIN_RD, playerRd * 0.94),
      bucketRating: newBucketRating,
      bucketRd: Math.max(MIN_BUCKET_RD, bucketRd * 0.97),
      offset: newOffset,
      xp: xpFor(e, xpCredit)
    };
  }

  /* Mastery blends three things so a topic can't look mastered on two lucky solves:
     rating position, how much of the bank you've seen, and how it went on average. */
  function mastery(topicRating, attempted, bankSize, avgScore) {
    if (!attempted) return 0;
    var ratingPart = Math.min(1, Math.max(0, (topicRating - 1300) / 900));
    var coverage = Math.min(1, attempted / Math.max(1, bankSize * 0.6));
    var quality = Math.min(1, Math.max(0, avgScore));
    return Math.round(100 * (0.5 * ratingPart + 0.25 * coverage + 0.25 * quality));
  }

  PT.rating = {
    SEEDS: SEEDS,
    OUTCOMES: OUTCOMES,
    START_RATING: START_RATING,
    START_RD: START_RD,
    BUCKET_RD: BUCKET_RD,
    expected: expected,
    seedFor: seedFor,
    initialRdFor: initialRdFor,
    outcomeByKey: outcomeByKey,
    computeUpdate: computeUpdate,
    xpFor: xpFor,
    mastery: mastery
  };
})(window.PT = window.PT || {});
