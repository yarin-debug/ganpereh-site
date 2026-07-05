/* מעקב המרות גן פרא — קליקים על וואטסאפ/טלפון + טפסים.
   שולח ל-Meta Pixel (Lead) ול-GA4 (generate_lead) אם מותקנים. */
(function () {
  function fire(name) {
    if (window.fbq) fbq("track", "Lead", { content_name: name });
    if (typeof gtag === "function") gtag("event", "generate_lead", { lead_source: name });
  }

  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    var href = a.getAttribute("href") || "";
    var isWa = href.indexOf("wa.me") !== -1;
    var isTel = href.indexOf("tel:") === 0;
    if (!isWa && !isTel) return;
    var name = a.getAttribute("data-track");
    if (!name) {
      var scope = a.closest("[id], .wa-float, .sticky-wa-bar, .cta-section, nav, footer");
      if (scope)
        name = scope.id || (scope.className || "").split(" ")[0] || scope.tagName.toLowerCase();
    }
    fire((isWa ? "wa_" : "tel_") + (name || "page"));
  });

  window.gpTrackLead = fire; /* לקריאה ידנית — למשל בהצלחת טופס */
})();
