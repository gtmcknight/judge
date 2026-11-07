import { keccak256, stringToHex } from "viem";

/** What the contract takes, and how a question reads back. */

export const MAX_RULE = 500;
export const MAX_PROOF = 650;

const CURLY: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "–": "-",
  "—": "-",
  "…": "...",
  " ": " ",
};

/** What a phone or a word processor types in place of ASCII, turned back, so pasted text just works. */
export function straighten(text: string): string {
  return text.replace(/[‘’“”–—… ]/g, (c) => CURLY[c] ?? c).trim();
}

/** Why the contract would refuse this text, short enough to sit beside a label, or null. Run on straightened text. */
export function problemWith(text: string, limit: number): string | null {
  if (!text) return "Needed";
  if (text.length > limit) return `Cut to ${limit}. It has ${text.length}.`;
  const other = [...text].find((c) => c.charCodeAt(0) >= 0x80);
  if (other) return `Can't take ${other}`;
  return null;
}

export type Parsed = { number: number; rule: string; proof: string };

/** A case's question, as the contract wrote it, read back into its rule and proof. */
export function parseQuestion(question: string): Parsed | null {
  const parts = /^\[RULE\]([\s\S]*?)\[\/RULE\] \[PROOF\]([\s\S]*?)\[\/PROOF\] Case (\d+) on judge /.exec(question);
  if (!parts?.[1] || parts[2] === undefined || !parts[3]) return null;
  return { rule: parts[1], proof: parts[2], number: Number(parts[3]) };
}

/**
 * The hash a question's document has, as the contract computed it. IMD's search returns any question
 * with these words in it, and anyone can ask one, so a record only counts when its hash is the case's.
 */
export function questionHashOf(record: { question: string; chainId: number; answerType: string; window: { fromBlock: number; toBlock: number } }) {
  const document = JSON.stringify({
    answerType: record.answerType,
    chainId: record.chainId,
    evidence: "panel",
    question: record.question,
    v: 1,
    window: { fromBlock: record.window.fromBlock, toBlock: record.window.toBlock },
  });
  return keccak256(stringToHex(document));
}

/** The clipboard can refuse, or not exist off https, so a copy says whether it worked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "just now", "4 minutes ago", "yesterday", then a date after a week. */
export function timeAgo(seconds: number): string {
  const ago = Math.max(0, Date.now() / 1000 - seconds);
  if (ago < 45) return "just now";
  if (ago < 3600) return relative.format(-Math.max(1, Math.round(ago / 60)), "minute");
  if (ago < 86400) return relative.format(-Math.round(ago / 3600), "hour");
  if (ago < 604800) return relative.format(-Math.round(ago / 86400), "day");
  return new Date(seconds * 1000).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}

export function took(from: string, to: string): string {
  const seconds = (Date.parse(to) - Date.parse(from)) / 1000;
  if (!(seconds > 0)) return "";
  if (seconds < 90) return `${Math.round(seconds)} seconds`;
  const count = Math.round(seconds / 60);
  return `${count} minute${count === 1 ? "" : "s"}`;
}

/** A token amount for reading: "0.5", "0.00067", never a row of zeros. */
export function amount(wei: bigint): string {
  const whole = Number(wei) / 1e18;
  if (whole === 0) return "0";
  if (whole >= 1) return whole.toLocaleString("en", { maximumFractionDigits: 3 });
  return Number(whole.toPrecision(2)).toLocaleString("en", { maximumFractionDigits: 8 });
}

export const EXAMPLES: Array<{ label: string; rule: string; proof: string }> = [
  {
    label: "a page",
    rule: "The page must say it is for use in documentation examples.",
    proof: "https://example.com",
  },
  {
    label: "a transaction",
    rule: "Did this transaction send YOLO tokens to 0xbf6838e27f82754443724006d127a130b9dd9e0a?",
    proof: "0x79c0a3ede9efd2cd3a680ff1eca3f8785764466ae17c9844da6381c2c88a7ce2 on Ethereum",
  },
  {
    label: "a reason",
    rule: "The message must give a specific reason to sell.",
    proof: "I am selling 10% of my bag to pay rent this month. I am keeping the rest.",
  },
];
