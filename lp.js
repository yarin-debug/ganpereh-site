/* lp.js — חשיפה בגלילה (IntersectionObserver) לעמודי הנחיתה. חולץ מ-6 עמודים זהים. */
(function() {
  // Skip if user prefers reduced motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target); // fire once
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  // Reveal single elements
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

  // Stagger groups — observe the container
  document.querySelectorAll('.reveal-stagger').forEach(group => {
    const staggerObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          staggerObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });
    staggerObserver.observe(group);
  });

  // Gallery items — stagger each photo individually
  document.querySelectorAll('.lp-grid-item').forEach((item, i) => {
    const delay = (i % 3) * 90; // stagger by column position
    item.style.transitionDelay = delay + 'ms';
    const imgObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          imgObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    imgObserver.observe(item);
  });
})();
