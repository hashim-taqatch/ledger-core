# ledger-core

An in-memory account ledger core: no web layer, no database, no UI. It
replays a fixed, append-only event stream (`src/events.ts`) through two
accounts — `ACC-001` (AED) and `ACC-002` (BHD) — over a six-day window, and
prints, per day, the closing ledger balance, fee assessments, authorization
states, and errors.

## Running it

```bash
npm install
npm run replay   # runs the event stream and prints the day-by-day report
npm test         # runs the annotated test suite (node's built-in test runner)
```

Both commands run directly against the TypeScript source via `tsx` — there
is no build step. `npx tsc --noEmit` type-checks the project if you want
that separately.

## Reading the output

`npm run replay` prints one block per day. Each account's block shows:

- **closing balance (before fee)** — sum of every ledger entry whose
  `value_date` is on or before that day, using whatever has been posted to
  the ledger so far. This is a genuine "as of today" figure: a later,
  backdated entry (like E7) can change what this number would have been,
  without ever rewriting the entry that was booked for that day at the
  time.
- **overdraft fee assessed** — printed only on a day a fee actually posts.
- **closing balance (after fee)** — the same sum, now including that day's
  fee entry if one was assessed.
- **interest accrued today** — 0.04% of the after-fee closing balance,
  rounded to the account's own precision, only when that balance is
  positive. This is a disclosure figure; it is not booked to the ledger
  until capitalization.
- On Day 6 only: **interest capitalized** (the sum of the six daily accrual
  figures, booked as a single credit) and the **FINAL closing balance**.

Below the per-account blocks, `Authorizations` lists every hold
requested that day with the outcome, and `Errors` lists anything rejected
(an unknown authorization referenced by a settlement, an unknown account,
etc.).

## Project layout

```
src/
  money.ts     integer minor-unit money math (no floats), instalment splitting
  types.ts     Account, LedgerEntry, Hold, and the LedgerEvent union
  events.ts    the fixed E1-E10 event stream
  ledger.ts    AccountLedger: append-only entries + hold table per account
  engine.ts    day-by-day replay: fee assessment, interest, capitalization
  report.ts    console report printer
  index.ts     entry point (npm run replay)
test/
  engine.test.ts   one test per acceptance criterion + one annotated failing test
```

## Companion documents

- [`NUMBERS.md`](NUMBERS.md) — every constant, and why that value.
- [`AMBIGUITIES.md`](AMBIGUITIES.md) — every ambiguity found, and how it was resolved.
- [`REJECTED.md`](REJECTED.md) — which acceptance criteria were refused, and why; approaches abandoned mid-build.
- [`WORKLOG.md`](WORKLOG.md) — timestamped build log.
- [`architecture-and-tradeoffs.pdf`](architecture-and-tradeoffs.pdf) — the separate Architecture & Trade-offs document (source: `architecture-source.md`, built via `python3 scripts/build_pdf.py`).
