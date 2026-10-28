/*
 * parse-old-reddit.js — shared old.reddit.com thread parser.
 * Works in the browser (native DOM) and in Node (cheerio) via a tiny adapter.
 * Plain script: no imports, so it can be inlined into the bookmarklet / extension.
 */
(function (root) {
  'use strict';

  /* ---------- URL helpers ---------- */
  function normalizeOldRedditUrl(input) {
    if (!input) throw new Error('No URL given');
    var s = String(input).trim();
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    var u = new URL(s);
    var host = u.hostname.toLowerCase();
    if (host === 'redd.it') throw new Error('Short redd.it links are not supported; open the thread and copy its full URL');
    if (!/(^|\.)reddit\.com$/.test(host)) throw new Error('Not a reddit.com URL: ' + input);
    u.protocol = 'https:';
    u.hostname = 'old.reddit.com';
    if (!/\/comments\/[a-z0-9]+/i.test(u.pathname)) throw new Error('Not a thread (/comments/) URL: ' + input);
    u.hash = '';
    // drop tracking params, keep sort/limit/context
    var keep = new URLSearchParams();
    ['sort', 'limit', 'context', 'depth'].forEach(function (k) { if (u.searchParams.has(k)) keep.set(k, u.searchParams.get(k)); });
    u.search = keep.toString() ? '?' + keep.toString() : '';
    return u.toString();
  }

  /* ---------- adapters ---------- */
  // Adapter interface: find(el, sel)[], children(el, cls)[], attr(el,n), text(el), html(el), hasClass(el,c), docRoot
  function domAdapter(doc) {
    return {
      root: doc,
      find: function (el, sel) { return Array.prototype.slice.call((el || doc).querySelectorAll(sel)); },
      children: function (el, cls) {
        if (!el) return [];
        return Array.prototype.filter.call(el.children, function (c) { return matchesAll(c.classList, cls); });
      },
      attr: function (el, n) { return el ? el.getAttribute(n) : null; },
      text: function (el) { return el ? (el.textContent || '').trim() : ''; },
      html: function (el) { return el ? el.innerHTML : ''; },
      node: function (el) { return el; },
      hasClass: function (el, c) { return !!el && el.classList.contains(c); }
    };
    function matchesAll(classList, cls) {
      return cls.split('.').filter(Boolean).every(function (c) { return classList.contains(c); });
    }
  }

  function cheerioAdapter($) {
    return {
      root: null,
      find: function (el, sel) { return (el ? $(el).find(sel) : $(sel)).toArray(); },
      children: function (el, cls) { return el ? $(el).children('.' + cls.split('.').filter(Boolean).join('.')).toArray() : []; },
      attr: function (el, n) { var v = el ? $(el).attr(n) : undefined; return v === undefined ? null : v; },
      text: function (el) { return el ? $(el).text().trim() : ''; },
      html: function (el) { return el ? ($(el).html() || '') : ''; },
      node: function (el) { return el; },
      hasClass: function (el, c) { return !!el && $(el).hasClass(c); }
    };
  }

  /* ---------- small utils ---------- */
  function first(a) { return a && a.length ? a[0] : null; }
  function toInt(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = parseInt(String(v).replace(/[^0-9-]/g, ''), 10);
    return isNaN(n) ? null : n;
  }
  function toIso(v) {
    if (!v) return null;
    var d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  function stripPrefix(id) { return id ? String(id).replace(/^t[0-9]_/, '') : ''; }
  function normAuthor(a) { return a && a !== '[deleted]' ? (/^u\//.test(a) ? a : 'u/' + a) : '[deleted]'; }

  // the element's own .entry (not a descendant reply's)
  function ownEntry(A, thing) { return first(A.children(thing, 'entry')); }

  function bodyOf(A, entry, toMd) {
    if (!entry) return '';
    var md = first(A.find(entry, '.usertext-body .md'));
    if (!md) return '';
    return toMd(A.html(md), A.node(md)).trim();
  }

  function scoreOf(A, thing, entry) {
    var s = toInt(A.attr(thing, 'data-score'));
    if (s !== null) return s;
    if (entry) {
      // comments: <span class="score unvoted" title="12">12 points</span>
      var sc = first(A.find(entry, '.tagline .score.unvoted')) || first(A.find(entry, '.score.unvoted')) || first(A.find(entry, '.score'));
      if (sc) {
        var t = toInt(A.attr(sc, 'title'));
        if (t !== null) return t;
        var x = toInt(A.text(sc));
        if (x !== null) return x;
      }
    }
    var ms = first(A.children(thing, 'midcol'));
    if (ms) { var u = first(A.find(ms, '.score.unvoted')); if (u) { var v = toInt(A.attr(u, 'title')) ; if (v === null) v = toInt(A.text(u)); if (v !== null) return v; } }
    return null; // hidden / unknown
  }

  function createdOf(A, entry) {
    if (!entry) return null;
    var t = first(A.find(entry, '.tagline time[datetime]')) || first(A.find(entry, 'time[datetime]'));
    return t ? toIso(A.attr(t, 'datetime')) : null;
  }

  function authorOf(A, thing, entry) {
    var a = A.attr(thing, 'data-author');
    if (!a && entry) { var el = first(A.find(entry, '.tagline a.author')) || first(A.find(entry, 'a.author')); a = el ? A.text(el) : null; }
    return normAuthor(a);
  }

  /* ---------- comments ---------- */
  function isSkippable(A, thing) {
    return A.hasClass(thing, 'morechildren') || A.hasClass(thing, 'morerecursion');
  }

  function parseComment(A, thing, depth, toMd, stats, opts) {
    var entry = ownEntry(A, thing);
    var deleted = A.hasClass(thing, 'deleted');
    var c = {
      id: stripPrefix(A.attr(thing, 'data-fullname') || A.attr(thing, 'id')),
      author: deleted ? '[deleted]' : authorOf(A, thing, entry),
      score: scoreOf(A, thing, entry),
      createdAt: createdOf(A, entry),
      body: bodyOf(A, entry, toMd),
      depth: depth,
      replies: []
    };
    if (A.hasClass(thing, 'stickied')) c.stickied = true;
    if (A.hasClass(thing, 'collapsed')) c.collapsed = true;
    if (deleted && !c.body) c.body = '[deleted]';
    stats.count++;
    if (opts.maxDepth == null || depth < opts.maxDepth) {
      var child = first(A.children(thing, 'child'));
      var st = child ? first(A.children(child, 'sitetable')) : null;
      c.replies = parseCommentList(A, st, depth + 1, toMd, stats, opts);
    }
    return c;
  }

  function parseCommentList(A, sitetable, depth, toMd, stats, opts) {
    if (!sitetable) return [];
    var out = [];
    A.children(sitetable, 'thing').forEach(function (t) {
      if (isSkippable(A, t)) { stats.more++; return; }
      if (!A.hasClass(t, 'comment')) return;
      out.push(parseComment(A, t, depth, toMd, stats, opts));
    });
    return out;
  }

  /* ---------- post ---------- */
  function parsePost(A, toMd) {
    var thing = first(A.find(null, '#siteTable .thing.link')) || first(A.find(null, '.thing.link'));
    if (!thing) throw new Error('No post found (#siteTable .thing.link). Is this an old.reddit.com comments page?');
    var entry = ownEntry(A, thing) || thing;
    var titleEl = first(A.find(entry, 'a.title')) || first(A.find(thing, 'a.title'));
    var flairEl = first(A.find(entry, '.linkflairlabel'));
    var flair = flairEl ? (A.attr(flairEl, 'title') || A.text(flairEl)) : null;
    var sub = A.attr(thing, 'data-subreddit');
    if (!sub) { var s = first(A.find(entry, 'a.subreddit')); sub = s ? A.text(s).replace(/^\/?r\//, '') : ''; }
    var post = {
      id: stripPrefix(A.attr(thing, 'data-fullnameid') || A.attr(thing, 'data-fullname') || A.attr(thing, 'id')),
      subreddit: sub || '',
      title: titleEl ? A.text(titleEl) : '',
      author: authorOf(A, thing, entry),
      score: scoreOf(A, thing, entry),
      createdAt: toIso(A.attr(thing, 'data-timestamp') ? Number(A.attr(thing, 'data-timestamp')) : null) || createdOf(A, entry),
      body: bodyOf(A, entry, toMd),
      flair: flair || null,
      nsfw: A.attr(thing, 'data-nsfw') === 'true' || A.hasClass(thing, 'over18')
    };
    var linkUrl = A.attr(thing, 'data-url');
    if (linkUrl && !/\/comments\//.test(linkUrl)) post.linkUrl = /^\//.test(linkUrl) ? 'https://old.reddit.com' + linkUrl : linkUrl;
    var permalink = A.attr(thing, 'data-permalink');
    return { post: post, permalink: permalink ? 'https://old.reddit.com' + permalink : null };
  }

  /**
   * parseThread(adapter, { url, toMarkdown(html, node), maxDepth })
   */
  function parseThread(A, opts) {
    opts = opts || {};
    var toMd = opts.toMarkdown || function (html, node) { return node && node.textContent != null ? node.textContent : String(html).replace(/<[^>]+>/g, ''); };
    var p = parsePost(A, toMd);
    var area = first(A.find(null, '.commentarea'));
    var top = area ? first(A.children(area, 'sitetable')) : null;
    var stats = { count: 0, more: 0 };
    var comments = parseCommentList(A, top, 0, toMd, stats, opts);
    var url = opts.url || p.permalink || '';
    try { if (url) url = normalizeOldRedditUrl(url); } catch (e) { /* keep raw */ }
    return {
      url: url,
      fetchedAt: new Date().toISOString(),
      post: p.post,
      comments: comments,
      stats: { commentsParsed: stats.count, moreLinksSkipped: stats.more }
    };
  }

  function parseDocument(doc, opts) { return parseThread(domAdapter(doc), opts); }
  function parseCheerio($, opts) { return parseThread(cheerioAdapter($), opts); }

  function countComments(list) {
    return (list || []).reduce(function (n, c) { return n + 1 + countComments(c.replies); }, 0);
  }

  var api = {
    normalizeOldRedditUrl: normalizeOldRedditUrl,
    parseThread: parseThread,
    parseDocument: parseDocument,
    parseCheerio: parseCheerio,
    domAdapter: domAdapter,
    cheerioAdapter: cheerioAdapter,
    countComments: countComments
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RedditParse = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
