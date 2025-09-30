    // simple reveal-on-scroll
    const io = new IntersectionObserver(entries=>{
      entries.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); }});
    }, {threshold:.12});
    document.querySelectorAll('[data-animate]').forEach(el=>io.observe(el));

    function makeInitials(name){
    const el = document.createElement('div');
    el.className = 'avatar-initials';
    el.textContent = (name||'S').slice(0,2).toUpperCase();
    return el;
  }