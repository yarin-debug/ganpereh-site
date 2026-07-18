/* תפריט אתר משותף (עמודי משנה) — נפתח "שירותים", סמן pill נע, המבורגר ומגירת מובייל.
   התפריט בעמודי המשנה תמיד במצב מלא/לבן, אז אין לוגיקת scroll-solid כמו בעמוד הבית. */
(function () {
  // ── תפריט נפתח בדסקטופ (קליק לפתיחה, סגירה בקליק בחוץ / Escape) ──
  function closeAll() {
    document.querySelectorAll(".nav-item").forEach(function (i) {
      i.classList.remove("open");
      var b = i.querySelector(".nav-item-btn");
      if (b) b.setAttribute("aria-expanded", "false");
    });
  }
  document.querySelectorAll(".nav-item").forEach(function (item) {
    var btn = item.querySelector(".nav-item-btn");
    if (!btn) return;
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var isOpen = item.classList.contains("open");
      closeAll();
      if (!isOpen) {
        item.classList.add("open");
        btn.setAttribute("aria-expanded", "true");
      }
    });
  });
  document.addEventListener("click", closeAll);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeAll();
  });

  // ── סמן pill נע (hover) ──
  (function () {
    var pill = document.getElementById("nav-pill");
    var cursor = document.getElementById("nav-pill-cursor");
    if (!pill || !cursor) return;
    var items = pill.querySelectorAll(":scope > .nav-item, :scope > .nav-item-btn");
    function btnOf(el) {
      return el.classList.contains("nav-item-btn") ? el : el.querySelector(".nav-item-btn");
    }
    function moveCursor(el) {
      var pillRect = pill.getBoundingClientRect();
      var elRect = el.getBoundingClientRect();
      cursor.style.left = elRect.left - pillRect.left - 4 + "px";
      cursor.style.width = elRect.width + "px";
      cursor.style.height = elRect.height + "px";
      cursor.style.opacity = "1";
    }
    function clearActive() {
      items.forEach(function (item) {
        var b = btnOf(item);
        if (b) b.classList.remove("pill-active");
      });
    }
    items.forEach(function (el) {
      el.addEventListener("mouseenter", function () {
        moveCursor(el);
        clearActive();
        var b = btnOf(el);
        if (b) b.classList.add("pill-active");
      });
    });
    pill.addEventListener("mouseleave", function () {
      cursor.style.opacity = "0";
      clearActive();
    });
  })();

  // ── המבורגר + מגירת מובייל ──
  var hamburger = document.getElementById("nav-hamburger");
  var mobileDrawer = document.getElementById("nav-mobile");
  if (hamburger && mobileDrawer) {
    hamburger.addEventListener("click", function () {
      var isOpen = hamburger.classList.contains("open");
      hamburger.classList.toggle("open");
      mobileDrawer.classList.toggle("open");
      mobileDrawer.setAttribute("aria-hidden", isOpen ? "true" : "false");
      document.body.style.overflow = isOpen ? "" : "hidden";
    });
    mobileDrawer.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        hamburger.classList.remove("open");
        mobileDrawer.classList.remove("open");
        mobileDrawer.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";
      });
    });
  }

  // ── אקורדיון מובייל ──
  document.querySelectorAll(".nav-mobile-cat").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var section = btn.closest(".nav-mobile-section");
      if (section) section.classList.toggle("open");
    });
  });
})();
