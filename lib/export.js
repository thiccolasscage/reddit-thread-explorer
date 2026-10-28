/*
 * export.js — render a parsed thread tree to Markdown / JSON / TXT / printable HTML (for PDF).
 * Plain script, shared by Node, bookmarklet, HTML tool and Firefox extension.
 * PDF: browser paths open toPrintHtml() in a window and call window.print();
 *      CLI renders toPrintHtml() with Playwright page.pdf().
 */
(function (root) {
  'use strict';
  function fmtScore(s) { return s === null || s === undefined ? '?' : String(s); }
  function fmtDate(d) { return d ? d.replace('T', ' ').replace(/\.\d+Z$/, 'Z') : 'unknown date'; }
  function indent(text, prefix) { return text.split('\n').map(function (l) { return prefix + l; }).join('\n'); }

  function toJSON(t) { return JSON.stringify(t, null, 2) + '\n'; }

  function toMarkdown(t) {
    var p = t.post, out = [];
    out.push('# ' + (p.title || '(untitled)'));
    out.push('');
    var meta = ['r/' + p.subreddit, p.author, fmtScore(p.score) + ' points', fmtDate(p.createdAt)];
    if (p.flair) meta.push('flair: ' + p.flair);
    if (p.nsfw) meta.push('NSFW');
    out.push('*' + meta.join(' · ') + '*  ');
    out.push('Source: <' + t.url + '>  ');
    out.push('Exported: ' + fmtDate(t.fetchedAt));
    if (p.linkUrl) { out.push(''); out.push('Link: <' + p.linkUrl + '>'); }
    if (p.body) { out.push(''); out.push(p.body); }
    out.push('');
    out.push('---');
    out.push('');
    out.push('## Comments (' + count(t.comments) + ')');
    out.push('');
    (function walk(list) {
      list.forEach(function (c) {
        var pre = new Array(c.depth + 1).join('> ');
        out.push(pre + '**' + c.author + '** · ' + fmtScore(c.score) + ' pts · ' + fmtDate(c.createdAt));
        out.push(pre.replace(/ $/, ''));
        out.push(indent(c.body || '', pre));
        out.push('');
        walk(c.replies || []);
      });
    })(t.comments || []);
    return out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
  }

  function plain(md) {
    return String(md || '')
      .replace(/```[a-z]*\n?/g, '')
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1 ($2)')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (m, a, b) { return a === b ? a : a + ' (' + b + ')'; })
      .replace(/(\*\*|__)(.*?)\1/g, '$2')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2')
      .replace(/~~(.*?)~~/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^>\s?/gm, '')
      .replace(/\\([\\`*_{}\[\]()#+\-.!>|])/g, '$1');
  }

  function toText(t) {
    var p = t.post, out = [];
    out.push(p.title || '(untitled)');
    out.push('r/' + p.subreddit + ' | ' + p.author + ' | ' + fmtScore(p.score) + ' points | ' + fmtDate(p.createdAt) + (p.nsfw ? ' | NSFW' : ''));
    out.push('Source: ' + t.url);
    if (p.linkUrl) out.push('Link: ' + p.linkUrl);
    if (p.body) { out.push(''); out.push(plain(p.body)); }
    out.push('');
    out.push('==== Comments (' + count(t.comments) + ') ====');
    (function walk(list) {
      list.forEach(function (c) {
        var pad = new Array(c.depth + 1).join('    ');
        out.push('');
        out.push(pad + c.author + ' | ' + fmtScore(c.score) + ' pts | ' + fmtDate(c.createdAt));
        out.push(indent(plain(c.body), pad));
        walk(c.replies || []);
      });
    })(t.comments || []);
    return out.join('\n') + '\n';
  }

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  // minimal md -> html for print: paragraphs, bold/italic, code, links, quotes kept simple
  function mdToHtml(md) {
    var blocks = String(md || '').split(/\n{2,}/);
    return blocks.map(function (b) {
      if (/^```/.test(b)) return '<pre>' + esc(b.replace(/^```[a-z]*\n?|```$/g, '')) + '</pre>';
      var h = esc(b)
        .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
        .replace(/~~(.+?)~~/g, '<del>$1</del>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
      if (/^&gt; ?/.test(b)) return '<blockquote>' + h.replace(/^&gt; ?/gm, '').replace(/\n/g, '<br>') + '</blockquote>';
      return '<p>' + h.replace(/\n/g, '<br>') + '</p>';
    }).join('\n');
  }

  function toPrintHtml(t) {
    var p = t.post;
    var css = 'body{font:14px/1.5 Georgia,serif;max-width:780px;margin:24px auto;color:#111;padding:0 16px}' +
      'h1{font-size:22px;margin:0 0 4px}.meta{color:#555;font:12px/1.4 system-ui,sans-serif;margin-bottom:12px}' +
      '.c{border-left:2px solid #ccc;padding-left:10px;margin:10px 0 0 0;break-inside:avoid-page}' +
      '.c .c{margin-left:8px}.a{font:600 12px system-ui,sans-serif;color:#246}.a span{font-weight:400;color:#777}' +
      'pre{white-space:pre-wrap;background:#f4f4f4;padding:8px}blockquote{color:#555;border-left:3px solid #ddd;margin:0;padding-left:8px}' +
      'a{color:#1a5fb4;word-break:break-all}@page{margin:14mm}';
    function cm(c) {
      return '<div class="c"><div class="a">' + esc(c.author) + ' <span>· ' + esc(fmtScore(c.score)) + ' pts · ' + esc(fmtDate(c.createdAt)) + '</span></div>' +
        mdToHtml(c.body) + (c.replies || []).map(cm).join('') + '</div>';
    }
    return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(p.title) + '</title><style>' + css + '</style></head><body>' +
      '<h1>' + esc(p.title) + '</h1><div class="meta">r/' + esc(p.subreddit) + ' · ' + esc(p.author) + ' · ' + esc(fmtScore(p.score)) + ' points · ' + esc(fmtDate(p.createdAt)) +
      (p.flair ? ' · ' + esc(p.flair) : '') + (p.nsfw ? ' · NSFW' : '') + '<br>' + esc(t.url) + '</div>' +
      (p.linkUrl ? '<p><a href="' + esc(p.linkUrl) + '">' + esc(p.linkUrl) + '</a></p>' : '') +
      mdToHtml(p.body) + '<hr><h2 style="font-size:16px">Comments (' + count(t.comments) + ')</h2>' +
      (t.comments || []).map(cm).join('') + '</body></html>';
  }

  function count(list) { return (list || []).reduce(function (n, c) { return n + 1 + count(c.replies); }, 0); }

  function fileBase(t) {
    var s = (t.post.subreddit || 'reddit') + '_' + (t.post.id || 'thread') + '_' + (t.post.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50);
    return s.replace(/-+$/, '');
  }

  function render(t, format) {
    switch (format) {
      case 'md': return toMarkdown(t);
      case 'json': return toJSON(t);
      case 'txt': return toText(t);
      case 'html': return toPrintHtml(t);
      default: throw new Error('Unknown format: ' + format);
    }
  }

  var api = { toMarkdown: toMarkdown, toJSON: toJSON, toText: toText, toPrintHtml: toPrintHtml, render: render, fileBase: fileBase, countComments: count };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RedditExport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
