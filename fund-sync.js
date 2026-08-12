/* ══════════════════════════════════════════════════════
   fund-sync.js — Fund NAV import & mfapi.in sync helpers
   Pure/utility functions only — no DOM, no IndexedDB.
   app.js wires these into buttons, state and the database.
══════════════════════════════════════════════════════ */

const MFAPI_BASE = 'https://api.mfapi.in/mf';

/** Convert "DD-MM-YYYY" -> "YYYY-MM-DD". */
export function ddmmyyyyToIso(d) {
  const [dd, mm, yyyy] = d.split('-');
  return `${yyyy}-${mm}-${dd}`;
}

/** Sort a navHistory array (any order, DD-MM-YYYY dates) ascending by date. */
export function sortNavHistoryAsc(navHistory) {
  return [...navHistory].sort((a, b) => ddmmyyyyToIso(a.date).localeCompare(ddmmyyyyToIso(b.date)));
}

/** Parse the fund JSON shape the user uploads: { fund: {...}, navHistory: [...] }. */
export function parseFundFile(json) {
  const fund = json.fund || {};
  return {
    schemeCode: String(fund.schemeCode ?? '').trim(),
    schemeName: fund.schemeName ?? '',
    fundHouse:  fund.fundHouse ?? '',
    navHistory: sortNavHistoryAsc(json.navHistory || []),
  };
}

/** Read a File object (from an <input type=file>) as parsed JSON. */
export function readFileAsJson(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => { try { resolve(JSON.parse(reader.result)); } catch (e) { reject(e); } };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/**
 * Build { date, percentChange } entries from an ASCENDING navHistory array
 * (DD-MM-YYYY dates), starting at the first date >= startDateIso (inclusive).
 *
 * The first included day gets percentChange 0 — it's the baseline the first
 * SIP instalment lands on. Every day after is chained off the previous
 * day's actual NAV, exactly like the app's manual "daily % change" entries.
 */
export function buildEntriesFromNavHistory(navHistoryAsc, startDateIso) {
  const startIdx = navHistoryAsc.findIndex(r => ddmmyyyyToIso(r.date) >= startDateIso);
  if (startIdx === -1) return [];
  const out = [];
  let prevNav = null;
  for (let i = startIdx; i < navHistoryAsc.length; i++) {
    const nav = parseFloat(navHistoryAsc[i].nav);
    if (isNaN(nav)) continue;
    const dateIso = ddmmyyyyToIso(navHistoryAsc[i].date);
    const pct = prevNav === null ? 0 : ((nav / prevNav) - 1) * 100;
    out.push({ date: dateIso, percentChange: +pct.toFixed(4) });
    prevNav = nav;
  }
  return out;
}

/**
 * Fetch a scheme's full NAV history from mfapi.in.
 * Returns { schemeCode, schemeName, fundHouse, navHistory } with navHistory
 * sorted ascending, dates in DD-MM-YYYY (matches the uploaded-file format).
 */
export async function fetchSchemeFromMfapi(schemeCode) {
  const res = await fetch(`${MFAPI_BASE}/${schemeCode}`);
  if (!res.ok) throw new Error(`mfapi request failed (${res.status})`);
  const json = await res.json();
  return {
    schemeCode: String(json.meta?.scheme_code ?? schemeCode),
    schemeName: json.meta?.scheme_name ?? '',
    fundHouse:  json.meta?.fund_house ?? '',
    navHistory: sortNavHistoryAsc(json.data || []),
  };
}

/**
 * Given the existing local entries (ascending, { date: 'YYYY-MM-DD', ... })
 * and a freshly-fetched ascending navHistory (DD-MM-YYYY) for the SAME fund,
 * return only the NEW entries beyond the last local entry's date, chained
 * off the actual NAV on that date (matched by date, not by the stored %,
 * so rounding never drifts).
 *
 * Returns null if the last local entry's date isn't present in the fetched
 * history — the caller should surface a warning rather than guess.
 */
export function buildSyncDelta(localEntriesAsc, navHistoryAsc) {
  if (!localEntriesAsc.length) return null;
  const lastLocalDate = localEntriesAsc[localEntriesAsc.length - 1].date;
  const idx = navHistoryAsc.findIndex(r => ddmmyyyyToIso(r.date) === lastLocalDate);
  if (idx === -1) return null;

  const out = [];
  let prevNav = parseFloat(navHistoryAsc[idx].nav);
  for (let i = idx + 1; i < navHistoryAsc.length; i++) {
    const nav = parseFloat(navHistoryAsc[i].nav);
    if (isNaN(nav)) continue;
    const dateIso = ddmmyyyyToIso(navHistoryAsc[i].date);
    const pct = ((nav / prevNav) - 1) * 100;
    out.push({ date: dateIso, percentChange: +pct.toFixed(4) });
    prevNav = nav;
  }
  return out;
}
