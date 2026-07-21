/* ══════════════════════════════════════════════════════
   pdf-report.js — Full SIP PDF report (core jsPDF only)
   No autoTable plugin dependency — tables are hand-drawn so
   nothing can silently fail to attach from a CDN mismatch.
   Includes: daily % change, invested/value, SIP amounts,
   skipped instalments, step-up schedule. Header = project name
   + fund name. Footer = "Developed by Microintel" on every page.
══════════════════════════════════════════════════════ */

import { recalcAll } from './calc.js';
import { fmt, todayStr } from './helpers.js';

const PROJECT_NAME = 'StepUP';
const FOOTER_TEXT  = 'Developed by Microintel';

/** Amount active on a given SIP date, per the step-up schedule (mirrors calc.js). */
function amountForDate(sipSchedule, dateStr) {
  if (!sipSchedule || !sipSchedule.length) return 0;
  let amount = sipSchedule[0].amount;
  for (const seg of sipSchedule) {
    if (seg.fromDate <= dateStr) amount = seg.amount;
    else break;
  }
  return amount;
}

/**
 * Hand-drawn table with automatic pagination + repeating header row.
 * @returns {number} the Y position after the table.
 */
function drawTable(doc, { startY, margin, pageW, pageH, head, rows, widths, aligns = [], headFill = [30, 41, 59], fontSize = 8.5, rowH = 16, headH = 20, footerLimit = 55 }) {
  const tableW = widths.reduce((a, b) => a + b, 0);
  let y = startY;

  function drawHeader() {
    doc.setFillColor(headFill[0], headFill[1], headFill[2]);
    doc.rect(margin, y, tableW, headH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fontSize);
    doc.setTextColor(255, 255, 255);
    let x = margin;
    head.forEach((h, i) => {
      const align = aligns[i] || 'left';
      const w = widths[i];
      doc.text(String(h), align === 'right' ? x + w - 6 : x + 6, y + headH - 7, { align: align === 'right' ? 'right' : 'left' });
      x += w;
    });
    y += headH;
  }

  drawHeader();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fontSize);

  rows.forEach((row, ri) => {
    if (y + rowH > pageH - footerLimit) {
      doc.addPage();
      y = 50;
      drawHeader();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(fontSize);
    }
    if (ri % 2 === 1) {
      doc.setFillColor(244, 246, 250);
      doc.rect(margin, y, tableW, rowH, 'F');
    }
    let x = margin;
    row.forEach((cell, ci) => {
      const align = aligns[ci] || 'left';
      const w = widths[ci];
      const isObj = cell && typeof cell === 'object';
      const text  = isObj ? cell.text : String(cell);
      const color = isObj && cell.color ? cell.color : [30, 30, 30];
      doc.setTextColor(color[0], color[1], color[2]);
      doc.text(text, align === 'right' ? x + w - 6 : x + 6, y + rowH - 6, { align: align === 'right' ? 'right' : 'left' });
      x += w;
    });
    y += rowH;
  });

  doc.setTextColor(0, 0, 0);
  return y;
}

/**
 * Generate and download a full PDF report for the active SIP.
 * @param {Array}  entries  raw entries for the profile
 * @param {Object} settings settings/config for the profile
 * @param {string} fundName display name of the active profile/fund
 */
export function generatePdfReport(entries, settings, fundName) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert('PDF library failed to load — check your connection and try again.');
    return;
  }
  if (!entries || !entries.length || !settings) {
    alert('No SIP data to report yet.');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc    = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW  = doc.internal.pageSize.getWidth();
  const pageH  = doc.internal.pageSize.getHeight();
  const margin = 40;

  const calc  = recalcAll(entries, settings);
  const last  = calc[calc.length - 1];
  const pnl   = last.portfolioValue - last.investedAmount;
  const ret   = last.investedAmount > 0 ? (pnl / last.investedAmount) * 100 : 0;
  const sipCount = calc.filter(e => e.sipAdded).length;

  const schedule = (settings.sipSchedule && settings.sipSchedule.length)
    ? settings.sipSchedule
    : [{ fromDate: settings.startDate, amount: settings.sipAmount || 0 }];
  const skipped = (settings.skippedSipDates || []).slice().sort();

  /* ── Header: project name + fund name ── */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(20, 20, 20);
  doc.text(PROJECT_NAME, margin, 50);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text('SIP Report', pageW - margin, 50, { align: 'right' });

  doc.setDrawColor(220, 220, 220);
  doc.line(margin, 60, pageW - margin, 60);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(20, 20, 20);
  doc.text(`Fund: ${fundName || 'Untitled SIP'}`, margin, 82);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(`Generated on ${todayStr()}`, margin, 96);

  /* ── Summary ── */
  let y = 118;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text('Summary', margin, y);
  y += 10;

  const summary = [
    ['Total Invested',       fmt(last.investedAmount)],
    ['Current Value',        fmt(last.portfolioValue)],
    ['Profit / Loss',        (pnl >= 0 ? '+' : '') + fmt(pnl)],
    ['Return %',             (ret >= 0 ? '+' : '') + ret.toFixed(2) + '%'],
    ['SIP Instalments Made', String(sipCount)],
    ['Skipped Instalments',  String(skipped.length)],
  ];
  doc.setFontSize(10);
  summary.forEach(([label, value]) => {
    y += 18;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(90, 90, 90);
    doc.text(label, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(20, 20, 20);
    doc.text(value, pageW - margin, y, { align: 'right' });
  });
  y += 26;

  /* ── Step-up schedule ── */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text('Step-Up Schedule', margin, y);
  y += 8;

  y = drawTable(doc, {
    startY: y, margin, pageW, pageH,
    head: ['Effective From', 'Monthly Amount'],
    rows: schedule.map(s => [s.fromDate, fmt(s.amount)]),
    widths: [(pageW - margin * 2) * 0.5, (pageW - margin * 2) * 0.5],
    aligns: ['left', 'right'],
  });
  y += 22;

  /* ── Skipped instalments ── */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text('Skipped SIP Instalments', margin, y);
  y += 8;

  if (skipped.length) {
    y = drawTable(doc, {
      startY: y, margin, pageW, pageH,
      head: ['Date', 'Amount That Was Skipped'],
      rows: skipped.map(d => [d, fmt(amountForDate(schedule, d))]),
      widths: [(pageW - margin * 2) * 0.5, (pageW - margin * 2) * 0.5],
      aligns: ['left', 'right'],
      headFill: [153, 27, 27],
    });
    y += 22;
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text('No instalments skipped.', margin, y + 14);
    y += 34;
  }

  /* ── Daily change history (newest first) ── */
  if (y > pageH - 100) { doc.addPage(); y = 50; }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text('Daily Change History', margin, y);
  y += 8;

  const usableW = pageW - margin * 2;
  const widths  = [usableW * 0.16, usableW * 0.16, usableW * 0.20, usableW * 0.24, usableW * 0.24];

  const rows = [...calc]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(e => {
      const pctText = (e.percentChange >= 0 ? '+' : '') + e.percentChange.toFixed(2) + '%';
      const pctColor = e.percentChange >= 0 ? [22, 163, 74] : [220, 38, 38];
      return [
        e.date,
        { text: pctText, color: pctColor },
        e.sipAdded ? `+${fmt(e.sipTotal)}` : '—',
        fmt(e.investedAmount),
        fmt(e.portfolioValue),
      ];
    });

  drawTable(doc, {
    startY: y, margin, pageW, pageH,
    head: ['Date', 'Daily Change', 'SIP Added', 'Invested', 'Portfolio Value'],
    rows,
    widths,
    aligns: ['left', 'right', 'right', 'right', 'right'],
    fontSize: 8.5,
    rowH: 15,
  });

  /* ── Footer on every page: "Developed by Microintel" ── */
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const h = doc.internal.pageSize.getHeight();
    doc.setDrawColor(230, 230, 230);
    doc.line(margin, h - 40, pageW - margin, h - 40);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(140, 140, 140);
    doc.text(FOOTER_TEXT, margin, h - 25);
    doc.text(`Page ${i} of ${pageCount}`, pageW - margin, h - 25, { align: 'right' });
  }

  const filename = `${PROJECT_NAME}-${(fundName || 'SIP').replace(/\s+/g, '-')}-${todayStr()}.pdf`;
  doc.save(filename);
}
