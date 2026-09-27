# REJECTED.md

## Acceptance criteria refused

Of the eight criteria, four are correct and four are wrong. The four
correct ones (1, 3, 4, 5) are each backed by a passing test in
`test/engine.test.ts`. The four below are refused, with the reasoning and
the passing test that proves the refusal against this implementation.

### Criterion 2 — "E7 causes exactly one overdraft fee assessed, on Day 2." — REJECTED

**Claim:** wrong day. E7 does cause exactly one overdraft fee — but it is
assessed and value-dated on **Day 5**, not Day 2.

**Why:** Day 2 already closed, at the actual end of Day 2, with a balance
of +250.00 and a "no fee" decision. That decision is a historical fact in
an append-only ledger; it is never reopened. E7 arrives on Day 5 carrying
a `value_date` of Day 2, which means it counts toward *Day 5's own*
closing balance (every entry with value_date ≤ 5, as of Day 5) — and Day
5's closing balance is what goes negative (465.00 − 620.00 = −155.00). The
rule is explicit that a fee is "booked with value_date equal to the day
assessed" — the day it's assessed is Day 5, so that's its value_date too.
Accepting this criterion as written would mean mutating or reopening Day
2's already-closed, already-immutable state, which the non-negotiable
append-only rule forbids outright.

**Test:** `test/engine.test.ts` — *"E7's overdraft fee is assessed on Day
5 ..., not Day 2"*.

### Criterion 6 — "After E9, all balances and fees return to their pre-E7 values." — REJECTED

**Claim:** false. E9 reverses E7's amount; it does not, and cannot, undo
the Day 5 overdraft fee that E7 caused.

**Why:** the fee is its own append-only ledger entry, posted because Day
5's closing balance genuinely was negative at the moment Day 5 closed.
That is a true historical fact about what the ledger looked like at that
time, and E9 — arriving a full day later — cannot retroactively make it
false any more than it could delete E7 itself. E9 adds a new offsetting
entry (+620.00, value_date Day 2); the FEE entry from Day 5 stays on the
ledger, and every day-report from Day 5 onward continues to show it. If
this criterion were correct, "append-only, no entry ever mutated or
deleted" would have to be false too — the two can't both hold.

**Test:** `test/engine.test.ts` — *"After E9 reverses E7, the Day 5
overdraft fee is NOT undone ..."*.

### Criterion 7 — "The three BHD instalments in E10 must each be BHD 3.334." — REJECTED

**Claim:** arithmetically impossible. 3 × 3.334 = 10.002, not 10.000.

**Why:** BHD's precision is 3 decimal places, and 10.000 ÷ 3 = 3.3333...,
which has no exact 3-decimal-place representation. Three *identical*
instalments summing to exactly 10.000 do not exist at this precision —
full stop, regardless of implementation choice. Something has to absorb
one extra thousandth of a BHD, which means at least one instalment must
differ from the other two. I resolved that "something" as the last
instalment (3.333 / 3.333 / 3.334) via largest-remainder allocation — see
NUMBERS.md #3 and AMBIGUITIES.md #11 for why last-not-first, which is a
judgment call; but no judgment call produces three equal instalments here.

**Test:** `test/engine.test.ts` — *"E10's three BHD instalments are 3.333
/ 3.333 / 3.334, not all identical"*.

### Criterion 8 — "If the rounded daily interest accruals do not sum to the capitalized total, the remainder is discarded." — REJECTED

**Claim:** describes a scenario the assignment's own rules already
forbid, and prescribes the wrong fix for it anyway.

**Why:** the non-negotiable rule states "the rounded daily accruals must
sum exactly to the capitalized total." The only implementation that
*guarantees* that with certainty — rather than merely hoping the rounding
works out — is to define the capitalized total **as** the sum of the
already-rounded daily figures, rather than computing interest for the
whole period independently and rounding once at the end. Under that
design, by construction, there is never a remainder to discard: the sum of
six rounded numbers *is* their sum, exactly, every time. This criterion
imagines a broken alternative design (round the six-day total
independently, notice it doesn't match the sum of the dailies, then throw
away the difference) and asks how to patch it. The fix isn't a remainder
policy — silently discarding fractions of a customer's accrued interest
is also, separately, not something I'd ship without that being an
explicit, named, disclosed policy — the fix is to not build the broken
version in the first place.

**Test:** `test/engine.test.ts` — *"Capitalized interest exactly equals
the sum of the rounded daily accruals (never a discarded remainder)"*.

## Approaches abandoned mid-build

- **Retroactive fee reassessment.** My first sketch had backdated entries
  re-run fee assessment for whatever day they were value-dated to (so E7
  would have reopened Day 2). I abandoned this once I traced the
  consequence: it means a single backdated entry can rewrite fee history
  for every day between its value_date and today, which contradicts
  "append-only, no entry ever mutated" and has no natural stopping point
  (what if the backdated entry itself gets reversed — do you re-reopen
  again?). I replaced it with "fees are assessed once, using the state
  known at the real time of assessment" — see AMBIGUITIES.md #3.

- **Holds as negative ledger entries.** I initially considered booking an
  authorization hold as a suspended/pending debit directly in the entries
  list (flagged `PENDING`) so "available balance" could just be "sum of
  non-pending entries." I dropped this because it blurs exactly the line
  criterion 5 is testing — a hold must reduce *available* balance without
  ever touching *ledger* balance — and a shared entries list makes that
  distinction one conditional filter away from silently breaking. Holds
  now live in a separate table (`AccountLedger`'s `holds` map) that never
  touches `entries` unless and until a real SETTLEMENT posts.

- **Floating-point money.** The very first draft used plain decimal
  strings parsed to JS numbers for arithmetic. I abandoned this before
  writing any business logic, once I confirmed compounding interest over
  six days would eventually surface binary floating-point drift. Rewrote
  on integer minor units first — see NUMBERS.md #1.

- **Literal array-order day-close.** I initially drove day-close directly
  off iterating E1→E10 in listed order and closing a day whenever the
  `day` field ticked over. This breaks on E9 (Day 6) → E10 (Day 5): by the
  time E10 arrives, Day 6 has already "closed" for ACC-001, and closing
  Day 5 for ACC-002 afterward is incoherent for what's supposed to be a
  single per-calendar-day batch step. Replaced with grouping by `day`
  ascending — see AMBIGUITIES.md #1.
