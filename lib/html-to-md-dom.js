/*
 * html-to-md-dom.js — tiny DOM → Markdown converter for the browser (bookmarklet / extension / HTML tool).
 * Node uses turndown instead (see lib/node-parse.js). Handles what reddit's .md divs contain.
 */
(function (root) {
  'use strict';
  function conv(node, ctx) {
    ctx = ctx || { list: [] };
    if (node.nodeType === 3) return node.nodeValue.replace(/\s+/g, ' ');
    if (node.nodeType !== 1) return '';
    var tag = node.tagName.toLowerCase();
    var kids = function (c) { return Array.prototype.map.call(node.childNodes, function (n) { return conv(n, c || ctx); }).join(''); };
    switch (tag) {
      case 'p': return '\n\n' + kids().trim() + '\n\n';
      case 'br': return '  \n';
      case 'strong': case 'b': return '**' + kids() + '**';
      case 'em': case 'i': return '*' + kids() + '*';
      case 'del': case 's': return '~~' + kids() + '~~';
      case 'sup': return '^(' + kids() + ')';
      case 'code': return node.parentNode && node.parentNode.tagName && node.parentNode.tagName.toLowerCase() === 'pre' ? node.textContent : '`' + node.textContent + '`';
      case 'pre': return '\n\n```\n' + node.textContent.replace(/\n$/, '') + '\n```\n\n';
      case 'a': {
        var href = node.getAttribute('href') || '';
        if (href.charAt(0) === '/') href = 'https://old.reddit.com' + href;
        var t = kids().trim();
        return href ? '[' + (t || href) + '](' + href + ')' : t;
      }
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
        return '\n\n' + '######'.slice(0, +tag[1]) + ' ' + kids().trim() + '\n\n';
      case 'hr': return '\n\n---\n\n';
      case 'blockquote':
        return '\n\n' + mdOf(node).split('\n').map(function (l) { return '> ' + l; }).join('\n') + '\n\n';
      case 'ul': case 'ol': {
        var i = 0, ordered = tag === 'ol', depth = ctx.list.length;
        var items = Array.prototype.filter.call(node.children, function (c) { return c.tagName.toLowerCase() === 'li'; }).map(function (li) {
          i++;
          var inner = Array.prototype.map.call(li.childNodes, function (n) { return conv(n, { list: ctx.list.concat(tag) }); }).join('').replace(/\n{3,}/g, '\n\n').trim();
          var pad = new Array(depth + 1).join('    ');
          return pad + (ordered ? i + '. ' : '- ') + inner.replace(/\n/g, '\n' + pad + '  ');
        });
        return '\n\n' + items.join('\n') + '\n\n';
      }
      case 'table': {
        var rows = Array.prototype.map.call(node.querySelectorAll('tr'), function (tr) {
          return '| ' + Array.prototype.map.call(tr.children, function (td) { return mdOf(td).replace(/\|/g, '\\|').replace(/\n/g, ' '); }).join(' | ') + ' |';
        });
        if (rows.length) { var cols = (rows[0].match(/ \| /g) || []).length + 1; rows.splice(1, 0, '|' + new Array(cols + 1).join(' --- |')); }
        return '\n\n' + rows.join('\n') + '\n\n';
      }
      case 'img': return '![' + (node.getAttribute('alt') || '') + '](' + (node.getAttribute('src') || '') + ')';
      case 'script': case 'style': return '';
      default: return kids();
    }
  }
  function mdOf(node) {
    return Array.prototype.map.call(node.childNodes, function (n) { return conv(n); }).join('')
      .replace(/[ \t]+\n/g, function (m) { return /  \n$/.test(m) ? '  \n' : '\n'; })
      .replace(/\n{3,}/g, '\n\n').trim();
  }
  function htmlToMarkdown(html, node) {
    if (!node) node = new DOMParser().parseFromString(String(html), "text/html").body;
    return mdOf(node);
  }
  var api = { htmlToMarkdown: htmlToMarkdown };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RedditHtmlToMd = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
