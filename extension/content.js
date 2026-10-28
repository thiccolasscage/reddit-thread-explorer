// Firefox content script: injects a persistent export toolbar on old.reddit thread pages.
// Shared logic lives in lib/ (copied from ../lib by `npm run build`).
(function () {
  if (window.__redditExportInjected) return;
  window.__redditExportInjected = true;
  try {
    globalThis.RedditExportUI.showPanel({ persistent: true });
    var p = document.getElementById('__reddit_export_panel__');
    if (p) { p.style.top = 'auto'; p.style.bottom = '12px'; p.style.right = '12px'; }
  } catch (e) {
    console.warn('[reddit-export]', e);
  }
})();
