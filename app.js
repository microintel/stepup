/* ══════════════════════════════════════════════════════
   app.js — Navigation, events, settings, entry CRUD, boot
══════════════════════════════════════════════════════ */

import { openDB, dbGet, dbPut, dbDel, dbAll, dbClr } from './db.js';
import { toast, todayStr, dateToStr }                 from './helpers.js';
import { recalcAll, saveCalcEntries, sipsBetween }    from './calc.js';
import {
  renderLineChart, applyRangeToMain,
  setActiveRange, wireSelectionDrag,
} from './charts.js';
import {
  renderAll, renderTable, renderUserPage,
  setHistorySortDir, setHistorySearchDate,
} from './render.js';

/* ══════════════════════════════════════════════════════
   App State
══════════════════════════════════════════════════════ */
let settings = null;
let entries  = [];

/* Re-export for inline onclick handlers */
window.startEdit    = startEdit;
window.deleteEntry  = deleteEntry;

/* ══════════════════════════════════════════════════════
   Load
══════════════════════════════════════════════════════ */
async function loadAll() {
  settings = await dbGet('settings', 1) || null;
  entries  = await dbAll('entries');
  entries.sort((a, b) => a.date.localeCompare(b.date));
}

/* ══════════════════════════════════════════════════════
   Navigation
══════════════════════════════════════════════════════ */
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.page).classList.add('active');
    if (btn.dataset.page === 'page-graph')   setTimeout(() => renderLineChart(recalcAll(entries, settings)), 50);
    if (btn.dataset.page === 'page-history') renderTable(recalcAll(entries, settings), settings);
    if (btn.dataset.page === 'page-user')    { renderUserPage(entries, settings); renderScheduleList(); renderSkipList(); }
    if (btn.dataset.page === 'page-add')     initHelper();
  });
});

/* ══════════════════════════════════════════════════════
   Settings — helpers
══════════════════════════════════════════════════════ */

/** Ensure settings has a sipSchedule array. */
function normalizeSettings(s) {
  if (!s) return s;
  if (!s.sipSchedule || !s.sipSchedule.length) {
    s.sipSchedule = [{ fromDate: s.startDate, amount: s.sipAmount || 0 }];
  }
  if (!s.skippedSipDates) s.skippedSipDates = [];
  // Keep legacy sipAmount in sync with latest segment for old code paths
  const last = s.sipSchedule[s.sipSchedule.length - 1];
  s.sipAmount = last ? last.amount : s.sipAmount;
  return s;
}

function currentSipAmount() {
  if (!settings || !settings.sipSchedule || !settings.sipSchedule.length) return 0;
  return settings.sipSchedule[settings.sipSchedule.length - 1].amount;
}

function applySettingsToUI() {
  if (!settings) return;
  const amt = currentSipAmount();
  // Show latest SIP amount in the original fields
  document.getElementById('sip-amount').value          = amt;
  document.getElementById('sip-start').value           = settings.startDate;
  document.getElementById('settings-info').textContent =
    `Active: ₹${amt.toLocaleString('en-IN')} SIP from ${settings.startDate}`;
  document.getElementById('settings-info-header').textContent = `₹${amt.toLocaleString('en-IN')}/mo`;
}

/* ══════════════════════════════════════════════════════
   Initial SIP Save (first-time / start date change)
══════════════════════════════════════════════════════ */
document.getElementById('btn-save-settings').addEventListener('click', async () => {
  const amt  = parseFloat(document.getElementById('sip-amount').value);
  const date = document.getElementById('sip-start').value;
  if (!amt || amt <= 0 || !date) { toast('Enter a valid SIP amount and start date.'); return; }

  if (settings && settings.startDate === date) {
    // Just updating initial amount → update first segment only
    settings.sipSchedule[0] = { fromDate: date, amount: amt };
    // Remove any step-up segments before this date (shouldn't exist but safety)
    settings.sipSchedule = settings.sipSchedule.filter(s => s.fromDate >= date);
  } else {
    // New SIP or start date changed → reset schedule
    settings = {
      id: 1,
      startDate: date,
      sipAmount: amt,
      sipSchedule: [{ fromDate: date, amount: amt }],
      skippedSipDates: settings ? (settings.skippedSipDates || []) : [],
    };
  }
  normalizeSettings(settings);
  await dbPut('settings', settings);
  applySettingsToUI();
  renderScheduleList();
  renderSkipList();
  const calc = recalcAll(entries, settings);
  await saveCalcEntries(calc);
  entries = await dbAll('entries');
  entries.sort((a, b) => a.date.localeCompare(b.date));
  renderAll(entries, settings);
  toast('Settings saved ✓');
});

/* ══════════════════════════════════════════════════════
   Step-Up SIP
══════════════════════════════════════════════════════ */
document.getElementById('btn-add-stepup').addEventListener('click', async () => {
  if (!settings) { toast('Save base SIP settings first.'); return; }
  const newAmt  = parseFloat(document.getElementById('stepup-amount').value);
  const fromDate = document.getElementById('stepup-date').value;
  if (!newAmt || newAmt <= 0 || !fromDate) { toast('Enter a valid new amount and effective date.'); return; }
  if (fromDate < settings.startDate) { toast('Step-up date cannot be before SIP start date.'); return; }

  // Remove any existing segment with the same fromDate, then add new one
  settings.sipSchedule = settings.sipSchedule.filter(s => s.fromDate !== fromDate);
  settings.sipSchedule.push({ fromDate, amount: newAmt });
  settings.sipSchedule.sort((a, b) => a.fromDate.localeCompare(b.fromDate));
  normalizeSettings(settings);

  await dbPut('settings', settings);
  applySettingsToUI();
  renderScheduleList();
  document.getElementById('stepup-amount').value = '';
  document.getElementById('stepup-date').value   = '';

  const calc = recalcAll(entries, settings);
  await saveCalcEntries(calc);
  entries = await dbAll('entries');
  entries.sort((a, b) => a.date.localeCompare(b.date));
  renderAll(entries, settings);
  toast(`Step-up to ₹${newAmt.toLocaleString('en-IN')} from ${fromDate} ✓`);
});

/** Render the SIP schedule segments list */
function renderScheduleList() {
  const el = document.getElementById('stepup-schedule-list');
  if (!el || !settings || !settings.sipSchedule) return;
  if (!settings.sipSchedule.length) { el.innerHTML = ''; return; }
  el.innerHTML = settings.sipSchedule.map((s, i) => `
    <div class="schedule-row">
      <div class="schedule-info">
        <span class="schedule-amt">₹${s.amount.toLocaleString('en-IN')}</span>
        <span class="schedule-from">from ${s.fromDate}</span>
      </div>
      ${i === 0
        ? '<span class="schedule-badge">Base</span>'
        : `<button class="btn-icon schedule-del" data-idx="${i}" title="Remove step-up" style="color:var(--red)">🗑</button>`
      }
    </div>`).join('');

  el.querySelectorAll('.schedule-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.idx);
      settings.sipSchedule.splice(idx, 1);
      normalizeSettings(settings);
      await dbPut('settings', settings);
      applySettingsToUI();
      renderScheduleList();
      const calc = recalcAll(entries, settings);
      await saveCalcEntries(calc);
      entries = await dbAll('entries');
      entries.sort((a, b) => a.date.localeCompare(b.date));
      renderAll(entries, settings);
      toast('Step-up removed ✓');
    });
  });
}

/* ══════════════════════════════════════════════════════
   Skip a SIP Instalment
══════════════════════════════════════════════════════ */
document.getElementById('btn-skip-sip').addEventListener('click', async () => {
  if (!settings) { toast('Save base SIP settings first.'); return; }
  const skipDate = document.getElementById('skip-sip-date').value;
  if (!skipDate) { toast('Pick a SIP date to skip.'); return; }

  // Validate: must be an actual SIP date
  const allDates = getAllUpcomingSipDates();
  const isValid  = allDates.some(d => d === skipDate);
  if (!isValid) { toast('That date is not a SIP instalment date.'); return; }

  if ((settings.skippedSipDates || []).includes(skipDate)) {
    toast('Already skipped for that date.'); return;
  }

  settings.skippedSipDates = [...(settings.skippedSipDates || []), skipDate].sort();
  await dbPut('settings', settings);
  renderSkipList();
  document.getElementById('skip-sip-date').value = '';

  const calc = recalcAll(entries, settings);
  await saveCalcEntries(calc);
  entries = await dbAll('entries');
  entries.sort((a, b) => a.date.localeCompare(b.date));
  renderAll(entries, settings);
  toast(`SIP skipped for ${skipDate} ✓`);
});

/** Returns all SIP dates (past + next 12 months) as YYYY-MM-DD strings */
function getAllUpcomingSipDates() {
  if (!settings || !settings.startDate) return [];
  const start  = new Date(settings.startDate);
  const sipDay = start.getDate();
  const results = [];
  // Past: from startDate
  let y = start.getFullYear(), m = start.getMonth();
  const end = new Date();
  end.setMonth(end.getMonth() + 12);
  while (true) {
    const lastDay = new Date(y, m + 1, 0).getDate();
    const d = new Date(y, m, Math.min(sipDay, lastDay));
    if (d > end) break;
    if (d >= start) results.push(dateToStr(d));
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return results;
}

function renderSkipList() {
  const el = document.getElementById('skip-list');
  if (!el || !settings) return;
  const skipped = settings.skippedSipDates || [];
  if (!skipped.length) { el.innerHTML = '<span class="muted-note">No skipped months.</span>'; return; }
  el.innerHTML = skipped.map(d => `
    <div class="schedule-row">
      <div class="schedule-info">
        <span class="schedule-from">⏭ ${d}</span>
      </div>
      <button class="btn-icon schedule-del" data-date="${d}" title="Restore" style="color:var(--green)">↩</button>
    </div>`).join('');

  el.querySelectorAll('.schedule-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      settings.skippedSipDates = settings.skippedSipDates.filter(d => d !== btn.dataset.date);
      await dbPut('settings', settings);
      renderSkipList();
      const calc = recalcAll(entries, settings);
      await saveCalcEntries(calc);
      entries = await dbAll('entries');
      entries.sort((a, b) => a.date.localeCompare(b.date));
      renderAll(entries, settings);
      toast('SIP restored ✓');
    });
  });
}

/* ══════════════════════════════════════════════════════
   Daily % Helper (total return → daily change)
══════════════════════════════════════════════════════ */
function getLastTotalReturnPct() {
  const calc = recalcAll(entries, settings);
  if (!calc.length) return null;
  const last = calc[calc.length - 1];
  if (!last.investedAmount) return null;
  return ((last.portfolioValue - last.investedAmount) / last.investedAmount) * 100;
}

function initHelper() {
  const prevInput  = document.getElementById('helper-prev');
  const todayInput = document.getElementById('helper-today');
  const resultBox  = document.getElementById('helper-result');
  const resultVal  = document.getElementById('helper-result-value');
  const useBtn     = document.getElementById('helper-use-btn');
  const prevHint   = document.getElementById('helper-prev-hint');

  const lastPct = getLastTotalReturnPct();
  if (lastPct !== null) {
    prevInput.value = lastPct.toFixed(2);
    prevHint.textContent = 'auto-filled from last entry';
  } else {
    prevInput.value = '';
    prevHint.textContent = 'enter manually if no entries yet';
  }

  todayInput.value = '';
  resultBox.style.display = 'none';

  function computeDaily() {
    const prev  = parseFloat(prevInput.value);
    const today = parseFloat(todayInput.value);
    if (isNaN(prev) || isNaN(today)) { resultBox.style.display = 'none'; return; }
    const daily = ((1 + today / 100) / (1 + prev / 100) - 1) * 100;
    resultVal.textContent = (daily >= 0 ? '+' : '') + daily.toFixed(2) + '%';
    resultVal.className   = 'helper-result-value ' + (daily >= 0 ? 'pos' : 'neg');
    resultBox.style.display = 'flex';
    useBtn.dataset.daily = daily.toFixed(4);
  }

  prevInput.addEventListener('input',  computeDaily);
  todayInput.addEventListener('input', computeDaily);

  useBtn.addEventListener('click', () => {
    const val = useBtn.dataset.daily;
    if (!val) return;
    document.getElementById('entry-pct').value = parseFloat(val).toFixed(2);
    updateEntryPreview();
    document.getElementById('entry-pct').focus();
  });
}

function updateEntryPreview() {
  const pctStr  = document.getElementById('entry-pct').value.trim();
  const dateVal = document.getElementById('entry-date').value;
  const pct     = parseFloat(pctStr);
  if (!settings || isNaN(pct) || !dateVal) {
    document.getElementById('entry-preview').textContent = ''; return;
  }
  const calc = recalcAll(entries, settings);
  const last = calc.length ? calc[calc.length - 1] : null;
  let base = last ? last.portfolioValue : 0;
  let inv  = last ? last.investedAmount : 0;

  const sips = sipsBetween(settings, last ? last.date : null, dateVal);
  const sipTotal = sips.reduce((s, x) => s + x.amount, 0);
  base += sipTotal;
  inv  += sipTotal;
  const newVal  = base * (1 + pct / 100);
  const sipNote = sipTotal > 0 ? ` (+ ₹${sipTotal.toLocaleString('en-IN')} SIP)` : '';
  document.getElementById('entry-preview').textContent =
    `→ ₹${base.toFixed(2)} × (1 ${pct >= 0 ? '+' : '-'} ${Math.abs(pct)}%) = ₹${newVal.toFixed(2)}${sipNote}`;
}
document.getElementById('entry-pct').addEventListener('input',  updateEntryPreview);
document.getElementById('entry-date').addEventListener('change', updateEntryPreview);

/* ══════════════════════════════════════════════════════
   Add Entry
══════════════════════════════════════════════════════ */
document.getElementById('btn-add-entry').addEventListener('click', async () => {
  if (!settings) { toast('Save SIP settings first.'); return; }
  const dateVal = document.getElementById('entry-date').value;
  const pctStr  = document.getElementById('entry-pct').value.trim();
  if (!dateVal || !pctStr) { toast('Enter date and % change.'); return; }
  const pct = parseFloat(pctStr);
  if (isNaN(pct)) { toast('Invalid % — e.g. +4.73 or -3.32'); return; }
  if (entries.find(e => e.date === dateVal)) { toast('Entry for this date already exists.'); return; }
  await dbPut('entries', { date: dateVal, percentChange: pct, portfolioValue: 0, investedAmount: 0 });
  entries = await dbAll('entries');
  entries.sort((a, b) => a.date.localeCompare(b.date));
  const calc = recalcAll(entries, settings);
  await saveCalcEntries(calc);
  entries = await dbAll('entries');
  entries.sort((a, b) => a.date.localeCompare(b.date));
  document.getElementById('entry-pct').value = '';
  document.getElementById('entry-preview').textContent = '';
  renderAll(entries, settings);
  toast(`Entry added for ${dateVal} ✓`);
});

/* ══════════════════════════════════════════════════════
   Edit Entry
══════════════════════════════════════════════════════ */
let editId = null;
function startEdit(id) {
  editId = id;
  const e = entries.find(x => x.id === id); if (!e) return;
  document.getElementById('edit-date').value = e.date;
  document.getElementById('edit-pct').value  = e.percentChange;
  document.getElementById('edit-modal').classList.add('open');
}
document.getElementById('edit-cancel').addEventListener('click', () =>
  document.getElementById('edit-modal').classList.remove('open'));

document.getElementById('edit-save').addEventListener('click', async () => {
  const dateVal = document.getElementById('edit-date').value;
  const pct     = parseFloat(document.getElementById('edit-pct').value);
  if (!dateVal || isNaN(pct)) { toast('Invalid values.'); return; }
  if (entries.find(e => e.date === dateVal && e.id !== editId)) { toast('Another entry already exists for that date.'); return; }
  await dbPut('entries', { id: editId, date: dateVal, percentChange: pct, portfolioValue: 0, investedAmount: 0 });
  entries = await dbAll('entries');
  entries.sort((a, b) => a.date.localeCompare(b.date));
  await saveCalcEntries(recalcAll(entries, settings));
  entries = await dbAll('entries');
  entries.sort((a, b) => a.date.localeCompare(b.date));
  document.getElementById('edit-modal').classList.remove('open');
  renderAll(entries, settings);
  toast('Entry updated ✓');
});

/* ══════════════════════════════════════════════════════
   Delete Entry
══════════════════════════════════════════════════════ */
async function deleteEntry(id) {
  if (!confirm('Delete this entry?')) return;
  await dbDel('entries', id);
  entries = await dbAll('entries');
  entries.sort((a, b) => a.date.localeCompare(b.date));
  await saveCalcEntries(recalcAll(entries, settings));
  entries = await dbAll('entries');
  entries.sort((a, b) => a.date.localeCompare(b.date));
  renderAll(entries, settings);
  toast('Entry deleted ✓');
}

/* ══════════════════════════════════════════════════════
   Export / Import / Reset
══════════════════════════════════════════════════════ */
document.getElementById('btn-export-row').addEventListener('click', () => {
  const a   = document.createElement('a');
  a.href    = URL.createObjectURL(new Blob([JSON.stringify({ settings, entries }, null, 2)], { type: 'application/json' }));
  a.download = `sip-data-${todayStr()}.json`;
  a.click();
  toast('Exported ✓');
});

document.getElementById('btn-import-row').addEventListener('click', () =>
  document.getElementById('import-file').click());

document.getElementById('import-file').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.settings) {
      settings = normalizeSettings(data.settings);
      await dbPut('settings', settings);
    }
    if (Array.isArray(data.entries)) {
      await dbClr('entries');
      for (const en of data.entries) { const { id, ...r } = en; await dbPut('entries', r); }
      entries = await dbAll('entries');
      entries.sort((a, b) => a.date.localeCompare(b.date));
      await saveCalcEntries(recalcAll(entries, settings));
      entries = await dbAll('entries');
      entries.sort((a, b) => a.date.localeCompare(b.date));
    }
    applySettingsToUI();
    renderAll(entries, settings);
    renderUserPage(entries, settings);
    renderScheduleList();
    renderSkipList();
    toast('Imported ✓');
  } catch { toast('Import failed — invalid JSON.'); }
  e.target.value = '';
});

document.getElementById('btn-reset-row').addEventListener('click', async () => {
  if (!confirm('Reset ALL data? This cannot be undone.')) return;
  await dbClr('settings'); await dbClr('entries');
  settings = null; entries = [];
  document.getElementById('sip-amount').value             = '';
  document.getElementById('sip-start').value              = '';
  document.getElementById('settings-info').textContent    = '';
  document.getElementById('settings-info-header').textContent = '';
  renderAll(entries, settings);
  renderUserPage(entries, settings);
  renderScheduleList();
  renderSkipList();
  toast('All data cleared.');
});

/* ══════════════════════════════════════════════════════
   History Search & Sort
══════════════════════════════════════════════════════ */
document.getElementById('history-search-date').addEventListener('input', function () {
  setHistorySearchDate(this.value);
  renderTable(recalcAll(entries, settings), settings);
});

const sortBtn = document.getElementById('sort-toggle-btn');
let _sortDir = 'desc';
sortBtn.addEventListener('click', () => {
  _sortDir = _sortDir === 'desc' ? 'asc' : 'desc';
  sortBtn.className = `sort-btn sort-${_sortDir}`;
  setHistorySortDir(_sortDir);
  renderTable(recalcAll(entries, settings), settings);
});

/* ══════════════════════════════════════════════════════
   Range Pills & Reset Zoom
══════════════════════════════════════════════════════ */
document.querySelectorAll('#range-pills-line .range-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('#range-pills-line .range-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    setActiveRange('line', pill.dataset.range);
    applyRangeToMain(pill.dataset.range);
  });
});

document.getElementById('btn-reset-zoom').addEventListener('click', () => {
  applyRangeToMain('all');
  document.querySelectorAll('#range-pills-line .range-pill').forEach(p =>
    p.classList.toggle('active', p.dataset.range === 'all'));
  setActiveRange('line', 'all');
});

/* ══════════════════════════════════════════════════════
   Theme
══════════════════════════════════════════════════════ */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('sip-theme', theme);
  document.querySelectorAll('.theme-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.theme === theme));
  if (document.getElementById('page-graph').classList.contains('active')) {
    renderLineChart(recalcAll(entries, settings));
  }
}
document.querySelectorAll('.theme-btn').forEach(btn =>
  btn.addEventListener('click', () => applyTheme(btn.dataset.theme)));

/* ══════════════════════════════════════════════════════
   Boot
══════════════════════════════════════════════════════ */
(async () => {
  if (window.Chart && window.ChartZoom) Chart.register(ChartZoom);
  applyTheme(localStorage.getItem('sip-theme') || 'dark');
  await openDB();
  await loadAll();
  // Migrate old single-amount settings → sipSchedule format
  if (settings) settings = normalizeSettings(settings);
  applySettingsToUI();
  document.getElementById('entry-date').value = todayStr();
  renderAll(entries, settings);
  initHelper();
  wireSelectionDrag();
  renderScheduleList();
  renderSkipList();
})();
