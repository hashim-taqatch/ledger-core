import { test } from "node:test";
import assert from "node:assert/strict";
import { EVENT_STREAM, WINDOW_DAYS } from "../src/events.js";
import { replay } from "../src/engine.js";
import { formatMinor } from "../src/money.js";
import type { Account, LedgerEvent } from "../src/types.js";

const ACCOUNTS: Account[] = [
  { id: "ACC-001", currency: "AED" },
  { id: "ACC-002", currency: "BHD" },
];

function run() {
  return replay(EVENT_STREAM, ACCOUNTS, WINDOW_DAYS);
}

// ---- Criterion 1 (CORRECT — verified, not rejected) ----
test("Day 2 closing ledger balance, evaluated at end of Day 5, before any fee, is AED -370.00", () => {
  const { ledgers } = run();
  const acc001 = ledgers.get("ACC-001")!;
  // balanceAsOf(valueDateCutoff=2, asOfPostedDay=5): everything with
  // value_date <= 2 that had been posted by end of Day 5. The Day 5
  // overdraft fee has value_date 5, so it can never appear in this sum —
  // "before any fee" is automatically true here, not an extra filter.
  const balance = acc001.balanceAsOf(2, 5);
  assert.equal(formatMinor(balance, "AED"), "-370.00");
});

// ---- Criterion 2 (WRONG — see REJECTED.md) ----
test("E7's overdraft fee is assessed on Day 5 (the day the negative balance is discovered), not Day 2", () => {
  const { dayReports } = run();
  const day2 = dayReports.find((r) => r.day === 2 && r.accountId === "ACC-001")!;
  const day5 = dayReports.find((r) => r.day === 5 && r.accountId === "ACC-001")!;
  assert.equal(day2.feeAssessedMinor, null, "Day 2 had already closed positive before E7 arrived — no fee then");
  assert.equal(day5.feeAssessedMinor, -2500, "Day 5's own closing balance goes negative once E7 posts");
});

// ---- Criterion 3 (CORRECT) ----
test("Day 4 settlement of Auth-A is accepted (settling below the held amount)", () => {
  const { ledgers } = run();
  const acc001 = ledgers.get("ACC-001")!;
  const settlement = acc001.allEntries().find((e) => e.sourceEventId === "E5");
  assert.ok(settlement, "E5 settlement should be posted to the ledger");
  assert.equal(formatMinor(settlement!.amountMinor, "AED"), "-185.00");
});

// ---- Criterion 4 (CORRECT) ----
test("Settlement referencing an unknown authorization (E6/Auth-Z) is rejected and moves no funds", () => {
  const { ledgers, rejectedActions } = run();
  const acc001 = ledgers.get("ACC-001")!;
  assert.equal(acc001.allEntries().find((e) => e.sourceEventId === "E6"), undefined);
  assert.ok(rejectedActions.some((r) => r.eventId === "E6"));
});

// ---- Criterion 5 (CORRECT, as a general statement about holds) ----
test("A hold reduces available balance but never the ledger balance itself", () => {
  const events: LedgerEvent[] = [
    { id: "X1", day: 1, accountId: "ACC-001", type: "CREDIT", amount: "500.00", valueDate: 1 },
    { id: "X2", day: 1, accountId: "ACC-001", type: "AUTHORIZATION", authId: "Auth-X", amount: "300.00", valueDate: 1 },
  ];
  // windowDays=2: Day 1 (where the hold lives) is not the capitalization
  // day, so a postedDay<=1 snapshot cleanly excludes Day 2's capitalization
  // entry. (With windowDays=1, capitalization would post ON Day 1 too,
  // and no postedDay filter could separate it back out.)
  const { ledgers } = replay(events, ACCOUNTS, 2);
  const acc001 = ledgers.get("ACC-001")!;
  const ledgerBalance = acc001.balanceAsOf(Infinity, 1);
  const availableBalance = ledgerBalance - acc001.activeHoldsTotal();
  assert.equal(ledgerBalance, 50000, "the hold itself never posts a ledger entry");
  assert.equal(availableBalance, 20000, "available balance is reduced by the active hold");
});

test("Auth-B is declined because available balance is already negative when it's requested", () => {
  const { authorizationDecisions } = run();
  const authB = authorizationDecisions.find((a) => a.authId === "Auth-B")!;
  assert.equal(authB.approved, false);
});

// ---- Criterion 6 (WRONG — see REJECTED.md) ----
test("After E9 reverses E7, the Day 5 overdraft fee is NOT undone — append-only ledgers don't retract history", () => {
  const { ledgers, dayReports } = run();
  const acc001 = ledgers.get("ACC-001")!;
  const day5 = dayReports.find((r) => r.day === 5 && r.accountId === "ACC-001")!;
  assert.equal(day5.feeAssessedMinor, -2500, "the fee, once assessed, stays on the ledger");
  assert.ok(
    acc001.allEntries().some((e) => e.type === "FEE" && e.valueDate === 5),
    "the FEE entry itself is still present after E9",
  );
});

// ---- Criterion 7 (WRONG — see REJECTED.md) ----
test("E10's three BHD instalments are 3.333 / 3.333 / 3.334, not all identical", () => {
  const { ledgers } = run();
  const acc002 = ledgers.get("ACC-002")!;
  const instalments = acc002
    .allEntries()
    .filter((e) => e.sourceEventId.startsWith("E10-"))
    .map((e) => formatMinor(e.amountMinor, "BHD"));
  assert.deepEqual(instalments, ["3.333", "3.333", "3.334"]);
});

// ---- Criterion 8 (WRONG — see REJECTED.md) ----
test("Capitalized interest exactly equals the sum of the rounded daily accruals (never a discarded remainder)", () => {
  const { dayReports } = run();
  const acc001Days = dayReports.filter((r) => r.day <= WINDOW_DAYS && r.accountId === "ACC-001");
  const sumOfDailyAccruals = acc001Days.reduce((a, r) => a + r.interestAccrualMinor, 0);
  const capitalization = acc001Days.find((r) => r.day === WINDOW_DAYS)!.capitalizationMinor;
  assert.equal(capitalization, sumOfDailyAccruals);
});

test("Final closing balances match the hand-derived numbers for both accounts", () => {
  const { dayReports } = run();
  const finalAcc001 = dayReports.find((r) => r.day === 6 && r.accountId === "ACC-001")!;
  const finalAcc002 = dayReports.find((r) => r.day === 6 && r.accountId === "ACC-002")!;
  assert.equal(formatMinor(finalAcc001.finalClosingBalanceMinor, "AED"), "440.83");
  assert.equal(formatMinor(finalAcc002.finalClosingBalanceMinor, "BHD"), "10.008");
});

// ---------------------------------------------------------------------
// DELIBERATELY FAILING TEST
//
// The overdraft-fee rule in the assignment gives one number: AED 25.00.
// It never states a fee for BHD. Our engine (src/engine.ts,
// overdraftFeeMinorFor) refuses to invent one — a live-money constant is
// exactly the kind of number NUMBERS.md says we won't guess at — so a
// negative BHD closing balance produces an `unresolvedFeeRuleWarnings`
// entry instead of a fee. That is the right call for THIS assignment, but
// it means the design is genuinely incomplete for a real multi-currency
// ledger: this test encodes the production expectation (every currency has
// a defined overdraft fee) and fails against our own code to keep that gap
// visible instead of quietly papering over it. See AMBIGUITIES.md and the
// Architecture doc's "Authorization lifecycle" / "What you cut" sections.
// ---------------------------------------------------------------------
test("FAILING: a BHD account that closes a day negative should also be assessed an overdraft fee", () => {
  const events: LedgerEvent[] = [
    { id: "X1", day: 1, accountId: "ACC-002", type: "DEBIT", amount: "5.000", valueDate: 1 },
  ];
  const { dayReports, unresolvedFeeRuleWarnings } = replay(events, ACCOUNTS, 1);
  const day1 = dayReports.find((r) => r.day === 1 && r.accountId === "ACC-002")!;

  assert.equal(day1.closingBalanceBeforeFeeMinor, -5000, "BHD account is indeed negative (-5.000)");
  // This is the assertion that fails: no BHD fee schedule exists, so no fee
  // is assessed, and we log a warning instead. A production system cannot
  // ship with an undefined fee for a currency it holds live balances in.
  assert.notEqual(
    day1.feeAssessedMinor,
    null,
    `expected an overdraft fee to be assessed, but got: ${JSON.stringify(unresolvedFeeRuleWarnings)}`,
  );
});
