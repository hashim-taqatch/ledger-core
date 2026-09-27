import { EVENT_STREAM, WINDOW_DAYS } from "./events.js";
import { replay } from "./engine.js";
import { printReport } from "./report.js";
import type { Account } from "./types.js";

export const ACCOUNTS: Account[] = [
  { id: "ACC-001", currency: "AED" },
  { id: "ACC-002", currency: "BHD" },
];

const result = replay(EVENT_STREAM, ACCOUNTS, WINDOW_DAYS);
printReport(result, WINDOW_DAYS, ACCOUNTS);
