(() => {
  // Individual toggle per button (chevron rotates + open/close that one collapse)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.js-tog');
    if (!btn) return;

    const sel = btn.getAttribute('data-target');
    const panel = sel ? document.querySelector(sel) : null;
    if (!panel) return;

    const inst = bootstrap.Collapse.getOrCreateInstance(panel, { toggle: false });

    const icon = btn.querySelector('i');
    const isOpen = panel.classList.contains('show');

    if (isOpen) {
      inst.hide();
      btn.setAttribute('aria-expanded', 'false');
      if (icon) icon.classList.replace('fa-chevron-down', 'fa-chevron-right');
    } else {
      inst.show();
      btn.setAttribute('aria-expanded', 'true');
      if (icon) icon.classList.replace('fa-chevron-right', 'fa-chevron-down');
    }
  });

  // Keep chevrons in sync when panels are opened/closed by other controls (e.g., Expand all)
  document.addEventListener('shown.bs.collapse', (e) => {
    const btn = document.querySelector(`.js-tog[data-target="#${e.target.id}"]`);
    if (!btn) return;
    const icon = btn.querySelector('i');
    btn.setAttribute('aria-expanded', 'true');
    if (icon) icon.classList.replace('fa-chevron-right', 'fa-chevron-down');
  });

  document.addEventListener('hidden.bs.collapse', (e) => {
    const btn = document.querySelector(`.js-tog[data-target="#${e.target.id}"]`);
    if (!btn) return;
    const icon = btn.querySelector('i');
    btn.setAttribute('aria-expanded', 'false');
    if (icon) icon.classList.replace('fa-chevron-down', 'fa-chevron-right');
  });

  // If you kept your global Expand/Collapse all, make them update icons too:
  document.addEventListener('click', (e) => {
    if (e.target.closest('.js-expand-all')) {
      document.querySelectorAll('[id^="items_"],[id^="months_"]').forEach(el => {
        const inst = bootstrap.Collapse.getOrCreateInstance(el, { toggle: false });
        inst.show();
      });
    }
    if (e.target.closest('.js-collapse-all')) {
      document.querySelectorAll('[id^="items_"],[id^="months_"]').forEach(el => {
        const inst = bootstrap.Collapse.getOrCreateInstance(el, { toggle: false });
        inst.hide();
      });
    }
  });
})();
