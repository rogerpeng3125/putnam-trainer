(function (PT) {
  'use strict';

  var root, route = { view: 'dashboard' };

  /* ---------- helpers ---------- */

  function el(html) {
    var d = document.createElement('div');
    d.innerHTML = html;
    return d;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function typeset(node) {
    if (window.renderMathInElement) {
      try {
        window.renderMathInElement(node, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false }
          ],
          throwOnError: false
        });
      } catch (e) { /* math rendering is cosmetic; never block the view */ }
    }
  }

  function go(view, params) {
    route = Object.assign({ view: view }, params || {});
    render();
    window.scrollTo(0, 0);
  }

  /* Strip tags so the clipboard gets clean text for pasting into a chat. */
  function toPlainText(html) {
    var d = document.createElement('div');
    d.innerHTML = html;
    return (d.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function copyProblem(pid, btn) {
    var p = PT.state.problemById(pid);
    if (!p) return;
    var src = p.source || {};
    var text = toPlainText(p.statement) +
      (src.contest ? '\n\n(Source: ' + src.contest + (src.year ? ' ' + src.year : '') +
        (src.number ? ' #' + src.number : '') + ')' : '');

    var done = function () {
      var old = btn.textContent;
      btn.textContent = 'Copied';
      btn.classList.add('ok');
      setTimeout(function () { btn.textContent = old; btn.classList.remove('ok'); }, 1400);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  }

  // navigator.clipboard is unavailable on file:// in some browsers.
  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* nothing more to try */ }
    document.body.removeChild(ta);
  }

  /* ---------- header ---------- */

  function header() {
    var s = PT.state.get();
    var rating = Math.round(s.player.rating);
    return '' +
      '<header class="top">' +
        '<div class="brand" data-nav="dashboard">Putnam Trainer</div>' +
        '<nav>' +
          '<button data-nav="dashboard">Dashboard</button>' +
          '<button data-nav="topics">Topics</button>' +
        '</nav>' +
        '<div class="stats">' +
          '<span class="stat"><b>' + rating + '</b><i>rating</i></span>' +
          '<span class="stat"><b>' + s.xp + '</b><i>XP</i></span>' +
          '<span class="stat"><b>' + s.streak.count + '</b><i>day streak</i></span>' +
        '</div>' +
      '</header>';
  }

  /* ---------- views ---------- */

  function dashboard() {
    var s = PT.state.get();
    var units = PT.state.units();
    var html = '<div class="wrap">';

    if (!units.length) {
      html += '<div class="empty"><h2>No units loaded yet</h2>' +
        '<p>Ask Claude to <code>build the next unit</code> to add one.</p></div>';
      return html + '</div>';
    }

    html += '<h1>Dashboard</h1><div class="cards">';
    units.forEach(function (u) {
      var t = PT.state.topic(u.id);
      var bank = (u.problems || []).length;
      var avg = t.attempted ? t.scoreSum / t.attempted : 0;
      var m = PT.rating.mastery(t.rating, t.attempted, bank, avg);
      html += '<div class="card" data-unit="' + u.id + '">' +
        '<div class="card-id">' + esc(u.id) + '</div>' +
        '<h3>' + esc(u.title) + '</h3>' +
        '<div class="bar"><span style="width:' + m + '%"></span></div>' +
        '<div class="card-meta">' + m + '% mastery · ' + Math.round(t.rating) + ' rating · ' +
          t.attempted + '/' + bank + ' attempted</div>' +
      '</div>';
    });
    html += '</div>';

    var recent = s.log.slice(-8).reverse();
    if (recent.length) {
      html += '<h2>Recent attempts</h2><table class="log"><thead><tr>' +
        '<th>Problem</th><th>Outcome</th><th>Problem rating</th><th>Your rating</th><th>XP</th>' +
        '</tr></thead><tbody>';
      recent.forEach(function (r) {
        var o = PT.rating.outcomeByKey(r.outcome);
        var delta = r.ratingAfter - r.ratingBefore;
        html += '<tr><td>' + esc(r.pid) + '</td>' +
          '<td>' + esc(o ? o.label : r.outcome) + '</td>' +
          '<td>' + r.problemRating + '</td>' +
          '<td>' + r.ratingAfter + ' <span class="' + (delta >= 0 ? 'up' : 'down') + '">' +
            (delta >= 0 ? '+' : '') + delta + '</span></td>' +
          '<td>+' + r.xp + '</td></tr>';
      });
      html += '</tbody></table>';
    }

    html += '<div class="danger-zone">' +
      '<button data-act="export">Export progress</button>' +
      '<button data-act="import">Import progress</button>' +
      '<button data-act="reset" class="warn">Reset all progress</button>' +
      '<p class="fineprint">Progress lives in this browser only. Export regularly — clearing browsing data erases it.</p>' +
      '</div>';

    return html + '</div>';
  }

  function topics() {
    var units = PT.state.units();
    var html = '<div class="wrap"><h1>Topics</h1>';
    if (!units.length) {
      html += '<p class="empty">No units built yet.</p></div>';
      return html;
    }
    var chapter = null;
    units.forEach(function (u) {
      if (u.chapter !== chapter) {
        chapter = u.chapter;
        html += '<h2>' + esc(chapter) + '</h2>';
      }
      var t = PT.state.topic(u.id);
      var bank = (u.problems || []).length;
      html += '<div class="row" data-unit="' + u.id + '">' +
        '<span class="row-id">' + esc(u.id) + '</span>' +
        '<span class="row-title">' + esc(u.title) + '<em>' + esc(u.blurb || '') + '</em></span>' +
        '<span class="row-meta">' + t.attempted + '/' + bank + '</span>' +
      '</div>';
    });
    return html + '</div>';
  }

  function unitView(id) {
    var u = PT.state.unit(id);
    if (!u) return '<div class="wrap"><p>Unit not found.</p></div>';
    var t = PT.state.topic(id);

    var html = '<div class="wrap">' +
      '<div class="unit-head">' +
        '<div><span class="card-id">' + esc(u.id) + '</span><h1>' + esc(u.title) + '</h1>' +
        '<p class="blurb">' + esc(u.blurb || '') + '</p></div>' +
        '<button class="primary" data-act="start-session" data-unit="' + id + '">Start session</button>' +
      '</div>' +
      '<p class="unit-stats">Your rating here: <b>' + Math.round(t.rating) + '</b> · ' +
        t.attempted + ' of ' + (u.problems || []).length + ' problems attempted</p>';

    (u.lecture || []).forEach(function (sec) {
      html += '<section class="lecture"><h2>' + esc(sec.heading) + '</h2>' + sec.html + '</section>';
    });

    if (u.cues && u.cues.length) {
      html += '<section class="callout cues"><h2>Recognition cues</h2><ul>';
      u.cues.forEach(function (c) { html += '<li>' + c + '</li>'; });
      html += '</ul></section>';
    }
    if (u.traps && u.traps.length) {
      html += '<section class="callout traps"><h2>Common traps</h2><ul>';
      u.traps.forEach(function (c) { html += '<li>' + c + '</li>'; });
      html += '</ul></section>';
    }

    html += '<h2>Problem bank</h2><div class="bank">';
    ['warmup', 'core', 'stretch'].forEach(function (tier) {
      var list = (u.problems || []).filter(function (p) { return PT.state.tierOf(p) === tier; });
      if (!list.length) return;
      html += '<h3 class="tier">' + tier + '</h3>';
      list.forEach(function (p) {
        var pr = PT.state.problem(p.pid);
        var mark = pr.attempts ? (pr.lastScore >= 0.5 ? 'solved' : 'tried') : '';
        html += '<div class="prob-row ' + mark + '" data-prob="' + p.pid + '">' +
          '<span class="prob-rating">' + Math.round(PT.state.problemRating(p)) + '</span>' +
          '<span class="prob-src">' + esc(sourceLabel(p)) + '</span>' +
          '<span class="prob-state">' + (mark || '') + '</span>' +
        '</div>';
      });
    });
    html += '</div></div>';
    return html;
  }

  function sourceLabel(p) {
    var s = p.source || {};
    if (s.authored) return 'Teaching drill';
    if (!s.contest) return 'Unsourced';
    return s.contest + (s.year ? ' ' + s.year : '') + (s.number ? ' #' + s.number : '');
  }

  /* ---------- problem / session ---------- */

  var session = null; // { unitId, queue: [pid], index }

  function startSession(unitId) {
    var picks = PT.session.build(unitId);
    if (!picks.length) { go('unit', { id: unitId }); return; }
    session = { unitId: unitId, queue: picks.map(function (p) { return p.pid; }), index: 0 };
    go('problem', { pid: session.queue[0] });
  }

  function problemView(pid) {
    var p = PT.state.problemById(pid);
    if (!p) return '<div class="wrap"><p>Problem not found.</p></div>';
    var u = PT.state.unit(p.unitId);
    var src = p.source || {};

    var progress = session
      ? '<span class="sess-progress">Problem ' + (session.index + 1) + ' of ' + session.queue.length + '</span>'
      : '';

    var html = '<div class="wrap problem-page">' +
      '<div class="prob-head">' +
        '<a class="back" data-unit="' + p.unitId + '">← ' + esc(u ? u.title : 'Back') + '</a>' +
        progress +
      '</div>' +
      '<div class="prob-tags">' +
        '<span class="tag">' + esc(PT.state.tierOf(p)) + '</span>' +
        '<span class="tag">rating ' + Math.round(PT.state.problemRating(p)) + '</span>' +
        '<span class="tag">' + esc(sourceLabel(p)) + '</span>' +
      '</div>' +
      '<div class="statement">' + p.statement + '</div>' +
      '<div class="prob-actions">' +
        '<button data-act="copy" data-prob="' + pid + '">Copy problem</button>' +
        (src.url ? '<a class="linkbtn" href="' + esc(src.url) + '" target="_blank" rel="noopener">AoPS thread</a>' : '') +
      '</div>';

    if (p.hints && p.hints.length) {
      html += '<div class="hints"><h3>Hints <em>— free, and they never affect XP</em></h3>';
      p.hints.forEach(function (h, i) {
        html += '<details><summary>Hint ' + (i + 1) + '</summary><div>' + h + '</div></details>';
      });
      html += '</div>';
    }

    html += '<details class="solution"><summary>Show solution</summary><div>' + p.solution +
      (p.altSolution ? '<hr><h4>Another approach</h4>' + p.altSolution : '') + '</div></details>';

    html += '<div class="outcome"><h3>How did it go?</h3><div class="outcome-btns">';
    PT.rating.OUTCOMES.forEach(function (o) {
      html += '<button data-act="record" data-prob="' + pid + '" data-outcome="' + o.key + '">' +
        '<b>' + esc(o.label) + '</b><i>' + esc(o.desc) + '</i></button>';
    });
    html += '</div></div></div>';
    return html;
  }

  function afterRecord(pid, result) {
    var delta = Math.round(result.playerRating) - Math.round(result.problemRating);
    var pct = Math.round(result.expected * 100);
    var msg = '<div class="wrap"><div class="result-card">' +
      '<h1>+' + result.xp + ' XP</h1>' +
      '<p>You had about a <b>' + pct + '%</b> expected chance on this one.</p>' +
      '<p class="muted">Problem rated ' + Math.round(result.problemRating) +
        ' · your topic rating is now ' + Math.round(result.playerRating) + '</p>';

    if (session && session.index < session.queue.length - 1) {
      msg += '<button class="primary" data-act="next">Next problem</button>';
    } else if (session) {
      msg += '<p><b>Session complete.</b></p>' +
        '<button class="primary" data-unit="' + session.unitId + '">Back to topic</button>';
      session = null;
    } else {
      msg += '<button class="primary" data-nav="topics">Back to topics</button>';
    }
    return msg + '</div></div>';
  }

  var pendingResult = null;

  /* ---------- render + events ---------- */

  function render() {
    var body;
    if (pendingResult) {
      body = afterRecord(pendingResult.pid, pendingResult.result);
    } else if (route.view === 'dashboard') {
      body = dashboard();
    } else if (route.view === 'topics') {
      body = topics();
    } else if (route.view === 'unit') {
      body = unitView(route.id);
    } else if (route.view === 'problem') {
      body = problemView(route.pid);
    } else {
      body = dashboard();
    }
    root.innerHTML = header() + body;
    typeset(root);
  }

  function onClick(e) {
    var target = e.target.closest('[data-nav],[data-unit],[data-prob],[data-act]');
    if (!target) return;

    var act = target.getAttribute('data-act');

    if (act === 'copy') { copyProblem(target.getAttribute('data-prob'), target); return; }

    if (act === 'record') {
      var pid = target.getAttribute('data-prob');
      var res = PT.state.recordAttempt(pid, target.getAttribute('data-outcome'));
      if (res) { pendingResult = { pid: pid, result: res }; render(); window.scrollTo(0, 0); }
      return;
    }

    if (act === 'next') {
      pendingResult = null;
      session.index += 1;
      go('problem', { pid: session.queue[session.index] });
      return;
    }

    if (act === 'start-session') { startSession(target.getAttribute('data-unit')); return; }

    if (act === 'export') { doExport(); return; }
    if (act === 'import') { doImport(); return; }
    if (act === 'reset') {
      if (confirm('Erase all ratings, XP and history? Export first if you want a backup.')) {
        PT.state.reset(); pendingResult = null; go('dashboard');
      }
      return;
    }

    // Plain navigation. Clearing pendingResult here keeps the result card from sticking.
    pendingResult = null;

    if (target.hasAttribute('data-nav')) { go(target.getAttribute('data-nav')); return; }
    if (target.hasAttribute('data-prob') && !act) { go('problem', { pid: target.getAttribute('data-prob') }); return; }
    if (target.hasAttribute('data-unit')) { go('unit', { id: target.getAttribute('data-unit') }); return; }
  }

  function doExport() {
    var text = PT.state.exportJson();
    var w = window.open('', '_blank');
    if (w) {
      // A download link is blocked in some local contexts; a plain text window always works.
      w.document.write('<title>putnam-progress.json</title><pre>' + esc(text) + '</pre>');
      w.document.close();
    } else {
      prompt('Copy your progress JSON:', text);
    }
  }

  function doImport() {
    var text = prompt('Paste a previously exported progress JSON:');
    if (!text) return;
    try { PT.state.importJson(text); go('dashboard'); }
    catch (err) { alert('Could not import: ' + err.message); }
  }

  function boot() {
    root = document.getElementById('app');
    PT.state.load();
    document.addEventListener('click', onClick);
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window.PT = window.PT || {});
