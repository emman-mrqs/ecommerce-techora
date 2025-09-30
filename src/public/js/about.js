// Reveal on scroll
(() => {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    });
  }, { threshold: .12 });

  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
})();

// Floaty shapes (subtle parallax)
(() => {
  const shapes = document.querySelectorAll('.shape');
  if (!shapes.length) return;
  window.addEventListener('scroll', () => {
    const y = window.scrollY * 0.04;
    shapes.forEach((s, i) => s.style.transform = `translateY(${y * (i+1)}px)`);
  }, { passive:true });
})();

// Count-up stats
(() => {
  const els = document.querySelectorAll('.stat-num');
  if (!els.length) return;

  const animate = (el) => {
    const end = parseFloat(el.dataset.count || "0");
    const isFloat = !Number.isInteger(end);
    const dur = 1200; // ms
    let start = null;

    function step(ts){
      if(!start) start = ts;
      const p = Math.min(1, (ts - start) / dur);
      const val = end * (0.2 + 0.8 * p); // ease-in feeling
      el.textContent = isFloat ? val.toFixed(1) : Math.round(val).toLocaleString();
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  };

  const io = new IntersectionObserver((entries)=>{
    entries.forEach(e=>{
      if(e.isIntersecting){
        animate(e.target);
        io.unobserve(e.target);
      }
    });
  }, { threshold:.4 });

  els.forEach(el => io.observe(el));
})();
