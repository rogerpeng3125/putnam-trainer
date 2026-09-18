/* Persistence + the unit registry.
   Storage is localStorage under a file:// origin, which is real but fragile: it is shared across all
   local pages and dies with "clear browsing data". Export/Import in the header is the actual backup. */

(function (PT) {
  'use strict';

  var KEY = 'putnam-trainer-v1';
  var units = [];
  var unitsById = {};
  var problemsById = {};
  var auditRatings = {};   // pid -> rating, from the blind content audit

  /* The auditor has final say on where a problem starts, because it is the only thing that reads the
     mathematics; contest position is a coarse proxy that cannot see within-position variation. What it
     does not override is measured performance — the per-problem offset still applies on top. */
  function registerAuditRatings(map) {
    Object.keys(map).forEach(function (pid) { auditRatings[pid] = map[pid]; });
  }

  function registerUnit(unit) {
    units.push(unit);
    unitsById[unit.id] = unit;
    (unit.problems || []).forEach(function (p) {
      p.unitId = unit.id;
      problemsById[p.pid] = p;
    });
  }

  function blankState() {
    return {
      version: 1,
      createdAt: new Date().toISOString(),
      xp: 0,
      streak: { count: 0, best: 0, lastDay: null },
      player: { rating: PT.rating.START_RATING, rd: PT.rating.START_RD },
      topics: {},   // unitId -> { rating, rd, attempted, solved, scoreSum, lastSeen }
      buckets: {},  // bucketKey -> { rating, rd, n }
      problems: {}, // pid -> { offset, attempts, lastScore, lastSeen }
      log: []       // newest last
    };
  }

  var state = blankState();

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.version === 1) state = parsed;
      }
    } catch (e) {
      // Private windows and blocked site-data both throw here. Run on a fresh in-memory state.
      console.warn('Could not read saved progress; starting fresh.', e);
    }
    return state;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Could not save progress.', e);
    }
  }

  function topic(unitId) {
    if (!state.topics[unitId]) {
      state.topics[unitId] = {
        rating: state.player.rating,
        rd: PT.rating.START_RD,
        attempted: 0, solved: 0, scoreSum: 0, lastSeen: null
      };
    }
    return state.topics[unitId];
  }

  function bucket(key) {
    if (!state.buckets[key]) {
      state.buckets[key] = { rating: PT.rating.seedFor(key), rd: PT.rating.initialRdFor(key), n: 0 };
    }
    return state.buckets[key];
  }

  function problem(pid) {
    if (!state.problems[pid]) {
      state.problems[pid] = { offset: 0, attempts: 0, lastScore: null, lastSeen: null };
    }
    return state.problems[pid];
  }

  function problemRating(p) {
    var base = auditRatings[p.pid] != null ? auditRatings[p.pid] : bucket(p.bucket).rating;
    return base + problem(p.pid).offset;
  }

  function hasAuditRating(pid) {
    return auditRatings[pid] != null;
  }

  /* Tier is derived from the effective rating rather than read from the unit file. The stored `tier`
     records authoring intent; once a problem has been audited, where it actually belongs is whatever
     its rating says. */
  function tierOf(p) {
    var r = problemRating(p);
    return r < 1600 ? 'warmup' : r < 2000 ? 'core' : 'stretch';
  }

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function bumpStreak() {
    var today = todayKey();
    var st = state.streak;
    if (st.lastDay === today) return;
    var yesterday = new Date(Date.now() - 86400000);
    var yKey = yesterday.getFullYear() + '-' + (yesterday.getMonth() + 1) + '-' + yesterday.getDate();
    st.count = (st.lastDay === yKey) ? st.count + 1 : 1;
    st.lastDay = today;
    if (st.count > st.best) st.best = st.count;
  }

  /* The one write path for an attempt. Everything else reads. */
  function recordAttempt(pid, outcomeKey) {
    var p = problemsById[pid];
    var outcome = PT.rating.outcomeByKey(outcomeKey);
    if (!p || !outcome) return null;

    var t = topic(p.unitId);
    var b = bucket(p.bucket);
    var pr = problem(pid);

    var audited = auditRatings[pid] != null;

    var result = PT.rating.computeUpdate({
      playerRating: t.rating,
      playerRd: t.rd,
      baseRating: audited ? auditRatings[pid] : b.rating,
      bucketRating: b.rating,
      bucketRd: b.rd,
      offset: pr.offset,
      s: outcome.s,
      xpCredit: outcome.xpCredit
    });

    var before = t.rating;
    t.rating = result.playerRating;
    t.rd = result.playerRd;
    t.attempted += 1;
    t.scoreSum += outcome.s;
    if (outcome.s >= 0.5) t.solved += 1;
    t.lastSeen = Date.now();

    // Only feed the bucket when it is actually governing this problem. For an audited problem the
    // outcome is evidence about the audit rating, not about the contest-position bucket, so letting it
    // move the bucket would corrupt the calibration of problems that still rely on it.
    if (!audited) {
      b.rating = result.bucketRating;
      b.rd = result.bucketRd;
      b.n += 1;
    }

    pr.offset = result.offset;
    pr.attempts += 1;
    pr.lastScore = outcome.s;
    pr.lastSeen = Date.now();

    state.xp += result.xp;

    // Overall rating tracks the attempt-weighted mean of topic ratings.
    var total = 0, weight = 0;
    Object.keys(state.topics).forEach(function (id) {
      var tt = state.topics[id];
      if (tt.attempted) { total += tt.rating * tt.attempted; weight += tt.attempted; }
    });
    if (weight) state.player.rating = total / weight;

    bumpStreak();

    state.log.push({
      at: Date.now(), pid: pid, unitId: p.unitId, outcome: outcomeKey,
      s: outcome.s, xp: result.xp,
      ratingBefore: Math.round(before), ratingAfter: Math.round(result.playerRating),
      problemRating: Math.round(result.problemRating)
    });

    save();
    return result;
  }

  function exportJson() {
    return JSON.stringify(state, null, 2);
  }

  function importJson(text) {
    var parsed = JSON.parse(text);
    if (!parsed || parsed.version !== 1) throw new Error('Not a valid progress file.');
    state = parsed;
    save();
  }

  function reset() {
    state = blankState();
    save();
  }

  PT.registerUnit = registerUnit;
  PT.registerAuditRatings = registerAuditRatings;
  PT.state = {
    hasAuditRating: hasAuditRating,
    tierOf: tierOf,
    get: function () { return state; },
    load: load, save: save,
    units: function () { return units; },
    unit: function (id) { return unitsById[id]; },
    problemById: function (pid) { return problemsById[pid]; },
    topic: topic, bucket: bucket, problem: problem,
    problemRating: problemRating,
    recordAttempt: recordAttempt,
    exportJson: exportJson, importJson: importJson, reset: reset
  };
})(window.PT = window.PT || {});
