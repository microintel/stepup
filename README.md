# StepUP

![StepUP](https://raw.githubusercontent.com/microintel/endgram/main/photo/steupfront.png)

**Live demo:** [microintel.github.io/stepup](https://microintel.github.io/stepup)

A lightweight, offline-first web app for tracking SIP (Systematic Investment Plan) investments — built to give a clear, honest picture of how your money is actually growing, without needing a broker's app, a spreadsheet, or an internet connection.

## Why we built this

Most investment apps either bury growth data behind logins and ads, or require constant internet access to show numbers that could just as easily be calculated on-device. StepUP was built to solve a few specific frustrations:

- **No easy way to see real day-to-day / month-to-month performance.** Broker apps usually show total returns, not how a specific SIP is trending over custom periods.
- **No offline access.** Checking your portfolio shouldn't depend on a live connection.
- **No multi-SIP comparison in one place.** If you run more than one SIP (e.g. different funds or goals), most tools force you to check each one separately.
- **No exportable proof/history.** Wanting a clean PDF summary of an SIP's history for personal records or sharing usually means manually building one.

StepUP addresses this by running entirely in the browser, storing data locally (IndexedDB), and computing all growth/loss metrics — daily, monthly, yearly, and best/worst performing periods — directly from the entries you input.

## What it does

- Tracks one or more SIP profiles, each with its own entries and settings
- Calculates day-wise % change, win streaks, average daily change
- Calculates monthly and yearly growth/loss (absolute ₹ and %)
- Surfaces your single best and worst performing months by % — so you instantly know your biggest gain and biggest drawdown
- Visualizes trends with line and donut charts
- Tracks upcoming SIP dates and lets you log/skip entries
- Generates a downloadable PDF report of your investment history
- Works fully offline once loaded — no server, no account, no data leaving your device

## Who can use it

- **Individual retail investors** running one or more SIPs who want a fast, private, ad-free way to track performance
- **Anyone tracking recurring investments** (mutual funds, stocks, gold, crypto SIPs, etc.) who just needs a date + amount + value log
- **People who value data privacy** — since everything is stored locally on your own device, not on a server
- **Personal finance enthusiasts** who want raw growth/loss numbers (not just broker-provided summaries) to make their own decisions

StepUP is a personal tracking tool, not financial advice — it doesn't recommend investments or predict future returns. It simply gives you an honest, calculated view of what your own numbers show.

## Tech notes

- Vanilla JS (no framework), IndexedDB for storage, Chart rendering via `charts.js`
- All calculations happen client-side in `calc.js` / `render.js`
- PDF generation handled in `pdf-report.js`
