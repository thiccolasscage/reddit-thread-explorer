/*
 * browser-ui.js — in-page panel used by the bookmarklet and the Firefox extension.
 * Requires RedditParse, RedditHtmlToMd, RedditExport globals (concatenated by scripts/build-bookmarklet.js).
 */
(function (root) {
  'use strict';
  var PANEL_ID = '__reddit_export_panel__';
  var MAX_FETCHES = 40;

  function parseHere(doc, keepMore) {
    doc = doc || document;
    if (!/(^|\.)old\.reddit\.com$/.test(location.hostname) || !/\/comments\//.test(location.pathname)) {
      throw new Error('Open an old.reddit.com/r/.../comments/... thread first.\nTry: ' + toOld(location.href));
    }
    return root.RedditParse.parseDocument(doc, { url: location.href, keepMore: keepMore, toMarkdown: root.RedditHtmlToMd.htmlToMarkdown });
  }

  // Same-origin fetch of an old.reddit comment page (HTML, with the user's own login), parsed with stubs kept.
  function fetchThreadHere(url) {
    return fetch(url, { credentials: 'include' }).then(function (r) {
      if (!r.ok) { var e = new Error('HTTP ' + r.status + ' for ' + url); e.status = r.status; throw e; }
      return r.text();
    }).then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      return root.RedditParse.parseDocument(doc, { url: url, keepMore: true, toMarkdown: root.RedditHtmlToMd.htmlToMarkdown });
    });
  }

  function labelText(t) {
    return 'Export: ' + root.RedditExport.countComments(t.comments) + ' comments' +
      (t.stats.moreLinksSkipped ? ' (+' + t.stats.moreLinksSkipped + ' unexpanded)' : '');
  }
  function toOld(u) { try { return root.RedditParse.normalizeOldRedditUrl(u); } catch (e) { return 'https://old.reddit.com/'; } }

  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime + ';charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  function printPdf(t) {
    var html = root.RedditExport.toPrintHtml(t);
    var w = window.open('', '_blank');
    if (!w) { // popup blocked: fall back to downloading the HTML
      download(root.RedditExport.fileBase(t) + '.html', html, 'text/html');
      alert('Popup blocked — saved printable .html instead. Open it and use Print → Save as PDF.');
      return;
    }
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(function () { w.focus(); w.print(); }, 400);
  }

  function exportAs(t, fmt) {
    var E = root.RedditExport, base = E.fileBase(t);
    if (fmt === 'md') return download(base + '.md', E.toMarkdown(t), 'text/markdown');
    if (fmt === 'json') return download(base + '.json', E.toJSON(t), 'application/json');
    if (fmt === 'txt') return download(base + '.txt', E.toText(t), 'text/plain');
    if (fmt === 'copy') {
      var md = E.toMarkdown(t);
      return (navigator.clipboard ? navigator.clipboard.writeText(md) : Promise.reject()).then(
        function () { flash('Markdown copied'); },
        function () { download(base + '.md', md, 'text/markdown'); });
    }
    if (fmt === 'pdf') return printPdf(t);
  }

  function flash(msg) {
    var s = document.querySelector('#' + PANEL_ID + ' .re-status');
    if (s) s.textContent = msg;
  }

  function showPanel(opts) {
    opts = opts || {};
    var old = document.getElementById(PANEL_ID);
    if (old) { old.remove(); if (!opts.persistent) return; }
    var t, err;
    try { t = parseHere(document); } catch (e) { err = e; }
    if (err) { alert('Reddit export: ' + err.message); return; }
    var p = document.createElement('div');
    p.id = PANEL_ID;
    p.setAttribute('style', [
      'position:fixed', opts.docked ? 'top:0;left:0;right:0' : 'top:12px;right:12px', 'z-index:2147483647',
      'background:#1a1a1b', 'color:#eee', 'font:13px/1.3 system-ui,sans-serif', 'padding:8px 10px',
      opts.docked ? 'border-bottom:2px solid #ff4500' : 'border:2px solid #ff4500;border-radius:8px',
      'box-shadow:0 4px 16px rgba(0,0,0,.35)', 'display:flex', 'gap:6px', 'align-items:center', 'flex-wrap:wrap'
    ].join(';'));
    var label = document.createElement('span');
    label.className = 're-label';
    label.textContent = labelText(t);
    label.style.marginRight = '6px';
    p.appendChild(label);
    var expanded = null; // set once "Expand" has run (stubs kept so another click continues); exports use a stripped copy
    function current() { return expanded ? root.RedditParse.stripMore(JSON.parse(JSON.stringify(expanded))) : parseHere(document); }
    [['md', 'MD'], ['json', 'JSON'], ['txt', 'TXT'], ['pdf', 'Print → PDF'], ['copy', 'Copy MD']].forEach(function (b) {
      var btn = document.createElement('button');
      btn.textContent = b[1];
      btn.setAttribute('style', 'background:#ff4500;color:#fff;border:0;border-radius:4px;padding:4px 9px;cursor:pointer;font:600 12px system-ui,sans-serif');
      btn.onclick = function () {
        try { t = current(); exportAs(t, b[0]); flash(b[1] + ' ✓'); } catch (e) { alert('Reddit export: ' + e.message); }
      };
      p.appendChild(btn);
    });
    if (t.stats.moreLinksSkipped) {
      var ex = document.createElement('button');
      ex.className = 're-expand';
      ex.textContent = 'Expand ' + t.stats.moreLinksSkipped + ' more';
      ex.title = 'Fetch "load more comments" / "continue this thread" pages (up to ' + MAX_FETCHES + ', ~1 per second)';
      ex.setAttribute('style', 'background:#333;color:#fff;border:1px solid #ff4500;border-radius:4px;padding:4px 9px;cursor:pointer;font:600 12px system-ui,sans-serif');
      ex.onclick = function () {
        ex.disabled = true;
        var t2 = expanded || parseHere(document, true);
        root.RedditParse.expandMore(t2, {
          fetchThread: fetchThreadHere, maxFetches: MAX_FETCHES, delayMs: 1000, keepStubs: true,
          onProgress: function (s) { flash('Fetching page ' + s.fetched + '/' + s.max + '…'); }
        }).then(function (done) {
          expanded = done;
          label.textContent = labelText(done);
          var st = done.stats;
          flash('+' + st.moreLinksExpanded + ' expanded from ' + st.pagesFetched + ' pages' +
            (st.expandStopped === 'limit' ? ' (page limit: click again for more)' : st.expandStopped ? ' (stopped: ' + st.expandStopped + ')' : ''));
          ex.disabled = !st.moreLinksSkipped || /HTTP/.test(st.expandStopped || '');
          ex.textContent = st.moreLinksSkipped ? 'Expand ' + st.moreLinksSkipped + ' more' : 'Expanded ✓';
        }, function (e) { ex.disabled = false; flash('Expand failed: ' + e.message); });
      };
      p.appendChild(ex);
    }
    var st = document.createElement('span'); st.className = 're-status'; st.style.cssText = 'color:#9c9;margin-left:4px'; p.appendChild(st);
    if (!opts.persistent) {
      var x = document.createElement('button');
      x.textContent = '×';
      x.title = 'Close';
      x.setAttribute('style', 'background:none;color:#aaa;border:0;font-size:18px;cursor:pointer;margin-left:4px');
      x.onclick = function () { p.remove(); };
      p.appendChild(x);
    }
    document.body.appendChild(p);
    return t;
  }

  var api = { showPanel: showPanel, parseHere: parseHere, exportAs: exportAs, download: download, printPdf: printPdf };
  root.RedditExportUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
