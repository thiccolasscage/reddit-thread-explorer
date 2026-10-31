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

  // "load more comments" carries the hidden ids in its onclick: morechildren(this, 't3_x', 'sort', 'id1,id2', ...)
  // "continue this thread" links to the parent comment's permalink page.
  function moreStub(A, thing, depth) {
    var stub = { type: A.hasClass(thing, 'morerecursion') ? 'recursion' : 'children', depth: depth, ids: [], url: null };
    var a = first(A.find(thing, '.morecomments a')) || first(A.find(thing, '.deepthread a')) || first(A.find(thing, 'a'));
    var m = /morechildren\(\s*this\s*,\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'([^']*)'/.exec(A.attr(a, 'onclick') || '');
    if (m) stub.ids = m[1].split(',').map(function (x) { return stripPrefix(x.trim()); }).filter(Boolean);
    var href = A.attr(a, 'href') || '';
    if (stub.type === 'recursion' && /\/comments\//.test(href)) {
      try { stub.url = normalizeOldRedditUrl(new URL(href, 'https://old.reddit.com').toString()); } catch (e) { /* unusable */ }
    }
    return stub;
  }

  function parseCommentList(A, sitetable, depth, toMd, stats, opts) {
    if (!sitetable) return [];
    var out = [];
    A.children(sitetable, 'thing').forEach(function (t) {
      if (isSkippable(A, t)) { stats.more++; if (opts.keepMore) out.push({ __more: moreStub(A, t, depth) }); return; }
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
    return (list || []).reduce(function (n, c) { return c.__more ? n : n + 1 + countComments(c.replies); }, 0);
  }

  /* ---------- load-more expansion (HTML pages only, never the .json API) ---------- */
  function walk(list, fn, parent) {
    (list || []).slice().forEach(function (c) { fn(c, parent || list); if (!c.__more) walk(c.replies, fn, c.replies); });
  }
  function rebase(list, depth) { (list || []).forEach(function (c) { if (c.__more) c.__more.depth = depth; else { c.depth = depth; rebase(c.replies, depth + 1); } }); }
  function idsIn(list, set) { walk(list, function (c) { if (!c.__more) set[c.id] = true; }); return set; }
  function dropSeen(list, seen) {
    return (list || []).filter(function (c) { return c.__more || !seen[c.id]; }).map(function (c) {
      if (!c.__more) c.replies = dropSeen(c.replies, seen);
      return c;
    });
  }
  // Permalink base for comments in this thread: https://old.reddit.com/r/sub/comments/<post>/<slug>/
  function commentBase(thread) {
    var u = new URL(thread.url || 'https://old.reddit.com/');
    var m = /^(\/r\/[^/]+)?\/comments\/([a-z0-9]+)(?:\/([^/]+))?/i.exec(u.pathname);
    if (!m) return null;
    var sub = m[1] || (thread.post && thread.post.subreddit ? '/r/' + thread.post.subreddit : '');
    return { prefix: 'https://old.reddit.com' + sub + '/comments/' + m[2] + '/' + (m[3] || '_') + '/', search: u.search };
  }
  function stripMore(list) {
    return (list || []).filter(function (c) { return !c.__more; }).map(function (c) { c.replies = stripMore(c.replies); return c; });
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /**
   * expandMore(thread, { fetchThread(url) -> Promise<thread parsed with keepMore>, maxFetches, delayMs, onProgress })
   * thread must come from parseThread(..., { keepMore: true }). Fetches each "continue this thread" page and each
   * hidden comment's own permalink page, grafts the subtrees in place, then strips any stubs left over
   * (pass keepStubs: true to leave them in, so a later call can continue where this one stopped).
   */
  async function expandMore(thread, opts) {
    opts = opts || {};
    var max = opts.maxFetches == null ? 40 : opts.maxFetches, delay = opts.delayMs == null ? 1000 : opts.delayMs;
    var base = commentBase(thread), seen = idsIn(thread.comments, {}), queue = [];
    var st = { pagesFetched: 0, moreLinksExpanded: 0, errors: 0, stopped: null };
    function enqueue(list, arr) { walk(list, function (c, a) { if (c.__more) queue.push({ arr: a, ph: c }); }, arr); }
    enqueue(thread.comments, thread.comments);
    async function get(url) {
      if (st.pagesFetched && delay) await sleep(delay);
      st.pagesFetched++;
      if (opts.onProgress) opts.onProgress({ fetched: st.pagesFetched, max: max, pending: queue.length });
      return opts.fetchThread(url);
    }
    while (queue.length && !st.stopped) {
      var item = queue.shift(), stub = item.ph.__more, pos = item.arr.indexOf(item.ph);
      if (pos < 0) continue;
      var roots = [], left = [];
      try {
        if (stub.type === 'recursion' && stub.url) {
          if (st.pagesFetched >= max) { st.stopped = 'limit'; break; }
          var t2 = await get(stub.url);
          var pid = (/\/comments\/[^/]+\/[^/]+\/([a-z0-9]+)\/?(\?|$)/i.exec(stub.url) || [])[1];
          var tops = t2.comments.filter(function (c) { return !c.__more; });
          var parent = tops.filter(function (c) { return c.id === pid; })[0] || tops[0];
          roots = parent ? parent.replies : [];
        } else if (stub.type === 'children' && base && stub.ids.length) {
          var ids = stub.ids.filter(function (id) { return !seen[id]; }), got = {};
          for (var i = 0; i < ids.length; i++) {
            if (got[ids[i]]) continue; // arrived inside an earlier subtree
            if (st.pagesFetched >= max) { left = ids.slice(i); st.stopped = 'limit'; break; }
            var t3 = await get(base.prefix + ids[i] + '/' + base.search);
            var root = t3.comments.filter(function (c) { return c.id === ids[i]; })[0];
            if (root) { roots.push(root); idsIn([root], got); }
          }
          // a listed id can be a descendant of another listed id: keep only the outermost
          var inner = {};
          roots.forEach(function (r) { idsIn(r.replies, inner); });
          roots = roots.filter(function (r) { return !inner[r.id]; });
        } else continue; // no ids / no link: nothing to fetch
      } catch (e) {
        st.errors++;
        if (e && (e.status === 403 || e.status === 429)) st.stopped = 'HTTP ' + e.status;
        continue;
      }
      roots = dropSeen(roots, seen);
      idsIn(roots, seen);
      rebase(roots, stub.depth);
      if (left.length) { stub.ids = left; roots.push(item.ph); } else st.moreLinksExpanded++;
      item.arr.splice.apply(item.arr, [pos, 1].concat(roots));
      enqueue(roots.filter(function (c) { return c !== item.ph; }), item.arr);
    }
    var remaining = 0;
    walk(thread.comments, function (c) { if (c.__more) remaining++; });
    if (!opts.keepStubs) thread.comments = stripMore(thread.comments);
    thread.stats = {
      commentsParsed: countComments(thread.comments), moreLinksSkipped: remaining,
      moreLinksExpanded: st.moreLinksExpanded, pagesFetched: st.pagesFetched
    };
    if (st.stopped) thread.stats.expandStopped = st.stopped;
    if (st.errors) thread.stats.fetchErrors = st.errors;
    return thread;
  }

  var api = {
    normalizeOldRedditUrl: normalizeOldRedditUrl,
    parseThread: parseThread,
    parseDocument: parseDocument,
    parseCheerio: parseCheerio,
    domAdapter: domAdapter,
    cheerioAdapter: cheerioAdapter,
    countComments: countComments,
    expandMore: expandMore,
    stripMore: function (t) { t.comments = stripMore(t.comments); return t; }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RedditParse = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
