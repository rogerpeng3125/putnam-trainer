/* Session builder: choose which problems to serve, given the current per-topic rating. */

(function (PT) {
  'use strict';

  // Offsets from your topic rating. A session opens easy, works in the productive band, ends hard.
  var SHAPE = [-150, 0, 60, 60, 250];
  var REVIEW_DAYS = 10;

  function daysSince(ts) {
    return ts ? (Date.now() - ts) / 86400000 : Infinity;
  }

  /* Lower is better. Distance from the target, penalized for having been seen recently. */
  function cost(problem, target) {
    var st = PT.state;
    var pr = st.problem(problem.pid);
    var distance = Math.abs(st.problemRating(problem) - target);
    var recency = 0;

    if (pr.attempts > 0) {
      var age = daysSince(pr.lastSeen);
      if (age < REVIEW_DAYS) {
        recency = 5000;                      // effectively excluded
      } else if (pr.lastScore >= 0.85) {
        recency = 600;                       // solved cleanly; low value in repeating
      } else {
        recency = -150;                      // struggled and it's due — actively prefer it
      }
    }
    return distance + recency;
  }

  function build(unitId, length) {
    var unit = PT.state.unit(unitId);
    if (!unit) return [];
    var target = PT.state.topic(unitId).rating;
    var pool = (unit.problems || []).slice();
    var shape = SHAPE.slice(0, length || SHAPE.length);
    var chosen = [];

    shape.forEach(function (delta) {
      var want = target + delta;
      var best = null, bestCost = Infinity;
      pool.forEach(function (p) {
        if (chosen.indexOf(p) !== -1) return;
        var c = cost(p, want);
        if (c < bestCost) { bestCost = c; best = p; }
      });
      if (best) chosen.push(best);
    });

    return chosen;
  }

  PT.session = { build: build, SHAPE: SHAPE };
})(window.PT = window.PT || {});
