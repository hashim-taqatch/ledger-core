import type { Account, AccountId, EntryType, Hold, LedgerEntry } from "./types.js";
import type { CurrencyCode } from "./money.js";

let globalSeq = 0;

// One append-only ledger + hold table per account. Nothing here is ever
// mutated in place except a Hold's status/settledAmountMinor, which is
// metadata about a hold, not a ledger entry — the entries array itself
// never shrinks or edits an existing element.
export class AccountLedger {
  readonly account: Account;
  private entries: LedgerEntry[] = [];
  private holds = new Map<string, Hold>();
  private feeAssessedOnDay = new Set<number>();

  constructor(account: Account) {
    this.account = account;
  }

  get currency(): CurrencyCode {
    return this.account.currency;
  }

  get accountId(): AccountId {
    return this.account.id;
  }

  post(entry: Omit<LedgerEntry, "seq">): LedgerEntry {
    const full: LedgerEntry = { ...entry, seq: globalSeq++ };
    this.entries.push(full);
    return full;
  }

  allEntries(): readonly LedgerEntry[] {
    return this.entries;
  }

  // Value-dated closing balance: every entry posted so far (postedDay <=
  // asOfPostedDay) whose value_date falls on or before `valueDateCutoff`.
  // This is what lets a backdated entry (E7) change the answer to "what was
  // Day 2's balance?" without ever touching the entries already written for
  // Day 2 — the query is re-evaluated, history is not.
  balanceAsOf(valueDateCutoff: number, asOfPostedDay = Infinity): number {
    return this.entries
      .filter((e) => e.valueDate <= valueDateCutoff && e.postedDay <= asOfPostedDay)
      .reduce((sum, e) => sum + e.amountMinor, 0);
  }

  // Real-time ledger total right now — every posted entry regardless of
  // value date. This is what authorization holds are checked against:
  // an authorization cares about cash actually in the account today, not
  // about a value-dated accounting fiction.
  currentTotal(): number {
    return this.entries.reduce((sum, e) => sum + e.amountMinor, 0);
  }

  activeHoldsTotal(): number {
    let total = 0;
    for (const hold of this.holds.values()) {
      if (hold.status === "ACTIVE") total += hold.amountMinor;
    }
    return total;
  }

  availableBalance(): number {
    return this.currentTotal() - this.activeHoldsTotal();
  }

  placeHold(hold: Hold): void {
    this.holds.set(hold.authId, hold);
  }

  getHold(authId: string): Hold | undefined {
    return this.holds.get(authId);
  }

  hasFeeBeenAssessed(day: number): boolean {
    return this.feeAssessedOnDay.has(day);
  }

  markFeeAssessed(day: number): void {
    this.feeAssessedOnDay.add(day);
  }

  findEntry(sourceEventId: string): LedgerEntry | undefined {
    return this.entries.find((e) => e.sourceEventId === sourceEventId);
  }
}

export function entryTypeLabel(type: EntryType): string {
  return type;
}
