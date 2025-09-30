// /public/js/adminAnalyticsCharts.js
(function () {
  const peso   = (n) => `₱${Number(n || 0).toLocaleString()}`;
  const fmtDay = (d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  function ensure(el, html) { el.innerHTML = html; return el.querySelector('canvas'); }

  function toWeeks(values) {
    const out = [];
    for (let i = 0; i < values.length; i += 7) out.push(values.slice(i, i + 7).reduce((a, b) => a + Number(b || 0), 0));
    return { labels: out.map((_, i) => `W${i + 1}`).slice(-12), values: out.slice(-12) };
  }

  const baseOpts = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: { display: true, labels: { boxWidth: 12 } },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const v = ctx.parsed.y;
            const isMoney = ctx.dataset.yAxisID !== 'y2';
            return `${ctx.dataset.label}: ${isMoney ? peso(v) : Number(v).toLocaleString()}`;
          }
        }
      }
    },
    scales: {
      x: { grid: { display: false } },
      y: { ticks: { callback: (v) => peso(v) }, grid: { drawBorder: false } },
      y2:{ position:'right', ticks:{ callback:(v)=>Number(v).toLocaleString() }, grid:{ drawOnChartArea:false, drawBorder:false } }
    }
  };

  // ===== main init called from EJS inline =====
  window.initAdminAnalytics = function initAdminAnalytics(data) {
    const dailySales  = Array.isArray(data?.dailySales)  ? data.dailySales  : [];
    const siteViews   = Array.isArray(data?.siteViews)   ? data.siteViews   : [];
    const storeViews  = Array.isArray(data?.storeViews)  ? data.storeViews  : [];
    const productViews= Array.isArray(data?.productViews)? data.productViews: [];
    const auth        = data?.authBreakdown || { google:0, local:0, other:0 };
    const totals      = data?.engagementTotals || { site:0, store:0, product:0 };

    // 1) Replace sales SVG with canvas
    (function(){
      const wrap = document.querySelector('.analytics-card .chart-wrap');
      if (!wrap) return;
      ensure(wrap, `<div class="chart-container" id="salesContainer"><canvas id="salesChart"></canvas></div>`);
    })();

    // 2) In Engagement card: add views line (top) + auth doughnut (bottom)
    (function(){
      const engagementCard = [...document.querySelectorAll('.analytics-card')]
        .find(c => c.querySelector('h6')?.textContent?.toLowerCase().includes('engagement'));
      if (!engagementCard) return;

      const ringsRow = engagementCard.querySelector('.row');

      const viewsDiv = document.createElement('div');
      viewsDiv.className = 'chart-container';
      viewsDiv.id = 'viewsContainer';
      viewsDiv.innerHTML = `<canvas id="viewsChart"></canvas>`;
      engagementCard.insertBefore(viewsDiv, ringsRow);

      const authDiv = document.createElement('div');
      authDiv.className = 'chart-container mt-2';
      authDiv.id = 'authContainer';
      authDiv.innerHTML = `<canvas id="authChart"></canvas>`;
      engagementCard.appendChild(authDiv);
    })();

    // 3) Replace tiny weekly bars with canvas
    (function(){
      const weeklyCard = [...document.querySelectorAll('.analytics-card')]
        .find(c => c.querySelector('h6')?.textContent?.toLowerCase().includes('weekly sales'));
      const bars = weeklyCard?.querySelector('.bars');
      if (!weeklyCard || !bars) return;
      const wrap = document.createElement('div');
      wrap.className = 'chart-container';
      wrap.id = 'weeklyContainer';
      wrap.innerHTML = `<canvas id="weeklySalesChart"></canvas>`;
      bars.replaceWith(wrap);
    })();

    // ===== datasets =====
    const sLabels  = dailySales.map(r => fmtDay(r.d));
    const sRevenue = dailySales.map(r => Number(r.revenue || 0));
    const sOrders  = dailySales.map(r => Number(r.orders  || 0));
    const wk = toWeeks(sRevenue);

    // merge dates for the 3 engagement lines
    const allDates = Array.from(new Set([
      ...siteViews.map(r => String(r.d)),
      ...storeViews.map(r => String(r.d)),
      ...productViews.map(r => String(r.d)),
    ])).sort((a,b)=> new Date(a)-new Date(b));

    const labels = allDates.map(fmtDay);
    const mapVals = (arr) => {
      const m = new Map(arr.map(r => [String(r.d), Number(r.views||0)]));
      return allDates.map(d => m.get(d) || 0);
    };
    const vSite    = mapVals(siteViews);
    const vStore   = mapVals(storeViews);
    const vProduct = mapVals(productViews);

    // ===== render charts =====
    // Sales
    (function(){
      const c = document.getElementById('salesChart'); if (!c) return;
      new Chart(c.getContext('2d'), {
        type:'line',
        data:{ labels: sLabels,
          datasets:[
            { label:'Revenue', data:sRevenue, yAxisID:'y', fill:true, tension:.35, pointRadius:0 },
            { label:'Orders',  data:sOrders,  yAxisID:'y2', fill:false, tension:.35, pointRadius:3 }
          ]
        },
        options: baseOpts
      });
    })();

    // Engagement (3 lines)
    (function(){
      const c = document.getElementById('viewsChart'); if (!c) return;
      new Chart(c.getContext('2d'), {
        type:'line',
        data:{ labels,
          datasets:[
            { label:'Website Views', data:vSite,    tension:.3, pointRadius:0 },
            { label:'Store Views',   data:vStore,   tension:.3, pointRadius:0 },
            { label:'Product Views', data:vProduct, tension:.3, pointRadius:0 },
          ]
        },
        options:{
          ...baseOpts,
          plugins:{ ...baseOpts.plugins, legend:{ display:true } },
          scales:{ ...baseOpts.scales, y:{ ...baseOpts.scales.y, ticks:{ callback:v=>Number(v).toLocaleString()} }, y2:undefined }
        }
      });
    })();

    // Auth doughnut
    (function(){
      const c = document.getElementById('authChart'); if (!c) return;
      new Chart(c.getContext('2d'), {
        type:'doughnut',
        data:{ labels:['Google','Local','Other'], datasets:[{ data:[Number(auth.google||0), Number(auth.local||0), Number(auth.other||0)] }] },
        options:{ responsive:true, maintainAspectRatio:false, cutout:'65%', plugins:{ legend:{ position:'bottom' } } }
      });
    })();

    // Weekly bar
    (function(){
      const c = document.getElementById('weeklySalesChart'); if (!c) return;
      new Chart(c.getContext('2d'), {
        type:'bar',
        data:{ labels:wk.labels, datasets:[{ label:'Weekly Revenue', data:wk.values }] },
        options:{ ...baseOpts, plugins:{ ...baseOpts.plugins, legend:{ display:false } } }
      });
    })();

    // ===== dynamic ring numbers / fills (relative scaling) =====
    (function(){
      const max = Math.max(totals.site||0, totals.store||0, totals.product||0) || 1;
      function setRing(selector, val){
        const wrap = document.querySelector(selector); if (!wrap) return;
        const center = wrap.querySelector('.ring-center'); if (center) center.textContent = Number(val||0).toLocaleString();
        const pct = Math.min(100, Math.round((Number(val||0) / max) * 100));
        wrap.style.setProperty('--pct', String(pct));
      }
      setRing('#ring-site',    totals.site);
      setRing('#ring-store',   totals.store);
      setRing('#ring-product', totals.product);
    })();

    (function drawSellerSparklines(){
  const data = window.__analyticsData || {};
  const trends = data.trendsBySeller || {};
  const allDates = Array.from(new Set(
    Object.values(trends).flat().map(r => String(r.d))
  )).sort((a,b)=> new Date(a)-new Date(b));

  const makeSeries = (arr) => {
    const m = new Map(arr.map(r => [String(r.d), Number(r.orders||0)]));
    return allDates.map(d => m.get(d) || 0);
  };

  document.querySelectorAll('.sparkline').forEach(cnv => {
    const id = cnv.id.replace('spark-','');
    const series = makeSeries(trends[id] || []);
    if (!series.length) return;

    new Chart(cnv.getContext('2d'), {
      type: 'line',
      data: { labels: allDates, datasets: [{ data: series, tension:.35, pointRadius:0, fill:false }] },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ display:false }, tooltip:{ enabled:false } },
        elements:{ line:{ borderWidth:2 } },
        scales:{ x:{ display:false }, y:{ display:false } }
      }
    });
  });
})();


    
  };
})();
