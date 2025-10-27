// /js/adminCms.js

// Safe collapse init (works with or without Bootstrap bundle)
(function () {
  const toggle = document.getElementById('about-edit-toggle');
  const collapseEl = document.getElementById('aboutEditor');

  async function loadAboutIntoForm() {
  try {
    const res = await fetch('/admin/cms/about/data', { cache: 'no-store' });
    const json = await res.json();
    if (!json.success) return;

    // DEBUG: show raw payload so you can inspect in browser console
    console.log('[DEBUG] /admin/cms/about/data', json);

    // Normalizer: accept either flattened A.* keys or nested arrays (values_points, why_points, faq)
    const raw = json.about || {};
    const A = Object.assign({}, raw); // shallow copy we'll mutate

    // If server sent nested arrays, map them to the flat keys used by the form
    try {
      // values_points -> values_1_title, values_1_text, ...
      const vals = Array.isArray(raw.values_points) ? raw.values_points : (raw.values_points ? JSON.parse(raw.values_points) : []);
      if (Array.isArray(vals) && vals.length) {
        for (let i = 0; i < 4; i++) {
          const v = vals[i] || {};
          A[`values_${i+1}_title`] = A[`values_${i+1}_title`] ?? v.title ?? "";
          A[`values_${i+1}_text`]  = A[`values_${i+1}_text`]  ?? v.text  ?? "";
        }
      }

      // why_points -> why_1_title, why_1_text, ...
      const why = Array.isArray(raw.why_points) ? raw.why_points : (raw.why_points ? JSON.parse(raw.why_points) : []);
      if (Array.isArray(why) && why.length) {
        for (let i = 0; i < 3; i++) {
          const w = why[i] || {};
          A[`why_${i+1}_title`] = A[`why_${i+1}_title`] ?? w.title ?? "";
          A[`why_${i+1}_text`]  = A[`why_${i+1}_text`]  ?? w.text  ?? "";
        }
      }

      // faq -> faq_1_q, faq_1_a, ...
      const faq = Array.isArray(raw.faq) ? raw.faq : (raw.faq ? JSON.parse(raw.faq) : []);
      if (Array.isArray(faq) && faq.length) {
        for (let i = 0; i < 3; i++) {
          const f = faq[i] || {};
          A[`faq_${i+1}_q`] = A[`faq_${i+1}_q`] ?? f.q ?? "";
          A[`faq_${i+1}_a`] = A[`faq_${i+1}_a`] ?? f.a ?? "";
        }
      }
    } catch (err) {
      console.warn('[DEBUG] normalizer parse error', err);
    }

    // keep a snapshot of what came from DB so Reset can restore it
    window.__aboutSnapshot = A;

    // update the Last Updated cell in the table (if the span exists)
    const tsEl = document.getElementById('about-last-updated');
    if (tsEl) tsEl.textContent = A.updated_at ? new Date(A.updated_at).toLocaleString() : '—';

    const form = document.getElementById('aboutEditForm');
    if (!form) return;

    const setVal = (name, val) => {
      const el = form.querySelector(`[name="${name}"]`);
      if (!el) return;
      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') el.value = val ?? '';
    };

    // Keep this list in sync with your form fields
    setVal('hero_title', A.hero_title);
    setVal('hero_description', A.hero_description);
    setVal('cta_primary_text', A.cta_primary_text);
    setVal('cta_primary_href', A.cta_primary_href);

    setVal('story_title', A.story_title);
    setVal('story_p1', A.story_p1);
    setVal('story_p2', A.story_p2);

    setVal('values_1_title', A.values_1_title);
    setVal('values_1_text', A.values_1_text);
    setVal('values_2_title', A.values_2_title);
    setVal('values_2_text', A.values_2_text);
    setVal('values_3_title', A.values_3_title);
    setVal('values_3_text', A.values_3_text);
    setVal('values_4_title', A.values_4_title);
    setVal('values_4_text', A.values_4_text);

    setVal('why_title', A.why_title);
    setVal('why_1_title', A.why_1_title);
    setVal('why_1_text', A.why_1_text);
    setVal('why_2_title', A.why_2_title);
    setVal('why_2_text', A.why_2_text);
    setVal('why_3_title', A.why_3_title);
    setVal('why_3_text', A.why_3_text);

    setVal('seller_title', A.seller_title);
    setVal('seller_p', A.seller_p);
    setVal('step1', A.step1);
    setVal('step2', A.step2);
    setVal('step3', A.step3);
    setVal('cta_secondary_text', A.cta_secondary_text);
    setVal('cta_secondary_href', A.cta_secondary_href);

    setVal('faq_title', A.faq_title);
    setVal('faq_1_q', A.faq_1_q);
    setVal('faq_1_a', A.faq_1_a);
    setVal('faq_2_q', A.faq_2_q);
    setVal('faq_2_a', A.faq_2_a);
    setVal('faq_3_q', A.faq_3_q);
    setVal('faq_3_a', A.faq_3_a);
  } catch (e) {
    console.error('Failed to load about content', e);
  }
}


  if (toggle && collapseEl) {
    toggle.addEventListener('click', async () => {
      // Always fetch fresh from DB before showing
      await loadAboutIntoForm();

      // Toggle collapse (works with or without Bootstrap)
      const isShown = collapseEl.classList.contains('show');
      if (window.bootstrap?.Collapse) {
        const c = bootstrap.Collapse.getOrCreateInstance(collapseEl, { toggle: false });
        isShown ? c.hide() : c.show();
      } else {
        collapseEl.classList.toggle('show');
      }
    });
  }
})();

// Submit handler (reload page after save so the table “Last Updated” is fresh)
(function () {
  const form = document.getElementById('aboutEditForm');
  if (!form) return;

  // Reset -> restore from the last DB snapshot (not just clear)
  document.getElementById('resetAboutForm')?.addEventListener('click', () => {
    const snap = window.__aboutSnapshot;
    if (!snap) {
      form.reset();
      return;
    }

    const setVal = (name, val) => {
      const el = form.querySelector(`[name="${name}"]`);
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) el.value = val ?? '';
    };

    setVal('hero_title', snap.hero_title);
    setVal('hero_description', snap.hero_description);
    setVal('cta_primary_text', snap.cta_primary_text);
    setVal('cta_primary_href', snap.cta_primary_href);

    setVal('story_title', snap.story_title);
    setVal('story_p1', snap.story_p1);
    setVal('story_p2', snap.story_p2);

    setVal('values_1_title', snap.values_1_title);
    setVal('values_1_text', snap.values_1_text);
    setVal('values_2_title', snap.values_2_title);
    setVal('values_2_text', snap.values_2_text);
    setVal('values_3_title', snap.values_3_title);
    setVal('values_3_text', snap.values_3_text);
    setVal('values_4_title', snap.values_4_title);
    setVal('values_4_text', snap.values_4_text);

    setVal('why_title', snap.why_title);
    setVal('why_1_title', snap.why_1_title);
    setVal('why_1_text', snap.why_1_text);
    setVal('why_2_title', snap.why_2_title);
    setVal('why_2_text', snap.why_2_text);
    setVal('why_3_title', snap.why_3_title);
    setVal('why_3_text', snap.why_3_text);

    setVal('seller_title', snap.seller_title);
    setVal('seller_p', snap.seller_p);
    setVal('step1', snap.step1);
    setVal('step2', snap.step2);
    setVal('step3', snap.step3);
    setVal('cta_secondary_text', snap.cta_secondary_text);
    setVal('cta_secondary_href', snap.cta_secondary_href);

    setVal('faq_title', snap.faq_title);
    setVal('faq_1_q', snap.faq_1_q);
    setVal('faq_1_a', snap.faq_1_a);
    setVal('faq_2_q', snap.faq_2_q);
    setVal('faq_2_a', snap.faq_2_a);
    setVal('faq_3_q', snap.faq_3_q);
    setVal('faq_3_a', snap.faq_3_a);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    try {
      const res = await fetch('/admin/cms/about/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));

      // if API returns updated row, reflect it immediately
      if (data?.about) {
        window.__aboutSnapshot = data.about;
        const tsEl = document.getElementById('about-last-updated');
        if (tsEl && data.about.updated_at) {
          tsEl.textContent = new Date(data.about.updated_at).toLocaleString();
        }
      }

      alert(data.message || 'Saved.');
      // keep your existing behavior:
      location.reload(); // optional but convenient
    } catch (err) {
      console.error(err);
      alert('Failed to save changes.');
    }
  });
})();


(function () {
  const tsEl = document.getElementById('about-last-updated');
  if (!tsEl) return;

  fetch('/admin/cms/about/data', { cache: 'no-store' })
    .then(r => r.json())
    .then(json => {
      if (!json?.success) return;
      const A = json.about || {};
      // update the table cell
      tsEl.textContent = A.updated_at ? new Date(A.updated_at).toLocaleString() : '—';
      // seed the reset snapshot so "Reset" works before opening the editor
      if (!window.__aboutSnapshot) window.__aboutSnapshot = A;
    })
    .catch(() => {});
})();


/*==============================
Contact page
================================*/

// ===== CONTACT: table "Last Updated" on page load =====
(function () {
  const tsEl = document.getElementById('contact-last-updated');
  if (!tsEl) return;
  fetch('/admin/cms/contact/data', { cache: 'no-store' })
    .then(r => r.json())
    .then(j => {
      if (!j?.success) return;
      const C = j.contact || {};
      tsEl.textContent = C.updated_at ? new Date(C.updated_at).toLocaleString() : '—';
      if (!window.__contactSnapshot) window.__contactSnapshot = C; // seed reset
    })
    .catch(() => {});
})();

// ===== CONTACT: open/close + load form =====
(function () {
  const toggle = document.getElementById('contact-edit-toggle');
  const collapseEl = document.getElementById('contactEditor');

  async function loadContactIntoForm() {
    try {
      const res = await fetch('/admin/cms/contact/data', { cache: 'no-store' });
      const json = await res.json();
      if (!json.success) return;
      const C = json.contact || {};
      window.__contactSnapshot = C;

      const tsEl = document.getElementById('contact-last-updated');
      if (tsEl) tsEl.textContent = C.updated_at ? new Date(C.updated_at).toLocaleString() : '—';

      const form = document.getElementById('contactEditForm');
      if (!form) return;
      const setVal = (n, v) => {
        const el = form.querySelector(`[name="${n}"]`);
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) el.value = v ?? '';
      };

      setVal('hero_title', C.hero_title);
      setVal('hero_subtitle', C.hero_subtitle);
      setVal('email', C.email);
      setVal('website_label', C.website_label);
      setVal('website_url', C.website_url);
      setVal('support_hours', C.support_hours);
      setVal('seller_cta_title', C.seller_cta_title);
      setVal('seller_cta_text', C.seller_cta_text);
      setVal('map_iframe_src', C.map_iframe_src);
      setVal('checklist', (C.checklist || []).join(', '));
    } catch (e) {
      console.error('Failed to load contact content', e);
    }
  }

  if (toggle && collapseEl) {
    toggle.addEventListener('click', async () => {
      await loadContactIntoForm();
      const isShown = collapseEl.classList.contains('show');
      if (window.bootstrap?.Collapse) {
        const c = bootstrap.Collapse.getOrCreateInstance(collapseEl, { toggle: false });
        isShown ? c.hide() : c.show();
      } else {
        collapseEl.classList.toggle('show');
      }
    });
  }
})();

// ===== CONTACT: reset + submit =====
(function () {
  const form = document.getElementById('contactEditForm');
  if (!form) return;

  document.getElementById('resetContactForm')?.addEventListener('click', () => {
    const s = window.__contactSnapshot;
    if (!s) return form.reset();
    const setVal = (n, v) => {
      const el = form.querySelector(`[name="${n}"]`);
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) el.value = v ?? '';
    };
    setVal('hero_title', s.hero_title);
    setVal('hero_subtitle', s.hero_subtitle);
    setVal('email', s.email);
    setVal('website_label', s.website_label);
    setVal('website_url', s.website_url);
    setVal('support_hours', s.support_hours);
    setVal('seller_cta_title', s.seller_cta_title);
    setVal('seller_cta_text', s.seller_cta_text);
    setVal('map_iframe_src', s.map_iframe_src);
    setVal('checklist', (s.checklist || []).join(', '));
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    // normalize checklist (send as string; server converts to array)
    try {
      const res = await fetch('/admin/cms/contact/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (data?.contact) {
        window.__contactSnapshot = data.contact;
        const tsEl = document.getElementById('contact-last-updated');
        if (tsEl && data.contact.updated_at) {
          tsEl.textContent = new Date(data.contact.updated_at).toLocaleString();
        }
      }
      alert(data.message || 'Saved.');
      location.reload();
    } catch (err) {
      console.error(err);
      alert('Failed to save changes.');
    }
  });
})();


/*=============
Homepage banner
=============== */

// ---- BANNERS (upload/list/activate) ----
(function () {
  const listEl = document.getElementById("bannerList");
  const form = document.getElementById("bannerUploadForm");

  async function fetchBanners() {
    try {
      const r = await fetch("/admin/cms/banners", { cache: "no-store" });
      const j = await r.json();
      if (!j?.success) return;
      renderBanners(j.banners || []);
    } catch {}
  }

  function renderBanners(banners) {
    if (!listEl) return;
    if (!banners.length) {
      listEl.innerHTML = `<div class="col-12 text-muted">No banners yet.</div>`;
      return;
    }
    listEl.innerHTML = banners.map(b => `
      <div class="col-md-6">
        <div class="banner-card h-100">
          <div class="banner-img" style="background:#f5f5f5">
            <img src="${b.image_url}" alt="${b.label || 'Banner'}" class="w-100 d-block" style="max-height:220px;object-fit:cover">
          </div>
          <div class="banner-footer">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <strong>${b.label || 'Untitled banner'}</strong><br>
                <small>${b.is_active ? 'Active' : 'Inactive'}</small>
              </div>
              <span class="status-badge ${b.is_active ? 'status-published' : 'status-draft'}">
                <i class="bi ${b.is_active ? 'bi-check2-circle' : 'bi-dot'}"></i> ${b.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div class="mt-2 d-flex gap-2">
              <button class="btn btn-sm btn-outline-dark" data-act="activate" data-id="${b.id}" ${b.is_active ? 'disabled' : ''}>
                Make Active
              </button>
              <button class="btn btn-sm btn-outline-secondary" data-act="delete" data-id="${b.id}">
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    `).join("");
  }

  listEl?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const id = btn.getAttribute("data-id");
    const act = btn.getAttribute("data-act");
    try {
      if (act === "activate") {
        await fetch(`/admin/cms/banners/${id}/activate`, { method: "POST" });
      } else if (act === "delete") {
        if (!confirm("Delete this banner?")) return;
        await fetch(`/admin/cms/banners/${id}`, { method: "DELETE" });
      }
      await fetchBanners();
    } catch {}
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    try {
      const r = await fetch("/admin/cms/banners/upload", { method: "POST", body: fd });
      const j = await r.json();
      if (!j?.success) return alert("Upload failed");
      form.reset();
      fetchBanners();
    } catch (err) {
      alert("Upload failed");
    }
  });

  // initial
  fetchBanners();
})();
