import { AccountLedger } from "./ledger.js";
import { roundHalfUp, splitEvenly, toMinor } from "./money.js";
import type {
  Account,
  AccountId,
  AuthorizationDecision,
  Hold,
  LedgerEntry,
  LedgerEvent,
  RejectedAction,
} from "./types.js";

export const OVERDRAFT_FEE_MINOR_AED = 2500; // AED 25.00 — see NUMBERS.md
export const DAILY_INTEREST_BPS_NUMERATOR = 4; // 0.04% == 4 / 10_000
export const DAILY_INTEREST_BPS_DENOMINATOR = 10_000;

export interface DayAccountReport {
  day: number;
  accountId: AccountId;
  currency: string;
  closingBalanceBeforeFeeMinor: number;
  feeAssessedMinor: number | null;
  closingBalanceAfterFeeMinor: number;
  interestAccrualMinor: number;
  capitalizationMinor: number | null; // only set on the final day (Day 6)
  finalClosingBalanceMinor: number;
}

export interface ReplayResult {
  ledgers: Map<AccountId, AccountLedger>;
  dayReports: DayAccountReport[];
  authorizationDecisions: AuthorizationDecision[];
  rejectedActions: RejectedAction[];
  unresolvedFeeRuleWarnings: RejectedAction[];
}

// The overdraft fee schedule is only defined for AED (AED 25.00). Nothing in
// the assignment states a BHD fee amount, and we refuse to invent one for a
// figure that moves real money — see NUMBERS.md and the failing test in
// test/engine.test.ts. If a non-AED account ever closes a day negative, we
// surface that as an unresolved-rule warning instead of silently charging
// AED 25.00-worth of BHD or charging nothing.
function overdraftFeeMinorFor(currency: string): number | "UNRESOLVED" {
  if (currency === "AED") return OVERDRAFT_FEE_MINOR_AED;
  return "UNRESOLVED";
}

export function buildLedgers(accounts: Account[]): Map<AccountId, AccountLedger> {
  const map = new Map<AccountId, AccountLedger>();
  for (const account of accounts) {
    map.set(account.id, new AccountLedger(account));
  }
  return map;
}

export function replay(events: LedgerEvent[], accounts: Account[], windowDays: number): ReplayResult {
  const ledgers = buildLedgers(accounts);
  const authorizationDecisions: AuthorizationDecision[] = [];
  const rejectedActions: RejectedAction[] = [];
  const unresolvedFeeRuleWarnings: RejectedAction[] = [];
  const dayReports: DayAccountReport[] = [];
  const dailyAccrualsMinor = new Map<AccountId, Map<number, number>>();
  for (const account of accounts) dailyAccrualsMinor.set(account.id, new Map());

  // Group by the `day` field (ascending), preserving original stream order
  // within a day. E9 (Day 6) is listed before E10 (Day 5) in the raw stream
  // because the assignment lists ACC-002's events last; day-close is a
  // per-calendar-day batch step, so we process by day number, not literal
  // array position. See AMBIGUITIES.md.
  const byDay = new Map<number, LedgerEvent[]>();
  for (const event of events) {
    const bucket = byDay.get(event.day) ?? [];
    bucket.push(event);
    byDay.set(event.day, bucket);
  }

  for (let day = 1; day <= windowDays; day++) {
    const todaysEvents = byDay.get(day) ?? [];
    for (const event of todaysEvents) {
      applyEvent(event, ledgers, authorizationDecisions, rejectedActions);
    }

    for (const account of accounts) {
      const ledger = ledgers.get(account.id)!;
      const closingBalanceBeforeFeeMinor = ledger.balanceAsOf(day);

      let feeAssessedMinor: number | null = null;
      if (closingBalanceBeforeFeeMinor < 0 && !ledger.hasFeeBeenAssessed(day)) {
        const fee = overdraftFeeMinorFor(account.currency);
        if (fee === "UNRESOLVED") {
          unresolvedFeeRuleWarnings.push({
            day,
            accountId: account.id,
            eventId: "(day-close)",
            reason: `Closing balance is negative but no overdraft fee is defined for ${account.currency}`,
          });
        } else {
          ledger.post({
            sourceEventId: `FEE-${account.id}-D${day}`,
            accountId: account.id,
            type: "FEE",
            amountMinor: -fee,
            postedDay: day,
            valueDate: day,
          });
          ledger.markFeeAssessed(day);
          feeAssessedMinor = -fee;
        }
      }

      const closingBalanceAfterFeeMinor = ledger.balanceAsOf(day);

      const interestAccrualMinor =
        closingBalanceAfterFeeMinor > 0
          ? roundHalfUp(
              (closingBalanceAfterFeeMinor * DAILY_INTEREST_BPS_NUMERATOR) /
                DAILY_INTEREST_BPS_DENOMINATOR,
            )
          : 0;
      dailyAccrualsMinor.get(account.id)!.set(day, interestAccrualMinor);

      let capitalizationMinor: number | null = null;
      let finalClosingBalanceMinor = closingBalanceAfterFeeMinor;

      if (day === windowDays) {
        // Capitalization = the SUM of the already-rounded daily accruals,
        // never an independently-rounded total. That is the only way the
        // non-negotiable "must sum exactly" rule can hold with certainty —
        // see REJECTED.md on the discarded-remainder criterion.
        const total = Array.from(dailyAccrualsMinor.get(account.id)!.values()).reduce(
          (a, b) => a + b,
          0,
        );
        if (total > 0) {
          ledger.post({
            sourceEventId: `INTEREST-CAP-${account.id}`,
            accountId: account.id,
            type: "INTEREST_CAPITALIZATION",
            amountMinor: total,
            postedDay: day,
            valueDate: day,
          });
        }
        capitalizationMinor = total;
        finalClosingBalanceMinor = ledger.balanceAsOf(day);
      }

      dayReports.push({
        day,
        accountId: account.id,
        currency: account.currency,
        closingBalanceBeforeFeeMinor,
        feeAssessedMinor,
        closingBalanceAfterFeeMinor,
        interestAccrualMinor,
        capitalizationMinor,
        finalClosingBalanceMinor,
      });
    }
  }

  return { ledgers, dayReports, authorizationDecisions, rejectedActions, unresolvedFeeRuleWarnings };
}

function applyEvent(
  event: LedgerEvent,
  ledgers: Map<AccountId, AccountLedger>,
  authorizationDecisions: AuthorizationDecision[],
  rejectedActions: RejectedAction[],
): void {
  const ledger = ledgers.get(event.accountId);
  if (!ledger) {
    rejectedActions.push({
      day: event.day,
      accountId: event.accountId,
      eventId: event.id,
      reason: `Unknown account ${event.accountId}`,
    });
    return;
  }

  switch (event.type) {
    case "CREDIT": {
      ledger.post({
        sourceEventId: event.id,
        accountId: event.accountId,
        type: "CREDIT",
        amountMinor: toMinor(event.amount, ledger.currency),
        postedDay: event.day,
        valueDate: event.valueDate,
      });
      return;
    }

    case "DEBIT": {
      // Debits are simply booked. Only authorizations are gated on
      // available balance — a booked debit can drive the ledger negative
      // (that's what triggers the overdraft fee), it is never rejected.
      ledger.post({
        sourceEventId: event.id,
        accountId: event.accountId,
        type: "DEBIT",
        amountMinor: -toMinor(event.amount, ledger.currency),
        postedDay: event.day,
        valueDate: event.valueDate,
      });
      return;
    }

    case "AUTHORIZATION": {
      const amountMinor = toMinor(event.amount, ledger.currency);
      const availableBefore = ledger.availableBalance();
      const approved = availableBefore - amountMinor >= 0;
      const hold: Hold = {
        authId: event.authId,
        accountId: event.accountId,
        amountMinor,
        status: approved ? "ACTIVE" : "DECLINED",
        createdDay: event.day,
      };
      ledger.placeHold(hold);
      authorizationDecisions.push({
        day: event.day,
        accountId: event.accountId,
        authId: event.authId,
        requestedAmountMinor: amountMinor,
        availableBalanceBeforeMinor: availableBefore,
        approved,
      });
      return;
    }

    case "SETTLEMENT": {
      const hold = ledger.getHold(event.authId);
      if (!hold || hold.status !== "ACTIVE") {
        rejectedActions.push({
          day: event.day,
          accountId: event.accountId,
          eventId: event.id,
          reason: hold
            ? `Authorization ${event.authId} is ${hold.status}, not ACTIVE — settlement rejected`
            : `No authorization ${event.authId} found on this account — settlement rejected, funds not moved`,
        });
        return;
      }
      const settledAmountMinor = toMinor(event.amount, ledger.currency);
      ledger.post({
        sourceEventId: event.id,
        accountId: event.accountId,
        type: "SETTLEMENT",
        amountMinor: -settledAmountMinor,
        postedDay: event.day,
        valueDate: event.valueDate,
        refEventId: event.authId,
      });
      hold.status = "SETTLED";
      hold.settledAmountMinor = settledAmountMinor;
      return;
    }

    case "REVERSAL": {
      const target = ledger.findEntry(event.targetEventId);
      if (!target) {
        rejectedActions.push({
          day: event.day,
          accountId: event.accountId,
          eventId: event.id,
          reason: `No ledger entry ${event.targetEventId} found to reverse`,
        });
        return;
      }
      ledger.post({
        sourceEventId: event.id,
        accountId: event.accountId,
        type: "REVERSAL",
        amountMinor: -target.amountMinor,
        postedDay: event.day,
        valueDate: event.valueDate,
        refEventId: target.sourceEventId,
      });
      return;
    }

    case "INSTALMENT_CREDIT": {
      const totalMinor = toMinor(event.amount, ledger.currency);
      const parts = splitEvenly(totalMinor, event.instalments);
      parts.forEach((part, index) => {
        ledger.post({
          sourceEventId: `${event.id}-${index + 1}`,
          accountId: event.accountId,
          type: "CREDIT",
          amountMinor: part,
          postedDay: event.day,
          valueDate: event.valueDate,
        });
      });
      return;
    }
  }
}
