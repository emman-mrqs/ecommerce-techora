/* Bootstrap ensure */
(function ensureBootstrap(){
  if(window.bootstrap) return;
  const s=document.createElement('script');
  s.src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js";
  s.defer=true; document.body.appendChild(s);
})();

/* Reveal + micro-interaction */
const io = new IntersectionObserver(
  entries => entries.forEach(e=>{
    if(e.isIntersecting){
      e.target.classList.add('in');
      const h = e.target.querySelector?.('.wish');
      if(h && e.target.dataset.animateHeartDone!=='1'){
        h.animate([{transform:'scale(1)'},{transform:'scale(1.12)'},{transform:'scale(1)'}],
                  {duration:600, easing:'cubic-bezier(.2,.8,.2,1)'});
        e.target.dataset.animateHeartDone='1';
      }
      io.unobserve(e.target);
    }
  }),
  {threshold:.12}
);
document.querySelectorAll('[data-animate]').forEach(el=>io.observe(el));
document.querySelectorAll('.p-card').forEach(el=>io.observe(el));

/* Avatar fallback */
(function(){
  const a=document.getElementById('storeAvatar');
  if(!a) return;
  if(!a.querySelector('img')){ a.textContent = a.dataset.initials || 'ST'; }
})();

/* Sticky filters subtle shadow on scroll */
(function(){
  const stick = document.getElementById('stickyFilters');
  if(!stick) return;
  const onScroll = () => {
    const y = window.scrollY || document.documentElement.scrollTop;
    stick.style.boxShadow = y > 80 ? '0 10px 24px rgba(0,0,0,.06)' : 'var(--shadow)';
  };
  window.addEventListener('scroll', onScroll, {passive:true});
  onScroll();
})();

/* Live SEARCH (AJAX) with skeletons; other filters use Apply */
(function(){
  const form = document.getElementById('storeFilterForm');
  if(!form) return;

  const qInput      = form.querySelector('input[name="q"]');
  const productsWrap= document.getElementById('productsWrap');
  const itemsCount  = document.getElementById('itemsCount');
  const requestPath = form.getAttribute('action');

  const buildURL = () => {
    const sp = new URLSearchParams(new FormData(form));
    for (const [k,v] of [...sp.entries()]) { if (v==='' || v==null) sp.delete(k); }
    sp.set('page','1');
    return `${requestPath}?${sp.toString()}`;
  };

  const showSkeletons = ()=>{
    if(!productsWrap) return;
    const cols = Array.from({length:6}).map(()=>(
      `<div class="col-12 col-sm-6 col-lg-4">
        <div class="skeleton-card">
          <div class="skel-img"></div>
          <div class="skel-text">
            <div class="skel-line"></div>
            <div class="skel-line short"></div>
          </div>
        </div>
      </div>`
    )).join('');
    const grid = `<div class="row g-3 g-md-4">${cols}</div>`;
    productsWrap.setHTMLSafe ? productsWrap.setHTMLSafe(grid) : (productsWrap.innerHTML = grid);
  };

  let t; const debounce=(fn,ms=320)=>{ clearTimeout(t); t=setTimeout(fn,ms); };

  async function liveSearch(){
    const url = buildURL();
    try{
      showSkeletons();
      const res = await fetch(url, { credentials: 'same-origin' });
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const newWrap = doc.querySelector('#productsWrap');
      const newCount = doc.querySelector('#itemsCount');
      if(newWrap){ productsWrap.innerHTML = newWrap.innerHTML; }
      if(newCount && itemsCount){ itemsCount.textContent = newCount.textContent; }
      const clean = new URL(url, location.origin);
      history.replaceState(null, '', clean.pathname + clean.search);
      productsWrap.querySelectorAll('.p-card').forEach(el=>io.observe(el));
    }catch(err){
      console.error('Live search failed:', err);
    }
  }

  if(qInput){
    qInput.addEventListener('keyup', (e)=>{
      if(e.key==='Enter'){ e.preventDefault(); liveSearch(); return; }
      debounce(liveSearch, 380);
    });
    qInput.addEventListener('keydown', (e)=>{
      if(e.key==='Escape'){ qInput.value=''; liveSearch(); }
    });
  }

  // Keep Apply/Clear behavior for other filters
  form.addEventListener('submit', ()=>{
    let hidden = form.querySelector('input[name="page"]');
    if(!hidden){ hidden=document.createElement('input'); hidden.type='hidden'; hidden.name='page'; form.appendChild(hidden); }
    hidden.value='1';
  });
})();
