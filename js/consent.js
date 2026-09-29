// Cookie consent banner + privacy link, shared by every page on this site.
// Include with: <script src="/js/consent.js" defer></script>
// Tags that set cookies (affiliate, analytics) must only load after consent:
//   window.siteConsent.onGranted(() => { /* load CJ / analytics script */ });
(() => {
  const KEY = "site-consent-v1";
  const PRIVACY = "/privacy.html";
  const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const write = (v) => { try { localStorage.setItem(KEY, v); } catch {} };

  const waiting = [];
  const consent = {
    status: () => read(),
    granted: () => read() === "granted",
    onGranted(cb) { if (consent.granted()) cb(); else waiting.push(cb); },
    open: () => showBanner(),
  };
  window.siteConsent = consent;

  // Embeds run inside other sites' iframes; they set no cookies, so skip the UI.
  const embedded = window.top !== window.self;

  const css = `
    .sc-banner{position:fixed;left:16px;right:16px;bottom:16px;z-index:99999;max-width:640px;margin:0 auto;
      background:#1f2933;color:#f5f7fa;border-radius:10px;padding:14px 16px;box-shadow:0 6px 24px rgba(0,0,0,.25);
      font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center}
    .sc-banner p{margin:0;flex:1 1 320px}
    .sc-banner a{color:#9fd3ff}
    .sc-actions{display:flex;gap:8px}
    .sc-banner button{font:inherit;border:0;border-radius:6px;padding:7px 14px;cursor:pointer}
    .sc-accept{background:#3b82f6;color:#fff}
    .sc-decline{background:transparent;color:#f5f7fa;outline:1px solid #6b7785}
    .sc-links{text-align:center;font:13px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:12px 16px;opacity:.8}
    .sc-links a,.sc-links button{color:inherit;background:none;border:0;padding:0;font:inherit;cursor:pointer;text-decoration:underline}`;

  function addStyle() {
    if (document.getElementById("sc-style")) return;
    const s = document.createElement("style");
    s.id = "sc-style";
    s.textContent = css;
    document.head.appendChild(s);
  }

  function decide(v) {
    write(v);
    document.querySelector(".sc-banner")?.remove();
    if (v === "granted") waiting.splice(0).forEach((cb) => { try { cb(); } catch (e) { console.error(e); } });
  }

  function showBanner() {
    if (embedded || document.querySelector(".sc-banner")) return;
    addStyle();
    const b = document.createElement("div");
    b.className = "sc-banner";
    b.setAttribute("role", "dialog");
    b.setAttribute("aria-label", "Cookie consent");
    b.innerHTML = `<p>We use cookies and similar technologies, including affiliate tracking by
      <a href="https://www.cj.com/legal/privacy" target="_blank" rel="noopener">CJ Affiliate</a> and our partners,
      to measure referrals and improve the site. See our <a href="${PRIVACY}">Privacy Policy</a>.</p>
      <div class="sc-actions"><button class="sc-decline" type="button">Decline</button>
      <button class="sc-accept" type="button">Accept</button></div>`;
    b.querySelector(".sc-accept").onclick = () => decide("granted");
    b.querySelector(".sc-decline").onclick = () => decide("denied");
    document.body.appendChild(b);
  }

  function addLinks() {
    if (embedded || document.querySelector(".sc-links") || location.pathname === PRIVACY) return;
    addStyle();
    const d = document.createElement("div");
    d.className = "sc-links";
    d.innerHTML = `<a href="${PRIVACY}">Privacy Policy</a> · <button type="button">Cookie settings</button>`;
    d.querySelector("button").onclick = () => showBanner();
    document.body.appendChild(d);
  }

  function init() {
    addLinks();
    if (!read()) showBanner();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
