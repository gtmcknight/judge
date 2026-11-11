import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";
import { erc20Abi, site } from "./deployment";
import { VERDICTS, get, search, votesOf, type PanelRecord, type Verdict, type Vote } from "./imd";
import { parseQuestion, questionHashOf } from "./text";

export { VERDICTS, type PanelRecord, type Verdict, type Vote } from "./imd";

/** What never changes on a deployed contract, plus today's price. */
export function useJudge() {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["judge"],
    staleTime: 60_000,
    queryFn: async () => {
      const { judge, abi, door } = site();
      const read = <T,>(functionName: string) => client!.readContract({ address: judge, abi, functionName }) as Promise<T>;
      const [panelSize, quorum, asset, price] = await Promise.all([read<number>("panelSize"), read<number>("quorum"), read<Address>("asset"), read<bigint>("price")]);
      const symbol = await client!.readContract({ address: asset, abi: erc20Abi, functionName: "symbol" });
      const pool = door
        ? await Promise.all(
            ["poolFee", "poolTickSpacing"].map((functionName) => client!.readContract({ address: door.address, abi: door.abi, functionName }) as Promise<number>),
          )
        : null;
      return { panelSize: Number(panelSize), quorum: Number(quorum), asset, symbol, price, poolFee: Number(pool?.[0] ?? 0), poolTickSpacing: Number(pool?.[1] ?? 0) };
    },
  });
}

export function useCaseCount() {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["count"],
    refetchInterval: 20_000,
    queryFn: async () => {
      const { judge, abi } = site();
      return Number(await client!.readContract({ address: judge, abi, functionName: "caseCount" }));
    },
  });
}

type OnChain = { verdict: Verdict; askedAt: number; questionHash: `0x${string}` };

async function readCase(client: NonNullable<ReturnType<typeof usePublicClient>>, id: number): Promise<OnChain> {
  const { judge, abi } = site();
  const [verdict, record] = await Promise.all([
    client.readContract({ address: judge, abi, functionName: "verdict", args: [BigInt(id)] }) as Promise<number>,
    client.readContract({ address: judge, abi, functionName: "cases", args: [BigInt(id)] }) as Promise<readonly [number, number, `0x${string}`]>,
  ]);
  return { verdict: VERDICTS[Number(verdict)] ?? "Pending", askedAt: Number(record[0]), questionHash: record[2] };
}

export type Row = { id: number; rule: string | null; verdict: Verdict; askedAt: number };

/**
 * The newest cases. The contract lists them and says each verdict, so this works with no logs and no
 * indexer. IMD's API adds the words, and a row keeps its place without them when that read fails.
 */
export function useCaseRows(limit = 8) {
  const client = usePublicClient();
  const { data: count } = useCaseCount();
  return useQuery({
    queryKey: ["rows", count, limit],
    enabled: count !== undefined,
    placeholderData: keepPreviousData,
    refetchInterval: 20_000,
    queryFn: async (): Promise<Row[]> => {
      if (!count) return [];
      const ids = Array.from({ length: Math.min(limit, count) }, (_, i) => count - i);
      const { judge } = site();
      const [chain, found] = await Promise.all([
        Promise.all(ids.map((id) => readCase(client!, id))),
        // Asked for more than the page shows, since anyone can ask a question with these words in it.
        search(`on judge ${judge.toLowerCase()}`, limit * 3).catch(() => ({ requests: [] as PanelRecord[] })),
      ]);
      return ids.map((id, i) => {
        const onChain = chain[i]!;
        const record = found.requests.find((r) => parseQuestion(r.question)?.number === id && questionHashOf(r) === onChain.questionHash);
        return { id, rule: record ? parseQuestion(record.question)!.rule : null, verdict: onChain.verdict, askedAt: onChain.askedAt };
      });
    },
  });
}

/** One case as the contract holds it: the source of truth for its verdict. */
export function useCaseOnChain(id: number, enabled = true) {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["case", id],
    enabled,
    // A public node can lag a block or two behind the wallet's, so a case this browser just opened
    // keeps being read even while the node says it doesn't exist.
    refetchInterval: (query) => (query.state.data?.verdict === "Pending" && (query.state.data.askedAt || rememberedCase(id)) ? 6_000 : false),
    queryFn: () => readCase(client!, id),
  });
}

export type CasePanel = { record: PanelRecord; rule: string; proof: string; votes: Vote[] };

/** The words and the votes behind a case, read again while it's open and once more when it closes. */
export function useCasePanel(id: number, onChain: OnChain | undefined) {
  const verdict = onChain?.verdict;
  return useQuery({
    queryKey: ["panel", id, verdict],
    enabled: !!onChain?.askedAt,
    placeholderData: keepPreviousData,
    retry: 2,
    refetchInterval: (query) => (verdict === "Pending" ? (query.state.status === "error" ? 30_000 : 10_000) : false),
    queryFn: async (): Promise<CasePanel | null> => {
      const { judge } = site();
      const found = await search(`Case ${id} on judge ${judge.toLowerCase()}`, 5);
      const match = found.requests.find((r) => parseQuestion(r.question)?.number === id && questionHashOf(r) === onChain!.questionHash);
      if (!match) return null;
      const parsed = parseQuestion(match.question)!;
      const record = await get<PanelRecord>(`/oracle/requests/${match.id}`);
      return { record, rule: parsed.rule, proof: parsed.proof, votes: votesOf(record) };
    },
  });
}

const remembered = (id: number) => `judge:${site().judge}:${id}`;

/** A case this browser just opened, shown from here until IMD has read it. */
export function rememberCase(id: number, rule: string, proof: string) {
  try {
    sessionStorage.setItem(remembered(id), JSON.stringify({ rule, proof }));
  } catch {
    // private windows may refuse; the words come from IMD a little later
  }
}

export function rememberedCase(id: number): { rule: string; proof: string } | null {
  try {
    return JSON.parse(sessionStorage.getItem(remembered(id)) ?? "null") as { rule: string; proof: string } | null;
  } catch {
    return null;
  }
}
