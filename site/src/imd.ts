// What IMD says about a question: its words and its votes. Pure fetches and parsing, so the page and
// the Worker that draws a question's link preview read the same way.

export const IMD_API = "https://api.imd.fun";

export const VERDICTS = ["Pending", "Yes", "No", "NoAnswer"] as const;
export type Verdict = (typeof VERDICTS)[number];

/** The word a verdict is shown as. */
export const headline: Record<Verdict, string> = { Pending: "Voting", Yes: "Yes", No: "No", NoAnswer: "No answer" };

export type Vote = { seat: string; yes: boolean };

export type PanelRecord = {
  id: string;
  status: string;
  question: string;
  chainId: number;
  answerType: string;
  window: { fromBlock: number; toBlock: number };
  jobId: string | null;
  createdAt: string;
  attestedAt: string | null;
  members?: Array<{ ok?: boolean; tokenId?: string | null; answer?: { answer?: unknown } | null }> | null;
};

export async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${IMD_API}${path}`);
  if (!response.ok) throw new Error(`IMD answered ${response.status}`);
  return (await response.json()) as T;
}

export const search = (words: string, limit: number) => get<{ requests: PanelRecord[] }>(`/oracle/requests?q=${encodeURIComponent(words)}&limit=${limit}`);

export function votesOf(record: PanelRecord): Vote[] {
  const votes: Vote[] = [];
  for (const member of record.members ?? []) {
    if (!member.ok) continue;
    const answer = member.answer?.answer;
    if (answer === true || answer === false) votes.push({ seat: member.tokenId ?? "", yes: answer });
  }
  return votes;
}
