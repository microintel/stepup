# StepUP — SIP Tracker

## File Structure

```
sip-tracker/
├── index.html   — HTML shell (markup only, no inline CSS/JS)
├── style.css    — All styles (variables, themes, components)
├── db.js        — IndexedDB open + CRUD helpers
├── helpers.js   — Formatting (fmt, fmtK, fmtPct), toast, todayStr
├── calc.js      — SIP count logic + recalcAll + saveCalcEntries
├── charts.js    — Chart.js line chart, overview navigator, range/zoom, drag
├── render.js    — Dashboard cards, history table, user page rendering
└── app.js       — Navigation, settings, entry CRUD, export/import, boot
```

## ⚠️ Local Development Note

Because the JS files use ES modules (`import`/`export`), the browser enforces
CORS — opening `index.html` directly as a `file://` URL will not work.

Run a local server instead:

```bash
# Python
python3 -m http.server 8080

# Node (npx)
npx serve .

# VS Code
# Use the "Live Server" extension
```

Then open http://localhost:8080 in your browser.
