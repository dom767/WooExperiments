/* /consent.js: GA4 + Consent Mode v2 + minimal cookie bar. Load in <head> of every page. */
(function () {
  var GA_ID = 'G-SVS1THC5ZL', KEY = 'bc-consent', stored = null;
  window.bcCookieSettings = function () { try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); };
  if (GA_ID.indexOf('XXXX') !== -1) return; // no Measurement ID set yet: do nothing (no bar, no GA)
  try { stored = localStorage.getItem(KEY); } catch (e) {}
  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
    analytics_storage: stored === 'granted' ? 'granted' : 'denied' });
  gtag('js', new Date()); gtag('config', GA_ID);
  var s = document.createElement('script'); s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID; document.head.appendChild(s);
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
    if (a.hostname === 'play.google.com') gtag('event', 'play_store_click', { link_url: a.href });
    var m = a.pathname.match(/^\/(highpersonic3|vulcan|exoplanetviewer|bifurcation)\/(index\.html)?$/);
    if (m && a.hostname === location.hostname) gtag('event', 'app_launch', { app_name: m[1] });
  });
  if (stored === 'granted' || stored === 'denied') return;
  document.addEventListener('DOMContentLoaded', function () {
    var css = document.createElement('style');
    css.textContent = '#bc-consent{position:fixed;left:0;right:0;bottom:0;z-index:1000;display:flex;flex-wrap:wrap;gap:.6rem;align-items:center;justify-content:center;padding:.6rem 1rem;background:#262019;color:#f2ece0;font:14px/1.4 system-ui,sans-serif;border-top:1px solid #3a3128}' +
      '#bc-consent a{color:inherit}#bc-consent button{min-width:6rem;padding:.4rem .9rem;font:inherit;border:1px solid #f2ece0;border-radius:6px;background:transparent;color:inherit;cursor:pointer}';
    var bar = document.createElement('div'); bar.id = 'bc-consent'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Cookie consent');
    bar.innerHTML = '<span>We use cookies to see how the site is used. <a href="/privacy.html#website-analytics">Privacy</a></span>' +
      '<button type="button" data-v="granted">Accept</button><button type="button" data-v="denied">Reject</button>';
    bar.addEventListener('click', function (e) {
      var v = e.target.getAttribute('data-v'); if (!v) return;
      try { localStorage.setItem(KEY, v); } catch (err) {}
      gtag('consent', 'update', { analytics_storage: v }); bar.remove();
    });
    document.head.appendChild(css); document.body.appendChild(bar);
  });
})();
