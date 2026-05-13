// Splash screen lifecycle helper.
//
// Loaded via <script src="/splash.js"> from index.html so it passes Tauri's
// `script-src 'self'` CSP (inline scripts are blocked there). Defines a
// global hide function that React calls once auth has resolved, plus a
// safety timeout that auto-hides the splash if React never comes around
// (build error, network freeze, etc.) — better to land on a blank app than
// stay stuck on a spinning logo.
(function () {
    var SPLASH_ID = 'shardtown-splash';
    var MIN_DISPLAY_MS = 600;
    var SAFETY_TIMEOUT_MS = 6000;
    var startedAt = Date.now();

    function hideNow() {
        var el = document.getElementById(SPLASH_ID);
        if (!el) return;
        el.classList.add('is-leaving');
        setTimeout(function () { el.remove(); }, 420);
    }

    function hide() {
        var elapsed = Date.now() - startedAt;
        var remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);
        setTimeout(hideNow, remaining);
    }

    // Expose the entry point React calls in the finally of /api/me.
    window.__shardtownHideSplash = hide;

    // Safety net: if React never calls us within 6 s (broken bundle,
    // unreachable API, etc.), tear the splash down anyway. Without this the
    // user is stuck on a spinning logo forever.
    setTimeout(function () {
        if (document.getElementById(SPLASH_ID)) {
            console.warn('[splash] React never signalled ready, auto-hiding.');
            hideNow();
        }
    }, SAFETY_TIMEOUT_MS);
})();
