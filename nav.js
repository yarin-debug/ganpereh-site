/* התנהגות משותפת לעמודי המשנה — תפריט "שירותים", סמן pill נע, המבורגר ומגירת מובייל, ואקורדיון FAQ.
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
    // הסמן מונפש ב-transform ולא ב-left/width/height. שלושת האחרונים
    // מכריחים את הדפדפן לחשב פריסה מחדש בכל פריים; transform רץ על
    // כרטיס המסך ולא נוגע בפריסה בכלל. הרוחב והגובה נקבעים פעם אחת
    // כבסיס, והתנועה היא הזזה ומתיחה יחסית אליו.
    var BASE_W = 100;
    var BASE_H = 34;
    cursor.style.width = BASE_W + "px";
    cursor.style.height = BASE_H + "px";

    function moveCursor(el) {
      var pillRect = pill.getBoundingClientRect();
      var elRect = el.getBoundingClientRect();
      var x = elRect.left - pillRect.left - 4;
      var sx = elRect.width / BASE_W;
      var sy = elRect.height / BASE_H;
      cursor.style.transform =
        "translate3d(" + x + "px,0,0) scale(" + sx + "," + sy + ")";
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

  // ── אקורדיון FAQ (עמודי שירות + עמודי אזור) — פותח פריט אחד, סוגר את השאר ──
  document.querySelectorAll(".faq-q").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var item = btn.parentElement;
      var isOpen = item.classList.contains("open");
      document.querySelectorAll(".faq-item").forEach(function (i) {
        i.classList.remove("open");
      });
      if (!isOpen) item.classList.add("open");
    });
  });
})();
