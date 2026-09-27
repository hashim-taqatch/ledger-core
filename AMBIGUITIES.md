# AMBIGUITIES.md

Every place the assignment left more than one defensible reading, what I
chose, and why. Where a choice affects a specific acceptance criterion,
I've cross-referenced REJECTED.md.

## 1. E9 (Day 6) is listed before E10 (Day 5) in the event stream

The stream says "replayed in this order" (E1..E10), but E9's `day` is 6 and
E10's `day` is 5 — if I obeyed literal array position, Day 5 would "close"
for ACC-002 *after* Day 6 had already closed for ACC-001.

**Resolution:** day-close is a per-calendar-day batch step across the
whole ledger, not a side-effect of array position. I group events by their
`day` field, process day-groups 1→6 in ascending order, and preserve
original stream order *within* a day. E10 is therefore applied during Day
5's processing, before Day 6 ever closes — which is also the only reading
under which "print, per day" for six sequential days even makes sense.
`day` is *when it happened*; its position in the printed list is just
where the assignment chose to write it down (ACC-002's events are grouped
at the end for readability). See `src/engine.ts`, the `byDay` grouping.

## 2. Is "Day N's closing balance" a fixed historical fact, or a re-runnable query?

E7 is booked on Day 5 with `value_date` Day 2. That changes what "Day 2's
balance" sums to — but Day 2 already closed, days ago, before E7 existed.

**Resolution:** both exist, and they answer different questions.

- The **fee-assessment decision** for Day 2 is a historical fact: it ran
  once, at the actual end of Day 2, saw balance +250.00, decided "no fee,"
  and that decision is never revisited. Append-only means I don't get to
  go back and re-decide Day 2 just because new information arrived later.
- A **point-in-time balance query** ("what does Day 2 look like, as known
  at the end of Day 5?") is answerable at any time, and *should* change as
  more entries arrive — that's what criterion 1 is actually asking for.

`AccountLedger.balanceAsOf(valueDateCutoff, asOfPostedDay)` takes both
axes as separate parameters for exactly this reason — see the Architecture
doc's note on value-dated reporting.

## 3. When is an overdraft fee "assessed" — the value date it applies to, or the day it's discovered?

E7 (vd Day 2) doesn't make Day 2 negative *at the time* — Day 2 already
closed positive. It makes **Day 5** (the day E7 actually posts) negative,
because Day 5's closing balance sums every entry with `value_date <= 5`
that exists by then, and E7 qualifies.

**Resolution:** the fee is assessed on Day 5 — the day the negative
balance is actually discovered — and booked with `value_date` = Day 5,
per the rule's own words ("booked with value_date equal to the day
assessed"). It is not retroactively assessed against Day 2. This directly
contradicts acceptance criterion 2; see REJECTED.md.

## 4. Does reversing a transaction reverse the fee it caused?

E9 reverses E7. E7 is what drove Day 5 negative and triggered the AED
25.00 fee. Does undoing E7 undo the fee?

**Resolution:** no. The fee is its own immutable ledger entry, posted
because Day 5's closing balance *was* negative at the moment Day 5 closed
— a true historical fact that E9 cannot retroactively make untrue. E9
adds an offsetting +620.00 entry; it does not delete or reverse the FEE
entry. This directly contradicts acceptance criterion 6; see REJECTED.md.

## 5. What does an authorization check its hold against — value-dated balance, or real-time balance?

**Resolution:** real-time (`currentTotal()` — every posted entry
regardless of value date) minus active holds. An authorization is about
cash actually available *right now*; gating it on a value-dated,
backdatable figure would let a customer's card get approved or declined
based on entries that haven't even landed yet in real time. This is the
figure that makes Auth-B decline (see #6 below).

## 6. Is Auth-B approved-but-abandoned, or declined outright?

The assignment states "Auth-B is never settled inside the window" without
saying whether it was approved. That phrasing is consistent with either
reading.

**Resolution:** mechanically declined. By the time E8 is processed (Day
5, after E7), the account's real-time balance is already -155.00 with no
active offsetting holds, so available balance is already negative before
Auth-B's 90.00 is even added. The approval rule ("approved only if
available balance ≥ 0 after the hold") is unambiguous once you accept #5
above — I didn't add a special case to make Auth-B succeed just because
the prose is compatible with that reading.

## 7. Can a settlement amount exceed its authorization's hold amount?

Not exercised in this dataset (E5 settles 185.00 against a 200.00 hold —
under, not over). Real card settlement (tips, fuel, currency conversion)
routinely settles for more than the estimated hold.

**Resolution:** I don't cap it. A settlement books whatever amount the
settlement event states, against the ledger, once its authId resolves to
an ACTIVE hold. This is a real production risk I'm naming, not solving —
see the Architecture doc's "what you cut" section: a production ledger
would need a policy for over-settlement (partial re-authorization,
referral to risk review, a hard cap) that this exercise doesn't specify
and I'm not going to invent unprompted.

## 8. Can one authorization be settled more than once (partial settlements)?

Not exercised here. Real authorizations sometimes settle in multiple
partial captures.

**Resolution:** out of scope by design — a hold is ACTIVE, then exactly
one settlement moves it to SETTLED forever; any further settlement
against that authId is rejected the same way an unknown authId is. Listed
explicitly as a cut corner in REJECTED.md and the Architecture doc.

## 9. Is interest for a given day computed before or after that day's own overdraft fee posts?

Both are "same-day" by value date once the fee is booked.

**Resolution:** after. The fee is part of the day's true closing state
once assessed (it has `value_date` = that day), so interest — which is
defined on "the closing ledger balance" — is computed on the post-fee
figure. On Day 5, this doesn't change the sign anyway (balance is negative
before and after the fee), but the ordering is a deliberate choice, not an
accident of code structure.

## 10. Interest on a zero balance

ACC-002 sits at exactly 0.000 for Days 1-4 (no entries at all until E10 on
Day 5). "Positive balances only" — zero is not positive.

**Resolution:** no accrual on those days (0.000, not booked). Trivial, but
stated explicitly because "positive" vs "non-negative" is exactly the kind
of one-word ambiguity that's cheap to get wrong.

## 11. Splitting "three equal instalments" of an amount not divisible by three

10.000 BHD / 3 has no exact 3-decimal-place equal split.

**Resolution:** largest-remainder allocation, remainder assigned to the
last instalment (3.333 / 3.333 / 3.334) — see NUMBERS.md #3 for why last
rather than first. This directly contradicts acceptance criterion 7's
claim that all three should be 3.334; see REJECTED.md.

## 12. "Once per day per account" for the overdraft fee — keyed on which day?

A backdated entry could, in principle, make several different past value
dates newly negative on the same processing day. Does that risk multiple
fees firing on one calendar day?

**Resolution:** the "once per day" guard (`hasFeeBeenAssessed`) is keyed
on the real calendar day being closed, not on any value date. A single
calendar day can only ever produce one fee per account, however many
backdated entries land in it — which is also just a direct reading of "once
per day per account."
