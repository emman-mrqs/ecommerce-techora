// /public/js/adminDashboard.js
(function () {
  // ---- helpers ----
  const $ = (s, x = document) => x.querySelector(s);
  const $$ = (s, x = document) => Array.from(x.querySelectorAll(s));

  // ---- data payloads from EJS ----
  const salesRows = $('#sales-data') ? JSON.parse($('#sales-data').textContent || '[]') : [];
  const visitorRows = $('#visitors-data') ? JSON.parse($('#visitors-data').textContent || '[]') : [];

  // ---- containers ----
  const salesCard = $$('.sales-overview')[0];
  const visitorsCard = $$('.sales-overview')[1];
  const rangeGroup = $('.sales-range-group');

  if (!salesCard) return;

  // ---- draw initial Sales chart ----
  const salesCanvas = document.createElement('canvas');
  salesCard.innerHTML = '';
  salesCard.appendChild(salesCanvas);

  let salesChart = new Chart(salesCanvas, {
    type: 'line',
    data: {
      labels: salesRows.map(r => r.date),
      datasets: [{
        label: 'Sales (₱)',
        data: salesRows.map(r => Number(r.total_sales)),
        borderColor: '#000',
        backgroundColor: 'rgba(0,0,0,0.08)',
        fill: true,
        tension: 0.3
      }]
    },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });

  // ---- visitors chart (if card exists) ----
  if (visitorsCard) {
    const vCanvas = document.createElement('canvas');
    visitorsCard.innerHTML = '';
    visitorsCard.appendChild(vCanvas);

    new Chart(vCanvas, {
      type: 'line',
      data: {
        labels: visitorRows.map(r => r.date),
        datasets: [
          { label: 'Views',   data: visitorRows.map(r => Number(r.views)),   borderColor: '#000', fill: false, tension: .25 },
          { label: 'Uniques', data: visitorRows.map(r => Number(r.uniques)), borderColor: '#555', borderDash: [4,3], fill: false, tension: .25 }
        ]
      },
      options: { responsive: true, plugins: { legend: { position: 'top' } }, scales: { y: { beginAtZero: true } } }
    });
  }

  // ---- range switching ----
  function setActiveRange(n) {
    $$('.sales-range-btn', rangeGroup).forEach(btn => {
      const isActive = Number(btn.dataset.range) === n;
      btn.classList.toggle('btn-dark', isActive);
      btn.classList.toggle('btn-outline-secondary', !isActive);
    });
  }

  if (rangeGroup) {
    setActiveRange(Number(rangeGroup.dataset.currentRange || 30));

    $$('.sales-range-btn', rangeGroup).forEach(btn => {
      btn.addEventListener('click', async () => {
        const r = Number(btn.dataset.range || 30);
        try {
          const res = await fetch(`/admin/dashboard/sales?range=${r}`, { headers: { 'Accept': 'application/json' } });
          const json = await res.json();
          const rows = json.rows || [];

          salesChart.data.labels = rows.map(x => x.date);
          salesChart.data.datasets[0].data = rows.map(x => Number(x.total_sales));
          salesChart.update();

          setActiveRange(r);
        } catch (e) {
          console.error('Failed to load sales range', e);
        }
      });
    });
  }
})();
