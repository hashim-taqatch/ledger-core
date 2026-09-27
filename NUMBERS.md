# NUMBERS.md

Two kinds of numbers appear in this codebase: numbers the assignment
*gave* me, and numbers I had to *choose* because the assignment left a gap.
This file is about the second kind — every constant where I exercised
judgment, and why I picked that value instead of some other defensible one.

## Given, not chosen (for completeness)

- **AED 25.00** overdraft fee, **0.04%** daily interest, **2dp AED / 3dp
  BHD** precision. These come straight from the assignment text. I didn't
  pick them and can't defend "why 25 and not 12.50" beyond "that's the
  number in the brief." What I *did* have to decide is how to represent and
  round around them — that's below.

## Constants I chose

### 1. Minor-unit integer representation (`src/money.ts`)

Every amount is stored as an integer count of the currency's smallest unit
— AED in fils (`× 100`), BHD in fils (`× 1000`) — never as a JS `number`
holding a decimal, and never as a `float`/`Decimal.js`-style arbitrary
object.

**Why not store decimals directly (e.g. `1200.00` as a float)?** Binary
floating point cannot represent most decimal fractions exactly (`0.1 + 0.2
!== 0.3`). A ledger that's off by fractions of a fils after enough
arithmetic is a ledger that's wrong. Integer minor units make every
CREDIT/DEBIT/FEE addition exact.

**Why not `BigInt` or a full arbitrary-precision decimal library?** At this
account's scale (a handful of transactions, balances in the hundreds),
plain JS `number` stays comfortably inside `Number.MAX_SAFE_INTEGER`
(2^53). BigInt is the right call once volumes or balances could plausibly
approach that boundary — see the Architecture doc's "append-only at scale"
section for where I'd draw that line in production.

### 2. Rounding rule: round-half-up (`roundHalfUp`)

Interest accrual (`balance × 4 / 10000`) will not always land on an exact
minor unit — e.g. AED 465.00 × 0.04% = 18.6 fils. I round that to 19 fils
(AED 0.19), using standard round-half-up.

**Why not round-half-to-even (banker's rounding)?** Banker's rounding
exists to avoid *statistical* bias when rounding huge volumes of
independent values. A single customer's daily interest line isn't that;
round-half-up is what the customer's statement will show and what they'll
expect when they check the arithmetic by hand — it's the intuitive,
defensible-in-a-live-defense choice, not the actuarially-optimal one.

**Why not truncate (always round down)?** Truncating every accrual down
would systematically favor the bank on every account, every day, forever.
Nothing in the assignment authorizes that, and I'm not going to quietly
introduce a rule that skims fractions of a fils in the bank's favor
without it being an explicit, named policy.

### 3. Instalment / rounding-remainder allocation: largest-remainder,
   remainder assigned to the *last* share (`splitEvenly`)

Used for E10's three BHD instalments (10.000 → 3.333/3.333/3.334) and,
structurally, for why interest capitalization is defined as the sum of the
rounded daily figures rather than an independently-rounded total (see
REJECTED.md, criterion 8).

**Why the last share and not the first?** Functionally arbitrary — every
instalment/day is fungible, so "first absorbs the remainder" would be
equally correct. I picked "last" because it mirrors a common real-world
convention (a final instalment or a final period reconciling drift from
the ones before it), and because it needed to be *some* fixed, documented
rule rather than something implicit. See AMBIGUITIES.md for the same point
from the ambiguity side.

**Why largest-remainder and not, say, giving the whole remainder to a
`ROUNDING` line item instead of folding it into a real instalment?** A
separate rounding line would be an extra ledger entry type with no
business meaning to the customer ("what is this 0.001 BHD line?"), for a
discrepancy that's smaller than the currency's own minor unit. Folding it
into one of the real instalments keeps every posted entry meaningful.

### 4. Overdraft fee scope: AED only

`overdraftFeeMinorFor` returns a fee only for AED; a negative BHD closing
balance produces an explicit unresolved-rule warning instead of a fee
amount.

**Why not charge BHD 25.000 (same number, BHD units) or convert AED 25.00
at some FX rate?** Both are numbers I would have invented. AED 25.000 in
BHD is roughly 20x more punitive than AED 25.00 (BHD ~2.65 to 1 AED) —
picking either without a stated fee schedule is picking a real fee for
real customers out of nowhere. I decided that inventing a number here is
worse than refusing to, and said so loudly (a warning, plus a failing test
— see `test/engine.test.ts`) rather than silently. It never fires in the
given event stream, because ACC-002 never goes negative in this dataset.

### 5. Day-close ordering: group events by their `day` field, ascending

Not a numeric constant, but a fixed rule I had to pick: Day-close and fee
assessment happen strictly in calendar order 1→6, with events grouped by
`day` and, within a day, applied in the order given in the stream. This
matters concretely for E9 (Day 6) vs E10 (Day 5) — see AMBIGUITIES.md.
