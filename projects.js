/* projects.js — גריד ה-morph של ארכיון הפרויקטים: פילטר, פתיחה/סגירה, מקלדת. */
(function () {
  var morph = document.getElementById("pjMorph");
  var morphImg = document.getElementById("pjMorphImg");
  var backdrop = document.getElementById("pjBackdrop");
  var closeBtn = document.getElementById("pjClose");
  var titleEl = document.getElementById("pjTitle");
  var metaEl = document.getElementById("pjMeta");
  var descEl = document.getElementById("pjDesc");
  var ctaEl = document.getElementById("pjCta");
  var activeCard = null;
  var animating = false;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
  var DUR = reduced ? 0 : 520;

  function targetRect() {
    var vw = window.innerWidth,
      vh = window.innerHeight;
    var w = Math.min(vw * 0.62, 880);
    if (vw < 860) w = vw * 0.92;
    var h = Math.min(vh * 0.74, 640);
    return { left: (vw - w) / 2, top: (vh - h) / 2, width: w, height: h };
  }

  function setRect(r) {
    morph.style.left = r.left + "px";
    morph.style.top = r.top + "px";
    morph.style.width = r.width + "px";
    morph.style.height = r.height + "px";
  }

  function openCard(card) {
    if (animating || activeCard) return;
    animating = true;
    activeCard = card;

    var img = card.querySelector("img");
    morphImg.src = img.currentSrc || img.src;
    morphImg.alt = img.alt;
    titleEl.textContent = card.dataset.title;
    metaEl.textContent = card.dataset.meta;
    descEl.textContent = card.dataset.desc;
    ctaEl.href = card.dataset.href;

    morph.style.display = "block";
    morph.style.transition = "none";
    setRect(card.getBoundingClientRect());
    card.style.visibility = "hidden";
    backdrop.classList.add("on");
    document.body.style.overflow = "hidden";

    void morph.offsetWidth; /* forced reflow — מקבע את נקודת הפתיחה גם כשהטאב ברקע */
    morph.style.transition =
      "left " +
      DUR +
      "ms " +
      EASE +
      ", top " +
      DUR +
      "ms " +
      EASE +
      ", width " +
      DUR +
      "ms " +
      EASE +
      ", height " +
      DUR +
      "ms " +
      EASE;
    setRect(targetRect());
    morph.classList.add("open");
    setTimeout(function () {
      animating = false;
      closeBtn.focus({ preventScroll: true });
    }, DUR);
  }

  function closeCard() {
    if (animating || !activeCard) return;
    animating = true;
    morph.classList.remove("open");
    backdrop.classList.remove("on");
    setRect(activeCard.getBoundingClientRect());
    setTimeout(function () {
      morph.style.display = "none";
      activeCard.style.visibility = "";
      activeCard.focus({ preventScroll: true });
      activeCard = null;
      animating = false;
      document.body.style.overflow = "";
    }, DUR);
  }

  document.querySelectorAll(".pj-card").forEach(function (card) {
    card.addEventListener("click", function () {
      openCard(card);
    });
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openCard(card);
      }
    });
  });
  if (backdrop) backdrop.addEventListener("click", closeCard);
  if (closeBtn)
    closeBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      closeCard();
    });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeCard();
  });

  /* פילטר קטגוריות.
     הסינון עצמו הוא display: none, שאי אפשר להנפיש. במקום לנסות
     להנפיש כרטיס-כרטיס דרך reflow של גריד dense, הגריד כולו נמוג
     לרגע, מחליף מצב מאחורי המסך, וחוזר. זה מסתיר את הקפיצה לגמרי
     ונקרא כמעבר מכוון — בלי זה הרשת מתחלפת בפריים אחד וזה נראה
     כתקלה. היציאה מהירה מהכניסה: המערכת מגיבה מיד, ואז מציגה. */
  var grid = document.querySelector(".pj-grid");
  var swapReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function applyFilter(cat) {
    document.querySelectorAll(".pj-card").forEach(function (card) {
      var show = cat === "all" || card.dataset.cat === cat;
      card.classList.toggle("hidden-cat", !show);
      if (show) card.classList.add("visible");
    });
  }

  document.querySelectorAll(".pj-filter-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".pj-filter-btn").forEach(function (b) {
        b.classList.remove("active");
      });
      btn.classList.add("active");
      var cat = btn.dataset.cat;

      if (!grid || swapReduced) {
        applyFilter(cat);
        return;
      }
      grid.classList.add("swapping");
      setTimeout(function () {
        applyFilter(cat);
        // פריים אחד לפני ההסרה, כדי שהדפדפן יספיק לצייר את המצב החדש
        // בעודו שקוף. בלי זה החזרה מתחילה על התוכן הישן.
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            grid.classList.remove("swapping");
          });
        });
      }, 130);
    });
  });

  /* חשיפה בגלילה.
     גם דפדפן בלי IntersectionObserver נופל לענף הראשון: בלי זה
     הבנייה של ה-observer זורקת ואף כרטיס לא מקבל .visible — כלומר
     הארכיון נראה ריק לגמרי. */
  if (reduced || !("IntersectionObserver" in window)) {
    document.querySelectorAll(".pj-card").forEach(function (c) {
      c.classList.add("visible");
    });
  } else {
    var obs = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -30px 0px" },
    );
    document.querySelectorAll(".pj-card").forEach(function (c, i) {
      c.style.transitionDelay = (i % 3) * 90 + "ms";
      obs.observe(c);
    });
  }
})();
