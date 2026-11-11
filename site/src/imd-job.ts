// "Launch it": the page buys IMD's build-and-launch job (workflow.open) from the reader's wallet, the way
// IMD's own launch page does, through the Worker's pass-through to IMD's paid API. A wallet without the
// IMD first buys it with ETH in IMD's pool. IMD quotes the job, the wallet signs a Permit2 payment of IMD
// and an approval of that payment for that quote, and IMD opens the job. Loaded only when someone presses
// Pay, so the page itself stays light.
import { x402Client } from "@x402/core/client";
import { encodePaymentSignatureHeader } from "@x402/core/http";
import type { PaymentPayload, PaymentRequired } from "@x402/core/types";
import { PERMIT2_ADDRESS, type ClientEvmSigner } from "@x402/evm";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { BaseError, UserRejectedRequestError, concatHex, encodeAbiParameters, parseAbi, sha256, stringToBytes, type Address, type Hex } from "viem";
import type { Config } from "wagmi";
import { getBalance, getConnection, getPublicClient, readContract, signTypedData, switchChain, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { ethToSend, quoteEth } from "./ask";
import { erc20Abi, site } from "./deployment";
import { ACTION, CONTROL_PLANE, IMD_POOL, call, refused, tokenOf, type Capabilities, type Payment, type Price } from "./imd-api";
import { amount as shown } from "./text";

const EXPLORER = "https://explorer.imd.fun";

/** What IMD is told besides the reader's words: the release they chose, as IMD's own form says it. */
const RELEASE = "The requester chose this release: source code published to GitHub, website hosted on IPFS, contracts deployed on chain.";
/**
 * IMD quotes only what the request asks for in so many words: its checker refuses a plan with an audit
 * the words don't ask for, and builds a site only when asked.
 */
const SITE =
  "Build and test the contracts, have another agent give them an independent security review, then deploy them on Ethereum mainnet. " +
  "Also build a website for it and host it on IPFS at a public URL, and publish all the source code on GitHub. " +
  "The site shows the contract's state and lets a connected wallet do everything the contract offers.";

/** A message for the reader, as it is. Anything else is shown as a short, plain failure. */
export class Plain extends Error {}

/** The wallet holds less IMD than the job costs; the page offers a way to get some. */
export class ShortOfImd extends Plain {}

/** IMD's pool moved past the button's ETH before anything was sent; the page shows the new price. */
export class PriceMoved extends Plain {}

const cancelled = (error: unknown) => error instanceof BaseError && !!error.walk((e) => e instanceof UserRejectedRequestError);

/** A failure in words that say whether anything was paid and what to do next. */
export function explainBuild(error: unknown): string {
  if (error instanceof Plain) return error.message;
  if (cancelled(error)) return "You cancelled in your wallet. Nothing was paid.";
  if (error instanceof BaseError && /insufficient funds/i.test(error.message)) return "This wallet doesn't have the ETH for gas. Nothing was paid.";
  return "That didn't go through. Nothing was paid. Try again.";
}

/** The button's other job while the wallet stays silent: asking it again. */
export type Again = { label: string; ask: () => void };
export type OnStage = (stage: string, again?: Again) => void;

/** How long a wallet asked to sign may say nothing before the button offers to ask again: longer than reading a signature takes. */
const WALLET_SILENT_MS = 15_000;

/**
 * Rainbow closes its window just after a signature, and a request that arrives meanwhile is filed under the
 * closing window and never shown (it stays pending with nothing on screen). So the second signature waits
 * until the first one's window is gone, and the wallet opens a new one for it.
 */
const BETWEEN_SIGNATURES_MS = 1_500;

/**
 * Signature `n` of 2. A wallet can lose a request (a window that never opened, or opened behind another) and
 * never answer, so after a silence the button asks again. Whichever signature comes back first is used, once.
 * A refusal counts only from the newest ask, and other failures only once every ask has failed, since an older
 * ask may still answer. Only signatures are asked twice: one moves nothing until this page sends it.
 */
export function signAgainable<T>(n: 1 | 2, onStage: OnStage, sign: () => Promise<T>): Promise<T> {
  const stage = `Sign ${n} of 2 in your wallet`;
  return new Promise<T>((resolve, reject) => {
    let newest = 0;
    let waiting = 0;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const offer = () => onStage(stage, { label: `Ask again for signature ${n} of 2`, ask });
    function ask() {
      if (done) return;
      const mine = ++newest;
      waiting += 1;
      onStage(stage);
      clearTimeout(timer);
      timer = setTimeout(() => !done && offer(), WALLET_SILENT_MS);
      sign().then(
        (value) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          waiting -= 1;
          if (done || mine !== newest) return;
          if (cancelled(error) || waiting === 0) {
            done = true;
            clearTimeout(timer);
            reject(error);
          } else {
            clearTimeout(timer);
            offer();
          }
        },
      );
    }
    ask();
  });
}

type Quote = {
  v: 1;
  id: string;
  action: string;
  policyVersion: string;
  inputHash: string;
  issuedAt: number;
  expiresAt: number;
  payment: Payment;
  terms: { purchase: "action-admission"; resultGuaranteed: false };
  payer?: string;
  quoteHash: string;
};
type Offer = PaymentRequired & { quote: Quote; requesterScopeHash: string; resourceUrl: string; input: unknown };

// ---- canonical JSON, as IMD hashes it: sorted keys, integers only, no undefined ----

function canonical(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isInteger(value)) throw new Error("IMD hashes whole numbers only");
    return JSON.stringify(value === 0 ? 0 : value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  throw new Error(`IMD can't hash a ${typeof value}`);
}

const hashOf = (value: unknown) => sha256(stringToBytes(canonical(value))).slice(2);

/** The scope IMD files this browser's orders under, from its request token. */
const scopeOf = (token: string) => hashOf({ domain: "identitymd.paid-requester", scope: `paid-client:${hashOf({ domain: "identitymd.paid-http-client", token })}` });

// ---- the payment IMD asks for, checked against the quote this page made, before any wallet opens ----

function checkOffer(offer: Offer, quote: Quote, input: unknown, token: string, caps: Capabilities) {
  const changed = (what: string) => new Plain(`IMD's payment details didn't match (${what}). Nothing was signed.`);
  const { quoteHash, ...document } = offer.quote;
  const requirements = offer.accepts?.[0];
  if (canonical(offer.quote) !== canonical(quote)) throw changed("quote");
  if (quoteHash !== hashOf({ domain: "identitymd.paid-action-quote", ...document })) throw changed("quote hash");
  if (hashOf(offer.input) !== quote.inputHash || canonical(offer.input) !== canonical(input)) throw changed("work");
  if (offer.resourceUrl !== `${CONTROL_PLANE}/requests/${quote.id}` || offer.resource?.url !== offer.resourceUrl) throw changed("resource");
  if (offer.requesterScopeHash !== scopeOf(token)) throw changed("credential");
  if (offer.x402Version !== 2 || offer.accepts.length !== 1 || !requirements) throw changed("version");
  if (requirements.scheme !== "exact" || requirements.network !== quote.payment.network) throw changed("network");
  if (requirements.asset.toLowerCase() !== quote.payment.asset.toLowerCase() || requirements.payTo.toLowerCase() !== quote.payment.payTo.toLowerCase() || requirements.amount !== quote.payment.amount) throw changed("amount");
  if (canonical(requirements.extra ?? null) !== canonical({ assetTransferMethod: "permit2" })) throw changed("transfer");
  if (!Number.isInteger(requirements.maxTimeoutSeconds) || requirements.maxTimeoutSeconds < 6 || requirements.maxTimeoutSeconds > 300) throw changed("deadline");
  const advertised = caps.actions.find((a) => a.action === quote.action)?.payment;
  if (!advertised || advertised.network !== quote.payment.network || advertised.asset.toLowerCase() !== quote.payment.asset.toLowerCase() || advertised.payTo.toLowerCase() !== quote.payment.payTo.toLowerCase() || advertised.amount !== quote.payment.amount) {
    throw changed("advertised price");
  }
  return requirements;
}

/** The approval of this exact payment for this exact quote, so a signed payment can't be spent on another order. */
function approvalOf(offer: Offer, payment: PaymentPayload) {
  const { quote } = offer;
  return {
    domain: { name: "IdentityMD Paid Action", version: "1", chainId: Number(quote.payment.network.slice(7)) },
    primaryType: "QuoteApproval" as const,
    types: {
      QuoteApproval: [
        { name: "resource", type: "string" },
        { name: "requesterScopeHash", type: "bytes32" },
        { name: "quoteId", type: "string" },
        { name: "quoteHash", type: "bytes32" },
        { name: "paymentHash", type: "bytes32" },
        { name: "action", type: "string" },
        { name: "asset", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "payTo", type: "address" },
        { name: "expiresAt", type: "uint256" },
      ],
    },
    message: {
      resource: offer.resourceUrl,
      requesterScopeHash: `0x${offer.requesterScopeHash}` as Hex,
      quoteId: quote.id,
      quoteHash: `0x${quote.quoteHash}` as Hex,
      paymentHash: `0x${hashOf(payment)}` as Hex,
      action: quote.action,
      asset: quote.payment.asset as Address,
      amount: BigInt(quote.payment.amount),
      payTo: quote.payment.payTo as Address,
      expiresAt: BigInt(quote.expiresAt),
    },
  };
}

// ---- IMD bought with ETH, the way IMD's launch page buys a shortfall: one exact-input swap in IMD's pool ----

/** ETH kept back for the transactions after the swap, as IMD's page keeps it. */
const GAS_ROOM = 5n * 10n ** 14n;

const ROUTER_ABI = parseAbi(["function execute(bytes commands, bytes[] inputs, uint256 deadline) payable"]);
const POOL_KEY = [
  { name: "currency0", type: "address" },
  { name: "currency1", type: "address" },
  { name: "fee", type: "uint24" },
  { name: "tickSpacing", type: "int24" },
  { name: "hooks", type: "address" },
] as const;

/** The universal router's v4 command: swap exactly `ethIn` for at least `minImd`, pay it, take it all. */
function swapForImd(ethIn: bigint, minImd: bigint): { commands: Hex; inputs: Hex[] } {
  const swap = encodeAbiParameters(
    [{ type: "tuple", components: [{ name: "poolKey", type: "tuple", components: POOL_KEY }, { name: "zeroForOne", type: "bool" }, { name: "amountIn", type: "uint128" }, { name: "amountOutMinimum", type: "uint128" }, { name: "hookData", type: "bytes" }] }],
    [{ poolKey: IMD_POOL, zeroForOne: true, amountIn: ethIn, amountOutMinimum: minImd, hookData: "0x" }],
  );
  const settle = encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [IMD_POOL.currency0, ethIn]);
  const take = encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [IMD_POOL.currency1, minImd]);
  // SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL
  const actions = concatHex(["0x06", "0x0c", "0x0f"]);
  return { commands: "0x10", inputs: [encodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], [actions, [swap, settle, take]])] };
}

/** Buys the job's IMD with exactly the ETH the button named, or says why not before anything is sent. */
async function buyImd(config: Config, address: Address, chainId: number, price: Price & { pays: "eth" }, onStage: (stage: string) => void) {
  const client = getPublicClient(config, { chainId });
  if (!client) throw new Plain("This page can't reach Ethereum right now. Nothing was paid. Try again.");
  const fresh = ethToSend(await quoteEth(client, IMD_POOL.currency1, price.imd, IMD_POOL.fee, IMD_POOL.tickSpacing));
  if (fresh > price.amount) throw new PriceMoved("IMD's price just moved, so the button shows the new one. Nothing was paid.");
  const { value: eth } = await getBalance(config, { address, chainId });
  if (eth < price.amount + GAS_ROOM) throw new Plain(`This wallet needs ${shown(price.amount)} ETH plus gas. Nothing was paid.`);
  const { commands, inputs } = swapForImd(price.amount, price.imd);
  onStage(`Buy ${shown(price.imd)} IMD in your wallet`);
  const hash = await writeContract(config, { chainId, address: site().router, abi: ROUTER_ABI, functionName: "execute", args: [commands, inputs, BigInt(Math.floor(Date.now() / 1000) + 600)], value: price.amount });
  onStage("Buying IMD…");
  const receipt = await waitForTransactionReceipt(config, { chainId, hash, timeout: 180_000 });
  if (receipt.status !== "success") throw new Plain("The swap didn't go through, so only gas was spent. Try again.");
}

// ---- the whole purchase ----

export type Build = { orderId: string; jobUrl: string | null };

/** The words IMD builds from: the paste box's text, pointed at the public skill, and the site asked for. */
export const requestFor = (wish: string) => `Read and follow https://taylor.fyi/judge/skill.md\n\n${wish.trim()}\n\n${SITE}`;

/** The job as IMD's launch form sends it: contracts built, audited and deployed, a site, code on GitHub. */
export function inputFor(wish: string, chainId: number) {
  const request = requestFor(wish);
  return {
    request,
    context: RELEASE,
    draft: {
      objective: request.slice(0, 8000),
      shape: "chain",
      onchain: "evm_contracts",
      github: true,
      ipfs: true,
      steps: [{ skill: "build-contract-project" }, { skill: "frontend-for-contract" }, { skill: "adversarial-review" }],
      chainId,
    },
    permissions: { github: true, ipfs: true, onchain: { kind: "evm_contracts", chainId } },
  };
}

export async function buyBuild(config: Config, wish: string, onStage: OnStage, price: Price): Promise<Build> {
  const token = tokenOf();
  const caps = (await call("capabilities", token)).json as Capabilities | null;
  const advertised = caps?.actions.find((a) => a.action === ACTION)?.payment;
  if (!caps || !advertised) throw new Plain("IMD isn't taking build jobs right now. Try again later.");
  const chainId = Number(advertised.network.slice(7));
  const asset = advertised.asset as Address;
  const amount = BigInt(advertised.amount);

  const { address, chainId: on } = getConnection(config);
  if (!address) throw new Plain("Connect a wallet first.");
  if (on !== chainId) {
    onStage("Switching network…");
    await switchChain(config, { chainId });
  }

  if (price.imd !== amount) throw new PriceMoved("IMD changed its price, so the button shows the new one. Nothing was paid.");
  let bought = false;
  if (price.pays === "eth") {
    await buyImd(config, address, chainId, price, onStage);
    bought = true;
  }
  try {
    return await payImd(config, wish, onStage, { token, caps, chainId, asset, amount, address });
  } catch (error) {
    // the IMD the swap bought stays in the wallet unless IMD may have taken it
    if (!bought || error instanceof MaybePaid) throw error;
    throw new Plain(`${explainBuild(error)} The ${shown(price.imd)} IMD it bought is in your wallet, so Pay uses that next.`);
  }
}

/** The signed payment went out and IMD hasn't said what became of it. */
class MaybePaid extends Plain {}

async function payImd(
  config: Config,
  wish: string,
  onStage: OnStage,
  { token, caps, chainId, asset, amount, address }: { token: string; caps: Capabilities; chainId: number; asset: Address; amount: bigint; address: Address },
): Promise<Build> {
  const held = await readContract(config, { chainId, address: asset, abi: erc20Abi, functionName: "balanceOf", args: [address] });
  if (held < amount) throw new ShortOfImd(`This costs ${shown(amount)} IMD, and this wallet has ${shown(held)}.`);

  // Permit2 moves the IMD when IMD settles; the wallet lets it, for this much, once
  const allowed = await readContract(config, { chainId, address: asset, abi: erc20Abi, functionName: "allowance", args: [address, PERMIT2_ADDRESS] });
  if (allowed < amount) {
    onStage(`Approve ${shown(amount)} IMD in your wallet`);
    const hash = await writeContract(config, { chainId, address: asset, abi: erc20Abi, functionName: "approve", args: [PERMIT2_ADDRESS, amount] });
    onStage("Approving…");
    const receipt = await waitForTransactionReceipt(config, { chainId, hash, timeout: 180_000 });
    if (receipt.status !== "success") throw new Plain("The approval failed, so only gas was spent. Try again.");
  }

  onStage("Getting a quote…");
  const input = inputFor(wish, chainId);
  const quoted = await call("quote", token, { method: "POST", body: { requestKey: crypto.randomUUID(), action: ACTION, input } });
  if (quoted.status === 422) throw new Plain(`IMD needs more before it builds this: ${refused(quoted.json)} Nothing was paid.`);
  if (quoted.status !== 200 && quoted.status !== 201) throw new Plain(`IMD didn't quote it: ${refused(quoted.json)} Nothing was paid.`);
  const order = (quoted.json as { order: { id: string; quote: Quote; inputJson?: string } }).order;
  const quotedInput: unknown = order.inputJson ? JSON.parse(order.inputJson) : input;

  const challenge = await call(`${order.id}/submit`, token, { method: "POST", body: {} });
  if (challenge.status !== 402 || !(challenge.json as { accepts?: unknown })?.accepts) throw new Plain(`IMD didn't ask for the payment: ${refused(challenge.json)} Nothing was paid.`);
  const offer = challenge.json as Offer;
  const requirements = checkOffer(offer, order.quote, quotedInput, token, caps);
  const left = order.quote.expiresAt - Math.floor(Date.now() / 1000) - 2;
  if (left < 15) throw new Plain("IMD's quote ran out before the wallet opened. Nothing was signed. Try again.");

  const signer: ClientEvmSigner = { address, signTypedData: (args) => signAgainable(1, onStage, () => signTypedData(config, args as Parameters<typeof signTypedData>[1])) };
  const client = x402Client.fromConfig({
    schemes: [{ network: requirements.network, client: new ExactEvmScheme(signer) }],
    spendControls: { allowedAssets: [{ network: requirements.network, asset: requirements.asset, maxAmountPerPayment: requirements.amount }] },
  });
  onStage("Sign 1 of 2 in your wallet");
  const generated = await client.createPaymentPayload({ x402Version: 2, resource: offer.resource!, accepts: [{ ...requirements, maxTimeoutSeconds: Math.min(requirements.maxTimeoutSeconds, left) }] });
  const payment = JSON.parse(JSON.stringify({ ...generated, accepted: requirements })) as PaymentPayload;
  // the signed payment lasts until its own deadline, which can come before the quote's end; IMD refuses one within 6 seconds of it
  const deadline = Number((payment.payload as { permit2Authorization?: { deadline?: string } }).permit2Authorization?.deadline ?? order.quote.expiresAt);
  const ranOut = () => Math.min(order.quote.expiresAt, deadline) - Math.floor(Date.now() / 1000) < 8;
  onStage("Sign 2 of 2 in your wallet");
  await new Promise((resolve) => setTimeout(resolve, BETWEEN_SIGNATURES_MS));
  if (ranOut()) throw new Plain("IMD's quote ran out while signing. Nothing was sent. Try again.");
  const quoteSignature = await signAgainable(2, onStage, () => signTypedData(config, approvalOf(offer, payment) as Parameters<typeof signTypedData>[1]));
  if (ranOut()) throw new Plain("IMD's quote ran out while signing. Nothing was sent. Try again.");

  onStage("Sending…");
  // From here IMD may hold the payment, so only IMD's own answer can say nothing was paid.
  let sent: Awaited<ReturnType<typeof call>> | null = null;
  try {
    sent = await call(`${order.id}/submit`, token, { method: "POST", body: { quoteSignature }, headers: { "payment-signature": encodePaymentSignatureHeader(payment) } });
  } catch {
    // the connection dropped: the order's status says whether IMD got it
  }
  // a 409 is a payment already under way, so it waits for the status like a dropped connection does
  if (sent && sent.status >= 400 && sent.status < 500 && sent.status !== 409) throw new Plain(`IMD didn't take the payment: ${refused(sent.json)} Nothing was paid. Try again.`);
  try {
    return await admitted(order.id, token, onStage);
  } catch (error) {
    throw error instanceof Plain ? error : new MaybePaid(LOST);
  }
}

const LOST = "This page lost track of the job. If IMD took the payment, the job shows on IMD's explorer under your wallet in a few minutes.";

type OrderStatus = { status?: string; admission?: { result?: { kind?: string; jobId?: string; workflowId?: string } } };

async function admitted(orderId: string, token: string, onStage: (stage: string) => void): Promise<Build> {

  // the payment settles on chain, then IMD opens the job; this waits a few minutes at most
  onStage("Paying…");
  for (let i = 0; i < 60; i++) {
    let status: OrderStatus | null = null;
    try {
      status = (await call(orderId, token)).json as OrderStatus | null;
    } catch {
      // a dropped poll; the next one asks again
    }
    if (status?.status === "admitted") {
      const result = status.admission?.result;
      const id = result?.kind === "workflow" ? result.workflowId : result?.jobId;
      return { orderId, jobUrl: id && /^[0-9a-f-]{36}$/i.test(id) ? `${EXPLORER}/jobs/${id}` : null };
    }
    if (status?.status === "admission_pending") onStage("Paid. Opening the job…");
    if (status?.status === "payment_failed") throw new Plain("The payment didn't go through, so nothing was paid. Try again.");
    // still quoted means IMD never got the signed payment, and once the quote ends it can't be used
    if (status?.status === "expired" || (status?.status === "quoted" && i >= 5)) throw new Plain("IMD never got the payment, so nothing was paid. Try again.");
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new MaybePaid(LOST);
}
