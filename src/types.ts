import type { CurrencyCode } from "./money.js";

export type AccountId = "ACC-001" | "ACC-002";

export interface Account {
  id: AccountId;
  currency: CurrencyCode;
}

export type EntryType =
  | "CREDIT"
  | "DEBIT"
  | "SETTLEMENT"
  | "REVERSAL"
  | "FEE"
  | "INTEREST_CAPITALIZATION";

// A single append-only ledger entry. Never mutated or removed once posted.
// `postedDay` is when it entered the ledger (real/system time).
// `valueDate` is the accounting day it counts toward.
// They differ exactly when an entry is backdated (E7) or a reversal is
// value-dated to match what it reverses (E9).
export interface LedgerEntry {
  seq: number;
  sourceEventId: string;
  accountId: AccountId;
  type: EntryType;
  amountMinor: number; // signed
  postedDay: number;
  valueDate: number;
  refEventId?: string; // for SETTLEMENT (-> authId) and REVERSAL (-> reversed entry's sourceEventId)
}

export type HoldStatus = "ACTIVE" | "SETTLED" | "DECLINED";

export interface Hold {
  authId: string;
  accountId: AccountId;
  amountMinor: number;
  status: HoldStatus;
  createdDay: number;
  settledAmountMinor?: number;
}

export interface AuthorizationDecision {
  day: number;
  accountId: AccountId;
  authId: string;
  requestedAmountMinor: number;
  availableBalanceBeforeMinor: number;
  approved: boolean;
}

export interface RejectedAction {
  day: number;
  accountId: AccountId;
  eventId: string;
  reason: string;
}

// ---- Event stream (input) ----

interface EventBase {
  id: string;
  day: number; // calendar day the event is processed/recorded
  accountId: AccountId;
}

export interface CreditEvent extends EventBase {
  type: "CREDIT";
  amount: string;
  valueDate: number;
}

export interface DebitEvent extends EventBase {
  type: "DEBIT";
  amount: string;
  valueDate: number;
}

export interface AuthorizationEvent extends EventBase {
  type: "AUTHORIZATION";
  authId: string;
  amount: string;
  valueDate: number;
}

export interface SettlementEvent extends EventBase {
  type: "SETTLEMENT";
  authId: string;
  amount: string;
  valueDate: number;
}

export interface ReversalEvent extends EventBase {
  type: "REVERSAL";
  targetEventId: string;
  valueDate: number;
}

// E10: one CREDIT posted as N equal(-ish) instalments.
export interface InstalmentCreditEvent extends EventBase {
  type: "INSTALMENT_CREDIT";
  amount: string;
  instalments: number;
  valueDate: number;
}

export type LedgerEvent =
  | CreditEvent
  | DebitEvent
  | AuthorizationEvent
  | SettlementEvent
  | ReversalEvent
  | InstalmentCreditEvent;
