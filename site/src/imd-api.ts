// IMD's paid API as this page reaches it, through the Worker's pass-through, and what a launch costs.
// Kept apart from the payment step (imd-job.ts), which loads only when someone presses Pay.
import { zeroAddress, type Address } from "viem";
import type { Config } from "wagmi";
import { getPublicClient, readContract } from "wagmi/actions";
import { ethToSend, quoteEth } from "./ask";
import { erc20Abi } from "./deployment";
import { amount } from "./text";

export const CONTROL_PLANE = "https://api.imd.fun";
export const ACTION = "workflow.open";

export type Payment = { network: string; asset: string; amount: string; payTo: string; decimals: number; scheme: "exact" };
export type Capabilities = { actions: Array<{ action: string; payment: Omit<Payment, "scheme"> }> };

/** One random credential per browser: it names this reader's orders to IMD, and grants nothing else. */
export function tokenOf(): string {
  const KEY = "judge.imd.token";
  try {
    const kept = localStorage.getItem(KEY);
    if (kept && /^[0-9a-f]{64}$/.test(kept)) return kept;
  } catch {
    // private windows: a fresh one each time, which only means older orders aren't listed
  }
  const token = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
  try {
    localStorage.setItem(KEY, token);
  } catch {
    // kept for this visit only
  }
  return token;
}

export async function call(path: string, token: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const response = await fetch(new URL(`imd/requests/${path}`, document.baseURI), {
    method: init.method ?? "GET",
    headers: { authorization: `Bearer ${token}`, ...(init.body !== undefined ? { "content-type": "application/json" } : {}), ...init.headers },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json };
}

/** IMD's reason, in its own words: its checker's problems first, else its code read aloud. */
export function refused(json: unknown): string {
  const body = (json ?? {}) as { error?: string; detail?: string; problems?: Array<{ detail?: string }> };
  const problems = (body.problems ?? []).map((p) => p.detail?.trim()).filter(Boolean).slice(0, 2);
  const said = problems.length ? problems.join(" ") : (body.detail ?? body.error?.replaceAll("_", " ") ?? "no reason given");
  return /[.?!]$/.test(said) ? said : `${said}.`;
}

/** IMD's price list, asked once a visit; a failed ask is asked again next time. */
let listed: Promise<Capabilities | null> | null = null;
function capabilities(): Promise<Capabilities | null> {
  listed ??= call("capabilities", tokenOf()).then(
    (r) => {
      if (r.status === 200) return r.json as Capabilities;
      listed = null;
      return null;
    },
    () => {
      listed = null;
      return null;
    },
  );
  return listed;
}

/** IMD on Ethereum, and its own pool there, where IMD's launch page buys the IMD a wallet is short of: ETH and IMD, a 1% fee, no hook. */
export const IMD_ON_ETHEREUM: Address = "0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7";
export const IMD_POOL = { currency0: zeroAddress, currency1: IMD_ON_ETHEREUM, fee: 10_000, tickSpacing: 200, hooks: zeroAddress } as const;

/**
 * What the button asks for. A wallet that holds the job's IMD pays it; any other pays ETH, which buys
 * all of that IMD in IMD's pool first (an IMD balance short of the price stays where it is). `amount`
 * is exactly what goes out: the IMD, or the ETH the swap spends, to the two digits the button shows.
 */
export type Price = { pays: "imd"; amount: bigint; imd: bigint } | { pays: "eth"; amount: bigint; imd: bigint };

export async function priceOfBuild(config: Config, address: Address | undefined): Promise<Price> {
  const payment = (await capabilities())?.actions.find((a) => a.action === ACTION)?.payment;
  if (!payment) throw new Error("IMD isn't listing build jobs");
  const imd = BigInt(payment.amount);
  const chainId = Number(payment.network.slice(7));
  const asset = payment.asset.toLowerCase() as Address;
  const byImd: Price = { pays: "imd", amount: imd, imd };
  // ETH buys IMD only where IMD's pool is known
  if (chainId !== 1 || asset !== IMD_ON_ETHEREUM) return byImd;
  if (address) {
    const held = await readContract(config, { chainId, address: asset, abi: erc20Abi, functionName: "balanceOf", args: [address] });
    if (held >= imd) return byImd;
  }
  const client = getPublicClient(config, { chainId });
  if (!client) return byImd;
  return { pays: "eth", amount: ethToSend(await quoteEth(client, asset, imd, IMD_POOL.fee, IMD_POOL.tickSpacing)), imd };
}

/** The button's words: exactly what leaves the wallet. */
export const payWords = (price: Price) => `Pay ${amount(price.amount)} ${price.pays === "eth" ? "ETH" : "IMD"} and launch`;
