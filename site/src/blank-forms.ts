import { formatEther, parseEther, type Address } from "viem";

/**
 * Launch it as blanks: each use is one sentence with the few things only the launcher knows left
 * blank. The page writes IMD's request from them, so nobody writes a spec and nothing launches with
 * "alice" in it.
 */

export type Kind = "who" | "eth" | "place" | "date" | "words" | "count";
export type Blank = { key: string; kind: Kind; label: string; example: string };
export type Values = Record<string, string>;
export type Form = { pieces: (string | Blank)[]; request: (v: Values) => string };

const who = (label = "Who gets paid"): Blank => ({ key: "who", kind: "who", label, example: "alice.eth or 0x…" });
const eth = (label = "How much ETH", example = "1", key = "amount"): Blank => ({ key, kind: "eth", label, example });
const by: Blank = { key: "date", kind: "date", label: "By when", example: "Dec 31, 2026" };

/** In the same order as USES. */
export const FORMS: Form[] = [
  {
    pieces: ["Let people bet ETH on whether ", { key: "event", kind: "words", label: "What has to happen", example: "GTA 6 is released" }, " by ", by, "."],
    request: (v) =>
      `Build me a prediction market where people bet ETH on whether ${v.event} by ${v.date}. A yes answer pays the yes side. If no yes answer lands within a week after ${v.date}, the no side wins.`,
  },
  {
    pieces: ["Pay ", eth(), " ETH to whoever gets a fix for ", { key: "issue", kind: "place", label: "Which issue", example: "github.com/you/app/issues/12" }, " merged."],
    request: (v) => `Build me a contract that holds ${v.amount} ETH and pays whoever gets a pull request that fixes ${v.issue} merged.`,
  },
  {
    pieces: ["Pay ", who(), " ", eth(), " ETH when their article is published on ", { key: "site", kind: "place", label: "Which site", example: "mysite.com" }, "."],
    request: (v) => `Build me a contract that holds ${v.amount} ETH and pays ${v.who} when their article is published on ${v.site}.`,
  },
  {
    pieces: ["Pay ", who(), " ", eth("ETH per milestone"), " ETH for each milestone they ship: ", { key: "milestones", kind: "words", label: "The milestones", example: "a v1, live docs, a mainnet deploy" }, "."],
    request: (v) => `Build me a grant that pays ${v.who} ${v.amount} ETH for each milestone they ship: ${v.milestones}. It holds enough to pay for all of them.`,
  },
  {
    pieces: ["Pay ", who(), " ", eth("How much ETH", "0.5"), " ETH when they post about ", { key: "thing", kind: "place", label: "What they post about", example: "myapp.xyz" }, " on X with a link to it."],
    request: (v) => `Build me a contract that holds ${v.amount} ETH and pays ${v.who} when their post about ${v.thing} goes up on X with a link to it.`,
  },
  {
    pieces: [
      "Pay ",
      eth("ETH per winner", "0.1", "prize"),
      " ETH each to the first ",
      { key: "count", kind: "count", label: "How many winners", example: "10" },
      " people who post a thread on X explaining ",
      { key: "thing", kind: "place", label: "What the thread explains", example: "myapp.xyz" },
      ".",
    ],
    request: (v) =>
      `Build me a contest that holds ${total(v.prize!, v.count!)} ETH and pays ${v.prize} ETH to each of the first ${v.count} people who post a thread on X explaining ${v.thing}.`,
  },
  {
    pieces: [
      "Lock ",
      eth("How much ETH you lock", "0.5"),
      " ETH. I get it back if I ",
      { key: "goal", kind: "words", label: "What you'll do", example: "finish a marathon" },
      " by ",
      { ...by, example: "June 1, 2027" },
      ". If not, it goes to ",
      { ...who("Who gets it if you don't"), key: "charity", example: "charity.eth or 0x…" },
      ".",
    ],
    request: (v) => `Build me a contract where I lock ${v.amount} ETH and get it back if I ${v.goal} by ${v.date}. If I don't, it goes to ${v.charity}. I am ${v.me}.`,
  },
  {
    pieces: ["Pay ", who(), " ", eth(), " ETH if they post proof they ", { key: "dare", kind: "words", label: "The dare", example: "smashed two eggs on their head" }, "."],
    request: (v) => `Build me a contract that holds ${v.amount} ETH and pays ${v.who} if they post proof they ${v.dare}.`,
  },
];

export const blanksOf = (form: Form) => form.pieces.filter((p): p is Blank => typeof p !== "string");

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ENS = /^([a-z0-9-]+\.)+eth$/i;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** That day at midnight UTC, or null for a day the month doesn't have. */
function utcDay(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month, day));
  return month >= 0 && date.getUTCMonth() === month && date.getUTCDate() === day ? date : null;
}

/**
 * The day a date blank names, or null. Read by hand rather than by `Date.parse`, which Safari and
 * Chrome disagree on: "Dec 31, 2026", "31 December 2026", "12/31/2026" and the date picker's "2026-12-31".
 */
export function dayOf(text: string): Date | null {
  const t = text.trim().toLowerCase().replace(/[,.]/g, " ").replace(/\s+/g, " ");
  const month = (name: string) => MONTHS.indexOf(name.slice(0, 3));
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return utcDay(+m[1]!, +m[2]! - 1, +m[3]!);
  m = /^([a-z]+) (\d{1,2})(?:st|nd|rd|th)? (\d{4})$/.exec(t);
  if (m) return utcDay(+m[3]!, month(m[1]!), +m[2]!);
  m = /^(\d{1,2})(?:st|nd|rd|th)? ([a-z]+) (\d{4})$/.exec(t);
  if (m) return utcDay(+m[3]!, month(m[2]!), +m[1]!);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return utcDay(+m[3]!, +m[1]! - 1, +m[2]!);
  return null;
}

/** A date as the request says it: "Dec 31, 2026". */
export const dayWords = (day: Date) => day.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** What's wrong with one blank, in a few words, or null. */
export function problemOf(blank: Blank, raw: string): string | null {
  const value = raw.trim();
  if (!value) return "Fill this in";
  switch (blank.kind) {
    case "who":
      return ADDRESS.test(value) || ENS.test(value) ? null : "An address or a .eth name";
    case "eth": {
      try {
        return parseEther(value) > 0n ? null : "More than 0";
      } catch {
        return "An amount, like 0.5";
      }
    }
    case "place":
      return /^\S+\.\S+$/.test(value) ? null : "A link or a site, like mysite.com";
    case "date": {
      const day = dayOf(value);
      if (!day) return "A date, like Dec 31, 2026";
      return day.getTime() > Date.now() ? null : "A date after today";
    }
    case "count":
      return /^[1-9]\d{0,3}$/.test(value) ? null : "A whole number";
    case "words":
      return value.length >= 3 ? null : "A few words";
  }
}

/** The first blank that isn't ready, with what's wrong, or null when all are. */
export function firstProblem(form: Form, values: Values): { blank: Blank; problem: string } | null {
  for (const blank of blanksOf(form)) {
    const problem = problemOf(blank, values[blank.key] ?? "");
    if (problem) return { blank, problem };
  }
  return null;
}

function total(prize: string, count: string): string {
  return formatEther(parseEther(prize) * BigInt(count));
}

/**
 * IMD's request, once every blank is ready. A .eth name goes in with the address it points to now, since
 * the contract stores an address; `resolve` looks it up and throws a plain line if it points nowhere.
 */
export async function requestOf(form: Form, values: Values, me: Address, resolve: (name: string) => Promise<Address | null>): Promise<string> {
  const v: Values = { me };
  for (const blank of blanksOf(form)) {
    const value = values[blank.key]!.trim();
    if (blank.kind === "who" && ENS.test(value)) {
      const address = await resolve(value.toLowerCase());
      if (!address) throw new Error(`${value} doesn't point to an address. Use the 0x address instead.`);
      v[blank.key] = `${value} (${address})`;
    } else if (blank.kind === "date") {
      v[blank.key] = dayWords(dayOf(value)!);
    } else {
      v[blank.key] = value;
    }
  }
  return form.request(v);
}
