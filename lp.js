/* lp.js — חשיפה בגלילה (IntersectionObserver) לעמודי הנחיתה. חולץ מ-6 עמודים זהים. */
(function () {
  // Skip if user prefers reduced motion
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // דפדפן בלי IntersectionObserver: בלי הבדיקה הזו השורה הבאה זורקת,
  // ה-IIFE מת, ואיש לא מוסיף .visible — כלומר כל תוכן העמוד נשאר
  // בלתי נראה. עדיף לוותר על אנימציית החשיפה מאשר על העמוד.
  if (!("IntersectionObserver" in window)) {
    document
      .querySelectorAll(".reveal, .reveal-stagger, .lp-grid-item")
      .forEach((el) => el.classList.add("visible"));
    return;
  }

  /* observer אחד לכל סף — עד כאן נוצר observer נפרד לכל קבוצת stagger
     ולכל תמונה בגלריה, כלומר עשרות מופעים שכולם עושים אותו דבר. */
  function revealOn(elements, options) {
    if (!elements.length) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target); // fire once
        }
      });
    }, options);
    elements.forEach((el) => observer.observe(el));
  }

  revealOn(document.querySelectorAll(".reveal"), {
    threshold: 0.12,
    rootMargin: "0px 0px -40px 0px",
  });

  revealOn(document.querySelectorAll(".reveal-stagger"), {
    threshold: 0.08,
    rootMargin: "0px 0px -30px 0px",
  });

  // Gallery items — stagger each photo by its column position
  const gallery = document.querySelectorAll(".lp-grid-item");
  gallery.forEach((item, i) => {
    item.style.transitionDelay = (i % 3) * 90 + "ms";
  });
  revealOn(gallery, { threshold: 0.1 });
})();
