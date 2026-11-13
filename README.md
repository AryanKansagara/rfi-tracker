# Ball in Court

RFI and submittal log intelligence for construction project managers and project engineers.

**Live:** https://rfi-tracker-ebon.vercel.app

## The pain
The RFI log tells you what is open. It does not tell you who has been sitting on it, whether that is past the review period in the contract, or which submittal is about to push the curtain wall install. PMs rebuild that picture in spreadsheets every week before the OAC meeting.

## What it does
- **Import** Autodesk Build (ACC) and Procore RFI and submittal logs (CSV/XLSX), a generic CSV, optional status history, a schedule (P6 `.xer` read natively, MS Project or generic) and a spec-section list. Format detection, column mapping and a validation report with line numbers.
- **Ball-in-court accounting** in working days (holiday calendar) per party: architect, engineers, owner, subs, GC. Uses status history when you have it, the log's dates when you don't.
- **Overdue vs contract review periods**, editable per party; exported due dates take precedence.
- **Submit-by dates and float**: required on site minus lead time minus review cycles, linked to schedule activities; items threatening the critical path.
- **Reviewer scorecards** (median turnaround, % late), resubmittal loops, cost/schedule impact rollup, open-item burn-down forecast.
- **Actions**: printable weekly OAC report, per-party reminder emails, submittal register (CSV/XLSX), delay-notice evidence log (CSV).
- **History**: weekly snapshots with a compare view (new, closed, moved, stuck, newly overdue, float lost).
- Local-first workspace (IndexedDB), optional email/password sign-in to sync across devices.
- Day-first dates (UK/CA/AU exports) and Windows-1252 files are detected; public holidays per country/region from the free Nager.Date API.
- Two synthetic sample projects, labelled as such.

## Test fixtures
`src/engine/fixtures/` holds small files in the real export layouts: a P6 XER (TASK field list as P6 22.12 writes it, with a baseline project, LOE/WBS rows and a 10-hour calendar), a Procore RFIs CSV in Procore's documented column order, an Autodesk Build RFI export from a day-first locale with its title block, and an excerpt of a Nager.Date response (date.nager.at, fetched 2026-11-13). Values are invented except the holiday dates.

## Known gaps
- MS Project `.mpp`/XML is not read; save as CSV.
- Autodesk does not publish its export column names; matching is by name with a manual mapping step.

## Run locally
```
npm install
npm run dev      # http://localhost:4364
npm test         # engine tests
npm run build
```
Optional sync: copy `.env.example` to `.env` with a Supabase URL and publishable key.

Built by Aryan Kansagara. Independent project, not affiliated with Autodesk.
