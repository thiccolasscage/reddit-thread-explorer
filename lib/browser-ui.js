/*
 * browser-ui.js — in-page panel used by the bookmarklet and the Firefox extension.
 * Requires RedditParse, RedditHtmlToMd, RedditExport globals (concatenated by scripts/build-bookmarklet.js).
 */
(function (root) {
  'use strict';
  var PANEL_ID = '__reddit_export_panel__';

  function parseHere(doc) {
    doc = doc || document;
    if (!/(^|\.)old\.reddit\.com$/.test(location.hostname) || !/\/comments\//.test(location.pathname)) {
      throw new Error('Open an old.reddit.com/r/.../comments/... thread first.\nTry: ' + toOld(location.href));
    }
    return root.RedditParse.parseDocument(doc, { url: location.href, toMarkdown: root.RedditHtmlToMd.htmlToMarkdown });
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
    label.textContent = 'Export: ' + root.RedditExport.countComments(t.comments) + ' comments' +
      (t.stats.moreLinksSkipped ? ' (+' + t.stats.moreLinksSkipped + ' unexpanded)' : '');
    label.style.marginRight = '6px';
    p.appendChild(label);
    [['md', 'MD'], ['json', 'JSON'], ['txt', 'TXT'], ['pdf', 'Print → PDF'], ['copy', 'Copy MD']].forEach(function (b) {
      var btn = document.createElement('button');
      btn.textContent = b[1];
      btn.setAttribute('style', 'background:#ff4500;color:#fff;border:0;border-radius:4px;padding:4px 9px;cursor:pointer;font:600 12px system-ui,sans-serif');
      btn.onclick = function () {
        try { t = parseHere(document); exportAs(t, b[0]); flash(b[1] + ' ✓'); } catch (e) { alert('Reddit export: ' + e.message); }
      };
      p.appendChild(btn);
    });
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
