/* ══════════════════════════════════════════════════════
   render.js — Dashboard cards, history table, user page
══════════════════════════════════════════════════════ */

import { fmtK, fmtPct } from './helpers.js';
import { recalcAll }     from './calc.js';
import { renderLineChart, getActiveRange, renderDonutChart } from './charts.js';

let historySortDir    = 'desc';
let historySearchDate = '';

export function setHistorySortDir(val)    { historySortDir    = val; }
export function setHistorySearchDate(val) { historySearchDate = val; }

/**
 * True XIRR via Newton-Raphson, matching the standard brokerage/Excel formula.
 * flows: [{ date: Date, amount: number }], negative = outflow, positive = inflow.
 * Returns the annual rate (e.g. 0.15 for 15%) or null if it doesn't converge.
 */
function computeXIRR(flows) {
  if (flows.length < 2) return null;
  const t0 = flows[0].date;
  const years = flows.map(f => (f.date - t0) / (365 * 86400000));

  const npv = rate => flows.reduce((sum, f, i) => sum + f.amount / Math.pow(1 + rate, years[i]), 0);
  const dnpv = rate => flows.reduce((sum, f, i) =>
    sum - years[i] * f.amount / Math.pow(1 + rate, years[i] + 1), 0);

  let rate = 0.1; // initial guess: 10%
  for (let i = 0; i < 100; i++) {
    const f  = npv(rate);
    const df = dnpv(rate);
    if (Math.abs(df) < 1e-10) break;
    const next = rate - f / df;
    if (!isFinite(next) || next <= -1) return null;
    if (Math.abs(next - rate) < 1e-7) return next;
    rate = next;
  }
  return Math.abs(npv(rate)) < 1 ? rate : null;
}

/* ══════════════════════════════════════════════════════
   Dashboard Cards
══════════════════════════════════════════════════════ */
export function renderDashboard(calc, settings) {

  /* ── Reset all cards when no data ── */
  if (!calc.length || !settings) {
    ['c-invested','c-value','c-pnl','c-ret','c-sips',
     'c-xirr','c-days','c-next-sip','c-streak','c-avg-day'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.className = 'card-value' +
        (id === 'c-invested' ? ' blue' :
         id === 'c-sips'     ? ' amber' : '');
      el.textContent =
        id === 'c-ret'  ? '0.00%' :
        id === 'c-days' || id === 'c-sips' || id === 'c-streak' ? '0' : '—';
    });
    const sub = document.getElementById('c-sips-sub');
    if (sub) sub.textContent = '';
    const nextSub = document.getElementById('c-next-sip-sub');
    if (nextSub) nextSub.textContent = '';
    renderDonutChart(0, 0);
    return;
  }

  const last = calc[calc.length - 1];
  const pnl  = last.portfolioValue - last.investedAmount;
  const ret  = last.investedAmount > 0 ? (pnl / last.investedAmount) * 100 : 0;
  const sips = calc.filter(e => e.sipAdded).length;

  /* ── 1. Total Invested ── */
  document.getElementById('c-invested').textContent = fmtK(last.investedAmount);

  /* ── 2. Portfolio Value ── */
  const vEl = document.getElementById('c-value');
  vEl.textContent = fmtK(last.portfolioValue);
  vEl.className   = 'card-value ' + (last.portfolioValue >= last.investedAmount ? 'green' : 'red');

  /* ── 3. Profit / Loss ── */
  const pEl = document.getElementById('c-pnl');
  pEl.textContent = (pnl >= 0 ? '+' : '') + fmtK(pnl);
  pEl.className   = 'card-value ' + (pnl >= 0 ? 'green' : 'red');

  /* ── 4. Return % — Simple absolute return ──
     This is what brokerage apps (Zerodha, Groww, etc.) show as "Returns":
     plain (current value − invested) / invested. It will naturally look
     smaller while SIPs are still young, since recently-added money hasn't
     had time to grow yet — that's expected, not a bug.
  ── */
  const rEl = document.getElementById('c-ret');
  rEl.textContent = fmtPct(ret);
  rEl.className   = 'card-value ' + (ret >= 0 ? 'green' : 'red');

  /* ── 5. SIP Contributions ── */
  document.getElementById('c-sips').textContent = sips;
  const schedule = settings.sipSchedule || [];
  const subLabel = schedule.length > 1
    ? `stepped`
    : `×₹${settings.sipAmount.toLocaleString('en-IN')}`;
  document.getElementById('c-sips-sub').textContent = subLabel;

  /* ── 6. XIRR — true money-weighted annualized return ──
     Real brokerages build the actual cash-flow ledger:
       • a negative outflow on each SIP date (money leaving your pocket)
       • one positive inflow today = current portfolio value
     then solve for the single annual rate that makes those flows net to
     zero (Newton-Raphson on the XIRR equation). This is what Zerodha/Groww
     call XIRR — it is NOT the same as annualizing the TWR.
  ── */
  const xirrEl = document.getElementById('c-xirr');
  if (xirrEl) {
    const flows = [];
    for (const e of calc) {
      if (e.sipAdded && e.sipTotal > 0) {
        flows.push({ date: new Date(e.date), amount: -e.sipTotal });
      }
    }
    flows.push({ date: new Date(last.date), amount: last.portfolioValue });

    const firstD = flows[0].date;
    const lastD  = flows[flows.length - 1].date;
    const days   = Math.round((lastD - firstD) / 86400000);

    const xirrValue = computeXIRR(flows);

    if (days >= 30 && xirrValue !== null) {
      const ann = xirrValue * 100;
      xirrEl.textContent = (ann >= 0 ? '+' : '') + ann.toFixed(1) + '%';
      xirrEl.className   = 'card-value ' + (ann >= 0 ? 'green' : 'red');
    } else {
      xirrEl.textContent = days < 30 ? `~${30 - days}d to unlock` : '—';
      xirrEl.className   = 'card-value';
    }
  }

  /* ── 7. Days Active ── */
  const daysEl = document.getElementById('c-days');
  if (daysEl && calc.length) {
    const first = new Date(calc[0].date);
    const lastD = new Date(calc[calc.length - 1].date);
    daysEl.textContent = Math.round((lastD - first) / 86400000) + 'd';
    daysEl.className   = 'card-value blue';
  }

  /* ── 8. Next SIP Date ── */
  const nextSipEl = document.getElementById('c-next-sip');
  if (nextSipEl && settings.startDate) {
    const start = new Date(settings.startDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const next = new Date(start);
    while (next <= today) next.setMonth(next.getMonth() + 1);
    const daysLeft = Math.ceil((next - today) / 86400000);
    nextSipEl.textContent = next.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    nextSipEl.className   = 'card-value amber';
    const nextSub = document.getElementById('c-next-sip-sub');
    if (nextSub) nextSub.textContent = `in ${daysLeft}d`;
  }

  /* ── 9. Win Streak (consecutive positive days) ── */
  const streakEl = document.getElementById('c-streak');
  if (streakEl) {
    let streak = 0;
    for (let i = calc.length - 1; i >= 0; i--) {
      if (calc[i].percentChange > 0) streak++;
      else break;
    }
    streakEl.textContent = streak + (streak === 1 ? ' day' : ' days');
    streakEl.className   = 'card-value ' + (streak >= 3 ? 'green' : streak > 0 ? 'amber' : 'red');
  }

  /* ── 10. Avg Daily Change ── */
  const avgEl = document.getElementById('c-avg-day');
  if (avgEl && calc.length) {
    const avg = calc.reduce((s, e) => s + e.percentChange, 0) / calc.length;
    avgEl.textContent = (avg >= 0 ? '+' : '') + avg.toFixed(2) + '%';
    avgEl.className   = 'card-value ' + (avg >= 0 ? 'green' : 'red');
  }

  /* ── Donut Chart ── */
  renderDonutChart(last.investedAmount, pnl);
}

/* ══════════════════════════════════════════════════════
   History Table
══════════════════════════════════════════════════════ */
export function renderTable(calc, settings) {
  const tbody = document.getElementById('history-body');
  document.getElementById('entry-count').textContent = calc.length ? `${calc.length} entries` : '';

  let filtered = calc;
  if (historySearchDate) filtered = calc.filter(e => e.date === historySearchDate);

  const sorted = [...filtered];
  if (historySortDir === 'asc') sorted.sort((a, b) => a.date.localeCompare(b.date));
  else                          sorted.sort((a, b) => b.date.localeCompare(a.date));

  if (!sorted.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty">${
      historySearchDate ? 'No entry found for this date.' : 'No entries yet — add your first daily % change.'
    }</div></td></tr>`;
    return;
  }

  tbody.innerHTML = sorted.map((e, i) => {
    const pct      = e.percentChange;
    const sipBadge = e.sipAdded
      ? `<span class="sip-badge sip-yes">+₹${(e.sipTotal || e.sipCount * settings.sipAmount).toLocaleString('en-IN')}</span>`
      : `<span class="sip-badge sip-no">—</span>`;
    return `<tr>
      <td class="mono" style="color:var(--muted)">${i + 1}</td>
      <td>${e.date}</td>
      <td class="mono ${pct >= 0 ? 'pct-up' : 'pct-down'}">${(pct >= 0 ? '+' : '') + pct.toFixed(2)}%</td>
      <td>${sipBadge}</td>
      <td class="mono">${fmtK(e.portfolioValue)}</td>
      <td class="mono" style="color:var(--blue)">${fmtK(e.investedAmount)}</td>
      <td style="text-align:right;">
        <button class="btn-icon" onclick="startEdit(${e.id})" title="Edit">✏️</button>
        <button class="btn-icon" onclick="deleteEntry(${e.id})" title="Delete" style="color:var(--red)">🗑</button>
      </td>
    </tr>`;
  }).join('');
}

/* ══════════════════════════════════════════════════════
   User / Account Page
══════════════════════════════════════════════════════ */
export function renderUserPage(entries, settings) {
  const calc = recalcAll(entries, settings);
  if (settings) {
    document.getElementById('user-sub-line').textContent        = `₹${settings.sipAmount.toLocaleString('en-IN')} SIP · from ${settings.startDate}`;
    document.getElementById('settings-info-header').textContent = `₹${settings.sipAmount.toLocaleString('en-IN')}/mo`;
  } else {
    document.getElementById('user-sub-line').textContent = 'No settings configured yet';
  }

  document.getElementById('us-entries').textContent = calc.length;

  if (calc.length >= 2) {
    const first  = new Date(calc[0].date), last = new Date(calc[calc.length - 1].date);
    const months = Math.round((last - first) / (1000 * 60 * 60 * 24 * 30));
    document.getElementById('us-months').textContent = months || 1;
  } else {
    document.getElementById('us-months').textContent = calc.length ? 1 : 0;
  }

  if (calc.length) {
    const pcts  = calc.map(e => e.percentChange);
    const best  = Math.max(...pcts), worst = Math.min(...pcts);
    document.getElementById('us-best').textContent  = (best  >= 0 ? '+' : '') + best.toFixed(2)  + '%';
    document.getElementById('us-worst').textContent = (worst >= 0 ? '+' : '') + worst.toFixed(2) + '%';
  } else {
    document.getElementById('us-best').textContent  = '—';
    document.getElementById('us-worst').textContent = '—';
  }
}

/* ══════════════════════════════════════════════════════
   Full Render
══════════════════════════════════════════════════════ */
export function renderAll(entries, settings) {
  const calc = recalcAll(entries, settings);
  renderDashboard(calc, settings);
  renderTable(calc, settings);
  if (document.getElementById('page-graph').classList.contains('active')) {
    renderLineChart(calc);
  }
}
