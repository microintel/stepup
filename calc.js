/* ══════════════════════════════════════════════════════
   calc.js — SIP recalculation logic
══════════════════════════════════════════════════════ */

import { dbPut } from './db.js';

/**
 * Get the actual SIP date for a given year+month,
 * clamped to the last day of that month.
 * e.g. SIP day=31, Feb 2024 → 2024-02-29
 */
function sipDateForMonth(sipDay, year, month) {
  // Last day of the target month
  const lastDay = new Date(year, month + 1, 0).getDate();
  const day = Math.min(sipDay, lastDay);
  return new Date(year, month, day);
}

/**
 * Generate all SIP instalment dates from startDate up to and including endDate.
 * Uses original SIP day-of-month, clamped per month (fixes Jan-31 → Mar overflow bug).
 */
function allSipDates(startStr, endStr) {
  const start   = new Date(startStr);
  const end     = new Date(endStr);
  const sipDay  = start.getDate();   // e.g. 1 for June 1
  const dates   = [];

  let year  = start.getFullYear();
  let month = start.getMonth();

  while (true) {
    const d = sipDateForMonth(sipDay, year, month);
    if (d > end) break;
    dates.push(d);
    month++;
    if (month > 11) { month = 0; year++; }
  }
  return dates;
}

/**
 * Count how many SIP instalments fall between prevStr (exclusive)
 * and currStr (inclusive), starting from startStr.
 */
export function sipCountBetween(startStr, prevStr, currStr) {
  if (!startStr) return 0;
  const prev = prevStr ? new Date(prevStr) : null;
  const curr = new Date(currStr);

  const dates = allSipDates(startStr, currStr);
  return dates.filter(d => {
    if (d > curr) return false;
    if (prev) {
      // normalize prev to midnight for clean comparison
      const p = new Date(prev); p.setHours(0,0,0,0);
      return d > p;
    }
    return true;
  }).length;
}

/**
 * Rebuild portfolioValue & investedAmount for all entries in order.
 *
 * Real SIP logic:
 *  1. Before applying today's market %, check if a SIP instalment falls
 *     on or before today (and after the previous entry's date).
 *  2. Add SIP cash to both portfolioValue and investedAmount.
 *  3. Then apply today's percentChange to the full portfolioValue.
 *
 * This mirrors how a real SIP works:
 *  - June 1: ₹9500 invested → market moves → end-of-day value calculated
 *  - June 2: no SIP → market moves → value changes by that day's %
 */
export function recalcAll(raw, cfg) {
  if (!raw.length || !cfg) return [];
  const sorted = [...raw].sort((a, b) => a.date.localeCompare(b.date));
  let portfolioValue = 0, investedAmount = 0, prevDate = null;

  return sorted.map(entry => {
    // Step 1: How many SIP instalments land today (or between prev entry and today)?
    const sips = sipCountBetween(cfg.startDate, prevDate, entry.date);

    // Step 2: Add SIP cash BEFORE applying market % (money was in market today)
    for (let i = 0; i < sips; i++) {
      portfolioValue += cfg.sipAmount;
      investedAmount += cfg.sipAmount;
    }

    // Step 3: Apply today's market % change on total portfolio (incl. fresh SIP)
    portfolioValue = portfolioValue * (1 + entry.percentChange / 100);

    prevDate = entry.date;
    return {
      ...entry,
      sipAdded:       sips > 0,
      sipCount:       sips,
      portfolioValue: +portfolioValue.toFixed(4),
      investedAmount: +investedAmount.toFixed(4),
    };
  });
}

/** Persist the recalculated values back to IndexedDB. */
export async function saveCalcEntries(calc) {
  for (const e of calc) {
    await dbPut('entries', {
      id:             e.id,
      date:           e.date,
      percentChange:  e.percentChange,
      portfolioValue: e.portfolioValue,
      investedAmount: e.investedAmount,
    });
  }
}
