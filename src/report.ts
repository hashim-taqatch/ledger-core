import { formatMinor } from "./money.js";
import type { CurrencyCode } from "./money.js";
import type { ReplayResult } from "./engine.js";
import type { Account, AccountId } from "./types.js";

export function printReport(result: ReplayResult, windowDays: number, accounts: Account[]): void {
  const { dayReports, authorizationDecisions, rejectedActions, unresolvedFeeRuleWarnings } = result;
  const currencyOf = new Map<AccountId, CurrencyCode>(accounts.map((a) => [a.id, a.currency]));

  for (let day = 1; day <= windowDays; day++) {
    console.log(`\n=== Day ${day} ===`);

    for (const report of dayReports.filter((r) => r.day === day)) {
      const currency = report.currency as CurrencyCode;
      console.log(`  ${report.accountId} (${currency})`);
      console.log(
        `    closing balance (before fee): ${formatMinor(report.closingBalanceBeforeFeeMinor, currency)}`,
      );
      if (report.feeAssessedMinor !== null) {
        console.log(`    overdraft fee assessed:       ${formatMinor(report.feeAssessedMinor, currency)}`);
      }
      console.log(
        `    closing balance (after fee):  ${formatMinor(report.closingBalanceAfterFeeMinor, currency)}`,
      );
      console.log(`    interest accrued today:       ${formatMinor(report.interestAccrualMinor, currency)}`);
      if (report.capitalizationMinor !== null) {
        console.log(
          `    interest capitalized (Day ${windowDays}): ${formatMinor(report.capitalizationMinor, currency)}`,
        );
        console.log(
          `    FINAL closing balance:        ${formatMinor(report.finalClosingBalanceMinor, currency)}`,
        );
      }
    }

    const auths = authorizationDecisions.filter((a) => a.day === day);
    if (auths.length > 0) {
      console.log("  Authorizations:");
      for (const a of auths) {
        const currency = currencyOf.get(a.accountId)!;
        console.log(
          `    ${a.authId} on ${a.accountId}: requested ${formatMinor(a.requestedAmountMinor, currency)}, ` +
            `available before ${formatMinor(a.availableBalanceBeforeMinor, currency)} -> ${a.approved ? "APPROVED" : "DECLINED"}`,
        );
      }
    }

    const errors = [...rejectedActions, ...unresolvedFeeRuleWarnings].filter((r) => r.day === day);
    if (errors.length > 0) {
      console.log("  Errors:");
      for (const e of errors) {
        console.log(`    [${e.eventId}] ${e.accountId}: ${e.reason}`);
      }
    }
  }
  console.log("");
}
