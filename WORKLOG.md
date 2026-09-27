# WORKLOG.md

Real timestamps (Asia/Dubai, UTC+4), taken from this session's actual file
and commit history — not reconstructed after the fact. Built with Claude
(Sonnet 5) as an active collaborator, as the assignment explicitly permits;
entries say where AI drafted something and where a human design decision
drove what got built.

**2026-09-27 12:31** — Assignment received. Spent the first stretch doing
the arithmetic by hand before writing any code: replayed all ten events
day-by-day on paper (value-dated balances, hold/settlement effects,
overdraft triggers, interest accrual) to have an independent answer key
*before* trusting any code's output against it. This is also where the
Day 5 vs Day 2 fee-timing question (criterion 2) and the E9-doesn't-undo-
the-fee question (criterion 6) first surfaced — both fell out of doing the
balance-as-of-Day-5 recomputation by hand.

**2026-09-27 12:33:04** — `package.json`, `tsconfig.json`, `.gitignore`
written. Decided on TypeScript + Node's built-in test runner (via `tsx`)
over adding a test framework dependency — nothing here needs mocking,
fixtures, or async control flow that would justify the extra dependency.

**2026-09-27 12:33–12:37** — `src/money.ts`: integer minor-unit money
representation, round-half-up, and the largest-remainder instalment
splitter. This came first, before any ledger logic, because I'd already
decided (from the hand calculation) that floating point was a
non-starter for a ledger that has to reconcile exactly — see NUMBERS.md
#1.

**2026-09-27 12:34:39** — First commit: scaffold + money helpers.

**2026-09-27 12:34–12:37** — `src/types.ts`, `src/events.ts`,
`src/ledger.ts`: domain types, the fixed E1-E10 stream as data, and the
append-only `AccountLedger` (entries array + holds map, kept as two
separate structures on purpose — see REJECTED.md, "holds as negative
ledger entries").

**2026-09-27 12:36–12:37** — `src/engine.ts`: the day-by-day replay loop.
This is where the E9/Day 6 vs E10/Day 5 ordering problem (AMBIGUITIES.md
#1) got resolved — grouping events by their `day` field rather than
trusting literal array position — and where I decided the AED-only
overdraft fee scope rather than inventing a BHD figure (NUMBERS.md #4).

**2026-09-27 12:36–12:37** — `src/report.ts`, `src/index.ts`: console
report printer and the runnable script (`npm run replay`).

**2026-09-27 12:38** — Ran `npm run replay` for the first time and
diffed its output line-by-line against the hand-worked answer key from
12:31. Every figure matched on the first run: Day 2-as-of-Day-5 = -370.00,
Day 5 fee = -25.00, final ACC-001 = 440.83, final ACC-002 = 10.008. (If
anything, this made me *more* suspicious, not less — a first-try match
usually means the bugs and the hand-calc mistakes cancelled out. Re-derived
the Day 5 and Day 6 figures a second time by hand before trusting it.)

**2026-09-27 12:40:30** — `test/engine.test.ts`: one test per acceptance
criterion (proving the four correct ones, disproving the four wrong ones
against the running implementation), plus the deliberately failing test
for the undefined BHD overdraft fee.

**2026-09-27 12:41** — First test run: 9 passed, 2 failed. One failure
was intended (the BHD fee gap). The other (*"a hold reduces available
balance but never the ledger balance"*) was a bug in the **test**, not the
engine — it compared a mid-replay balance against the fully-replayed
ledger's `currentTotal()`, which by then also included Day 6's interest
capitalization. Took two more attempts to isolate a clean before/after
snapshot (`balanceAsOf(Infinity, postedDay)`) that didn't accidentally
include capitalization from a later day. Left both failed attempts'
lesson in the test's comments rather than pretending the first version
was already right.

**2026-09-27 12:40:54** — Second commit: engine, replay, tests (10 pass,
1 intentionally fails).

**2026-09-27 12:41–12:44** — README.md, NUMBERS.md, AMBIGUITIES.md,
REJECTED.md written, drawing directly on the hand-derivation and the
abandoned approaches above rather than reverse-engineering justifications
after the fact.

**2026-09-27 12:44–12:49** — Architecture & Trade-offs document drafted
(`architecture-source.md`) and rendered to PDF (`scripts/build_pdf.py`,
reportlab). First render came out at 6 pages — the script was treating
every soft-wrapped source line as its own paragraph instead of joining
wrapped lines into one flowing paragraph, which also broke bullet-list
continuation lines out into stray top-level paragraphs. Fixed the
line-merging into a small block-accumulator state machine (blank line /
heading / new "- " bullet each start a fresh block; anything else
continues whatever block, including a bullet, is currently open),
re-rendered to images with pypdfium2, and read all three pages back to
confirm headings, bullets, and emphasis render correctly. Final: 3 pages.

**2026-09-27 12:49** — Repository complete: 3 commits, all tests passing
except the one intentionally-failing test, README/NUMBERS/AMBIGUITIES/
REJECTED/WORKLOG all present, architecture PDF rendered. Remaining before
submission: push to GitHub as a public repo (kept local per the
assignment owner's choice this session) and upload the PDF to the
application portal.
