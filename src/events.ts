import type { LedgerEvent } from "./types.js";

// The fixed event stream from the assignment, replayed in this exact order.
export const EVENT_STREAM: LedgerEvent[] = [
  { id: "E1", day: 1, accountId: "ACC-001", type: "CREDIT", amount: "1200.00", valueDate: 1 },
  { id: "E2", day: 1, accountId: "ACC-001", type: "DEBIT", amount: "950.00", valueDate: 1 },
  { id: "E3", day: 2, accountId: "ACC-001", type: "AUTHORIZATION", authId: "Auth-A", amount: "200.00", valueDate: 2 },
  { id: "E4", day: 3, accountId: "ACC-001", type: "CREDIT", amount: "400.00", valueDate: 3 },
  { id: "E5", day: 4, accountId: "ACC-001", type: "SETTLEMENT", authId: "Auth-A", amount: "185.00", valueDate: 4 },
  { id: "E6", day: 4, accountId: "ACC-001", type: "SETTLEMENT", authId: "Auth-Z", amount: "180.00", valueDate: 4 },
  { id: "E7", day: 5, accountId: "ACC-001", type: "DEBIT", amount: "620.00", valueDate: 2 },
  { id: "E8", day: 5, accountId: "ACC-001", type: "AUTHORIZATION", authId: "Auth-B", amount: "90.00", valueDate: 5 },
  { id: "E9", day: 6, accountId: "ACC-001", type: "REVERSAL", targetEventId: "E7", valueDate: 2 },
  { id: "E10", day: 5, accountId: "ACC-002", type: "INSTALMENT_CREDIT", amount: "10.000", instalments: 3, valueDate: 5 },
];

export const WINDOW_DAYS = 6;
