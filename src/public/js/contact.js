// Reveal on scroll
(() => {
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(e=>{
      if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, {threshold:.12});
  document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
})();

// Toast helper
function showToast(msg, ok=true){
  const t = document.getElementById('toast');
  if(!t) return alert(msg);
  const box = t.querySelector('.toast-msg');
  box.textContent = msg;
  box.style.background = ok ? '#0A0A0A' : '#CC0000';
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2500);
}

// Simple client-side validation + POST
(() => {
  const form = document.getElementById('contactForm');
  if(!form) return;

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();

    // Bootstrap-like validation
    let valid = true;
    form.querySelectorAll('[required]').forEach(el=>{
      if(el.type === 'checkbox' && !el.checked) valid = false;
      else if(!el.value.trim()) valid = false;
      el.classList.toggle('is-invalid', !el.validity.valid || (el.type==='checkbox' && !el.checked));
    });
    if(!valid){ showToast('Please complete the form fields.', false); return; }

    const payload = {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      subject: form.subject.value.trim(),
      message: form.message.value.trim()
    };

    try {
      // Hit your backend; adjust route if needed
      const res = await fetch('/contact', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });

      if(res.ok){
        showToast('Thanks! We’ll get back to you via email soon.');
        form.reset();
      } else {
        // fallback to mailto so nothing gets lost
        window.location.href =
          `mailto:techora.team@gmail.com?subject=${encodeURIComponent(payload.subject)}&body=${encodeURIComponent(payload.name)}%0A${encodeURIComponent(payload.email)}%0A%0A${encodeURIComponent(payload.message)}`;
      }
    } catch {
      showToast('Network error — opening email client…', false);
      window.location.href =
        `mailto:techora.team@gmail.com?subject=${encodeURIComponent(payload.subject)}&body=${encodeURIComponent(payload.name)}%0A${encodeURIComponent(payload.email)}%0A%0A${encodeURIComponent(payload.message)}`;
    }
  });
})();
