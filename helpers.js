/* ══════════════════════════════════════════════════════
   helpers.js — Formatting, toast, date utils
══════════════════════════════════════════════════════ */

export function fmt(n)    { return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
export function fmtK(n)   { return Math.abs(n) >= 1e5 ? '₹' + (n / 1e5).toFixed(2) + 'L' : fmt(n); }
export function fmtPct(n) { return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'; }

export function themeColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function toast(msg, dur = 2400) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), dur);
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
