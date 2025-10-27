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

// --- Loading state helpers ---
function setFormLoading(form, isLoading){
  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn && !submitBtn.dataset.originalText) {
    submitBtn.dataset.originalText = submitBtn.innerHTML;
  }
  form.querySelectorAll('input, textarea, select, button').forEach(el=>{
    if (el.type === 'reset') el.disabled = isLoading;
    else el.disabled = isLoading;
  });
  form.setAttribute('aria-busy', isLoading ? 'true' : 'false');

  if (submitBtn) {
    if (isLoading) {
      submitBtn.classList.add('disabled');
      submitBtn.setAttribute('aria-disabled', 'true');
      submitBtn.innerHTML = `
        <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
        Sending…
      `;
    } else {
      submitBtn.classList.remove('disabled');
      submitBtn.removeAttribute('aria-disabled');
      submitBtn.innerHTML = submitBtn.dataset.originalText || 'Send Message';
    }
  }
}

// Simple client-side validation + POST
(() => {
  const form = document.getElementById('contactForm');
  if(!form) return;

  let inFlight = false;
  const hasRecaptcha = typeof grecaptcha !== 'undefined'; // NEW

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if (inFlight) return; // guard double submit

    // Bootstrap-like validation
    let valid = true;
    form.querySelectorAll('[required]').forEach(el=>{
      if(el.type === 'checkbox' && !el.checked) valid = false;
      else if(!el.value.trim()) valid = false;
      el.classList.toggle('is-invalid', !el.validity.valid || (el.type==='checkbox' && !el.checked));
    });
    if(!valid){ showToast('Please complete the form fields.', false); return; }

    // --- reCAPTCHA token ---
    let token = ""; // NEW
    if (hasRecaptcha) {
      token = grecaptcha.getResponse();
      if (!token) {
        showToast('Please verify that you are not a robot.', false);
        return;
      }
    }

    const payload = {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      subject: form.subject.value.trim(),
      message: form.message.value.trim(),
      ...(token ? { token } : {}) // NEW: include token only if present
    };

    // enter loading state
    inFlight = true;
    setFormLoading(form, true);

    try {
      const res = await fetch('/contact', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });

      if(res.ok){
        showToast('Thanks! We’ll get back to you via email soon.');
        form.reset();
        if (hasRecaptcha) grecaptcha.reset(); // NEW: reset widget after success
      } else {
        // Try to show server error first
        let msg = 'Something went wrong.';
        try {
          const j = await res.json();
          if (j && j.error) msg = j.error;
        } catch {}

        // Specific handling
        if (res.status === 403) { // captcha failed
          showToast('Captcha verification failed. Please try again.', false);
          if (hasRecaptcha) grecaptcha.reset();
        } else if (res.status === 429) { // rate limited
          showToast('Please wait a moment before sending again.', false);
        } else if (res.status >= 500) {
          // fallback to mailto so nothing gets lost
          window.location.href =
            `mailto:techora.team@gmail.com?subject=${encodeURIComponent(payload.subject)}&body=${encodeURIComponent(payload.name)}%0A${encodeURIComponent(payload.email)}%0A%0A${encodeURIComponent(payload.message)}`;
        } else {
          showToast(msg, false);
        }
      }
    } catch {
      showToast('Network error — opening email client…', false);
      window.location.href =
        `mailto:techora.team@gmail.com?subject=${encodeURIComponent(payload.subject)}&body=${encodeURIComponent(payload.name)}%0A${encodeURIComponent(payload.email)}%0A%0A${encodeURIComponent(payload.message)}`;
    } finally {
      inFlight = false;
      setFormLoading(form, false);
    }
  });
})();
