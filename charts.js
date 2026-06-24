/* ══════════════════════════════════════════════════════
   charts.js — Line chart + overview navigator + donut
══════════════════════════════════════════════════════ */

import { themeColor, fmtK } from './helpers.js';

const charts = {};
export let fullLabels   = [];
export let fullValues   = [];
export let fullInvested = [];
export let selRange     = { min: 0, max: 0 };

/* ── Shared utils ── */
function makeChart(id, config) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(document.getElementById(id).getContext('2d'), config);
  return charts[id];
}

function getTooltipStyle() {
  return {
    backgroundColor: themeColor('--surface2'),
    borderColor:     themeColor('--border'),
    borderWidth:     1,
    titleColor:      themeColor('--text'),
    bodyColor:       themeColor('--muted'),
    padding:         10,
  };
}

function buildFullSeries(calc) {
  fullLabels   = calc.map(e => e.date);
  fullValues   = calc.map(e => e.portfolioValue);
  fullInvested = calc.map(e => e.investedAmount);
}

/* ── Overview band plugin ── */
const overviewBandPlugin = {
  id: 'overviewBand',
  beforeDatasetsDraw(chart) {
    const { ctx, chartArea, scales: { x } } = chart;
    if (!chartArea || !fullLabels.length) return;
    const left  = x.getPixelForValue(selRange.min);
    const right = x.getPixelForValue(selRange.max);
    ctx.save();
    ctx.fillStyle = 'rgba(47,129,247,.07)';
    ctx.fillRect(left, chartArea.top, right - left, chartArea.bottom - chartArea.top);
    ctx.restore();
  },
};

/* ── Touch scroll lock ── */
function lockChartTouch(canvasEl) {
  canvasEl._touchLocked = true;
  const prevent = e => { if (canvasEl._touchLocked) e.preventDefault(); };
  canvasEl.addEventListener('touchstart', prevent, { passive: false });
  canvasEl.addEventListener('touchmove',  prevent, { passive: false });
}

/* ══════════════════════════════════════════════════════
   Main Line Chart
══════════════════════════════════════════════════════ */
export function renderLineChart(calc) {
  buildFullSeries(calc);
  const muted    = themeColor('--muted');
  const positive = fullValues[fullValues.length - 1] >= fullInvested[fullInvested.length - 1];

  makeChart('chart-line', {
    type: 'line',
    data: {
      labels: fullLabels,
      datasets: [{
        label:                 'Portfolio Value',
        data:                  fullValues,
        borderColor:           positive ? '#00c853' : '#ff5252',
        borderWidth:           3,
        tension:               0.45,
        pointRadius:           0,
        pointHoverRadius:      6,
        pointHoverBorderWidth: 3,
        fill:                  true,
        backgroundColor: ctx => {
          const { ctx: canvas, chartArea } = ctx.chart;
          if (!chartArea) return null;
          const gradient = canvas.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          if (positive) {
            gradient.addColorStop(0, 'rgba(0,200,83,0.35)');
            gradient.addColorStop(1, 'rgba(0,200,83,0)');
          } else {
            gradient.addColorStop(0, 'rgba(255,82,82,0.35)');
            gradient.addColorStop(1, 'rgba(255,82,82,0)');
          }
          return gradient;
        },
      }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      interaction:         { intersect: false, mode: 'index' },
      plugins: {
        legend:  { labels: { color: muted, font: { size: 11 } } },
        tooltip: {
          ...getTooltipStyle(),
          callbacks: { label: c => ` ${c.dataset.label}: ${fmtK(c.parsed.y)}` },
        },
        zoom: {
          pan: {
            enabled: true,
            mode:    'x',
            onPanComplete: ({ chart }) => syncSelectionFromMain(chart),
          },
          zoom: {
            wheel:          { enabled: true },
            pinch:          { enabled: true },
            drag:           { enabled: false },
            mode:           'x',
            onZoomComplete: ({ chart }) => syncSelectionFromMain(chart),
          },
          limits: {
            x: { min: 0, max: Math.max(fullLabels.length - 1, 0), minRange: 5 },
          },
        },
      },
      scales: { x: { display: false }, y: { display: false } },
    },
  });

  lockChartTouch(document.getElementById('chart-line'));
  renderOverviewChart();
  applyRangeToMain(_activeRange.line);
}

/* ══════════════════════════════════════════════════════
   Overview Mini Strip
══════════════════════════════════════════════════════ */
export function renderOverviewChart() {
  const grey = 'rgba(125,133,144,.55)';
  makeChart('chart-overview', {
    type: 'line',
    data: {
      labels: fullLabels,
      datasets: [{
        data:        fullValues,
        borderWidth: 1.2,
        pointRadius: 0,
        fill:        false,
        tension:     .3,
        segment: {
          borderColor: ctx =>
            (ctx.p0DataIndex >= selRange.min && ctx.p1DataIndex <= selRange.max)
              ? '#2f81f7' : grey,
        },
      }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      animation:           false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales:  { x: { display: false }, y: { display: false } },
    },
    plugins: [overviewBandPlugin],
  });
}

/* ══════════════════════════════════════════════════════
   Selection Sync
══════════════════════════════════════════════════════ */
export function syncSelectionFromMain(chart) {
  const xs = chart.scales.x;
  let min  = Math.round(xs.min), max = Math.round(xs.max);
  min = Math.max(0, min);
  max = Math.min(fullLabels.length - 1, max);
  selRange = { min, max };
  refreshSelectionUI();
}

export function refreshSelectionUI() {
  if (charts['chart-overview']) charts['chart-overview'].update('none');
  positionSelectionBox();
}

export function positionSelectionBox() {
  const ov   = charts['chart-overview'];
  const wrap = document.getElementById('overview-wrap');
  const box  = document.getElementById('selection-box');
  if (!ov || !wrap || !box || !fullLabels.length) return;
  const xs    = ov.scales.x;
  const left  = xs.getPixelForValue(selRange.min);
  const right = xs.getPixelForValue(selRange.max);
  box.style.left  = left + 'px';
  box.style.width = Math.max(right - left, 16) + 'px';
}

/* ══════════════════════════════════════════════════════
   Range / Zoom
══════════════════════════════════════════════════════ */
let _activeRange = { line: 'all' };
export function setActiveRange(key, val) { _activeRange[key] = val; }
export function getActiveRange()         { return _activeRange; }

export function applyRangeToMain(rangeVal) {
  const n = fullLabels.length;
  if (!n) { selRange = { min: 0, max: 0 }; refreshSelectionUI(); return; }
  let minIdx = 0;
  if (rangeVal !== 'all') {
    const lastDate = new Date(fullLabels[n - 1]), cutoff = new Date(lastDate);
    if (rangeVal === '7d') cutoff.setDate(cutoff.getDate() - 7);
    else cutoff.setMonth(cutoff.getMonth() - parseInt(rangeVal));
    const idx = fullLabels.findIndex(d => new Date(d) >= cutoff);
    minIdx = idx === -1 ? 0 : idx;
  }
  const chart = charts['chart-line'];
  if (chart) chart.zoomScale('x', { min: minIdx, max: n - 1 }, 'none');
  selRange = { min: minIdx, max: n - 1 };
  refreshSelectionUI();
}

export function filterByRange(calc, rangeVal) {
  if (rangeVal === 'all' || !calc.length) return calc;
  const last   = new Date(calc[calc.length - 1].date);
  const cutoff = new Date(last);
  if (rangeVal === '7d') cutoff.setDate(cutoff.getDate() - 7);
  else cutoff.setMonth(cutoff.getMonth() - parseInt(rangeVal));
  return calc.filter(e => new Date(e.date) >= cutoff);
}

export function getChart(id) { return charts[id]; }

/* ══════════════════════════════════════════════════════
   Dashboard Donut — Invested vs Profit / Loss
══════════════════════════════════════════════════════ */
function fmtDonut(n) {
  return Math.abs(n) >= 1e5
    ? '₹' + (n / 1e5).toFixed(2) + 'L'
    : '₹' + Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

export function renderDonutChart(invested, pnl) {
  const canvas = document.getElementById('chart-donut');
  if (!canvas) return;

  const profit  = pnl > 0 ? pnl : 0;
  const loss    = pnl < 0 ? Math.abs(pnl) : 0;
  const isLoss  = loss > 0;
  const isEmpty = invested <= 0;

  /* Update text labels */
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('donut-total',    isEmpty ? '₹0' : fmtDonut(invested + pnl));
  set('donut-invested', isEmpty ? '₹0' : fmtDonut(invested));
  set('donut-profit',   profit > 0 ? '+' + fmtDonut(profit) : '₹0');
  set('donut-loss',     loss   > 0 ? '-' + fmtDonut(loss)   : '₹0');

  /* Build data + colors fresh each call so tooltip closure is always current */
  const data   = isEmpty  ? [1]
               : isLoss   ? [invested, loss]
               :             [invested, profit || 0.001];

  const colors = isEmpty  ? ['#21262d']
               : isLoss   ? ['#58a6ff', '#f85149']
               :             ['#58a6ff', '#00c853'];

  const tooltipLabels = isLoss ? ['Invested', 'Loss'] : ['Invested', 'Profit'];

  /* If chart already exists — update data in-place (no flicker) */
  if (charts['chart-donut']) {
    const ch = charts['chart-donut'];
    ch.data.datasets[0].data            = data;
    ch.data.datasets[0].backgroundColor = colors;
    /* Re-assign tooltip callback so labels stay correct after update */
    ch.options.plugins.tooltip.callbacks.label = ctx =>
      ` ${tooltipLabels[ctx.dataIndex] ?? ''}: ${fmtDonut(ctx.parsed)}`;
    ch.update();
    return;
  }

  /* First render */
  charts['chart-donut'] = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      datasets: [{
        data,
        backgroundColor:  colors,
        borderColor:      'transparent',
        borderWidth:      0,
        hoverOffset:      6,
        borderRadius:     4,
      }],
    },
    options: {
      responsive:          false,
      maintainAspectRatio: false,
      cutout:              '70%',
      plugins: {
        legend:  { display: false },
        tooltip: {
          ...getTooltipStyle(),
          callbacks: {
            label: ctx =>
              ` ${tooltipLabels[ctx.dataIndex] ?? ''}: ${fmtDonut(ctx.parsed)}`,
          },
        },
      },
      animation: { duration: 500 },
    },
  });
}

/* ══════════════════════════════════════════════════════
   Draggable / Resizable Navigator Selection Box
══════════════════════════════════════════════════════ */
export function wireSelectionDrag() {
  const box  = document.getElementById('selection-box');
  const wrap = document.getElementById('overview-wrap');
  let mode = null, startX = 0, startMin = 0, startMax = 0;

  function pxToIdx(px) {
    const ov = charts['chart-overview']; if (!ov) return 0;
    const v  = ov.scales.x.getValueForPixel(px);
    return Math.max(0, Math.min(fullLabels.length - 1, Math.round(v)));
  }

  function applySelToMain() {
    const chart = charts['chart-line'];
    if (chart) chart.zoomScale('x', { min: selRange.min, max: selRange.max }, 'none');
    refreshSelectionUI();
  }

  function onDown(handle, e) {
    mode     = handle;
    startX   = (e.touches ? e.touches[0] : e).clientX;
    startMin = selRange.min;
    startMax = selRange.max;
    e.preventDefault();
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend',  onUp);
  }

  function onMove(e) {
    if (!mode) return;
    e.preventDefault();
    const clientX = (e.touches ? e.touches[0] : e).clientX;
    const ov = charts['chart-overview']; if (!ov) return;
    const xs   = ov.scales.x;
    const dxPx = clientX - startX;
    if (mode === 'move') {
      const startMinPx = xs.getPixelForValue(startMin);
      const startMaxPx = xs.getPixelForValue(startMax);
      let newMinIdx = pxToIdx(startMinPx + dxPx);
      const span    = startMax - startMin;
      newMinIdx     = Math.max(0, Math.min(fullLabels.length - 1 - span, newMinIdx));
      selRange      = { min: newMinIdx, max: newMinIdx + span };
    } else if (mode === 'left') {
      const px = xs.getPixelForValue(startMin) + dxPx;
      selRange = { min: Math.min(pxToIdx(px), selRange.max - 3), max: selRange.max };
      if (selRange.min < 0) selRange.min = 0;
    } else if (mode === 'right') {
      const px = xs.getPixelForValue(startMax) + dxPx;
      selRange = { min: selRange.min, max: Math.max(pxToIdx(px), selRange.min + 3) };
      if (selRange.max > fullLabels.length - 1) selRange.max = fullLabels.length - 1;
    }
    positionSelectionBox();
    if (charts['chart-overview']) charts['chart-overview'].update('none');
  }

  function onUp() {
    mode = null;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend',  onUp);
    applySelToMain();
  }

  /* Lock overview strip touch so it doesn't scroll the page */
  wrap.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  wrap.addEventListener('touchmove',  e => e.preventDefault(), { passive: false });

  box.addEventListener('mousedown',  e => { if (e.target.dataset.handle) return; onDown('move', e); });
  box.addEventListener('touchstart', e => { if (e.target.dataset.handle) return; onDown('move', e); }, { passive: false });
  box.querySelector('.sel-handle-l').addEventListener('mousedown',  e => onDown('left',  e));
  box.querySelector('.sel-handle-l').addEventListener('touchstart', e => onDown('left',  e), { passive: false });
  box.querySelector('.sel-handle-r').addEventListener('mousedown',  e => onDown('right', e));
  box.querySelector('.sel-handle-r').addEventListener('touchstart', e => onDown('right', e), { passive: false });

  window.addEventListener('resize', positionSelectionBox);
}
