import { useCallback, useState } from "react";
import { useConfig, useConnection } from "wagmi";
import { getPublicClient, readContract, simulateContract, switchChain, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError, decodeEventLog, zeroAddress, type Address } from "viem";
import { erc20Abi, quoterAbi, site } from "./deployment";
import { rememberCase } from "./cases";
import { amount } from "./text";

export type Pay = "eth" | "imd";
export type Stage = "idle" | "switching" | "approve" | "approving" | "confirm" | "sending";

/** What the door will pay for a case's price right now. */
export async function quoteEth(client: NonNullable<ReturnType<typeof getPublicClient>>, asset: Address, price: bigint, fee: number, tickSpacing: number): Promise<bigint> {
  const { result } = await client.simulateContract({
    address: site().quoter,
    abi: quoterAbi,
    functionName: "quoteExactOutputSingle",
    args: [{ poolKey: { currency0: zeroAddress, currency1: asset, fee, tickSpacing, hooks: zeroAddress }, zeroForOne: true, exactAmount: price, hookData: "0x" }],
  });
  return result[0];
}

/** Room above the node's estimate: Sepolia prices new storage far above what wallets assume. */
const withRoom = (gas: bigint) => (gas * 3n) / 2n;
/**
 * What paying in ETH sends: the quote with room for a small move in the pool, rounded up to the two
 * digits the page shows, so the button, the wallet and the transaction all say the same number.
 * The door swaps for the exact price and sends back what's unused.
 */
export function ethToSend(quote: bigint): bigint {
  const roomy = (quote * 103n) / 100n;
  const digits = roomy.toString().length;
  if (digits <= 2) return roomy;
  const unit = 10n ** BigInt(digits - 2);
  return ((roomy + unit - 1n) / unit) * unit;
}

class Plain extends Error {}

/** Some wallets never answer a prompt that was closed, and nothing should wait forever on one. */
const WALLET_PATIENCE = 120_000;
function answered<T>(prompt: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Plain("Your wallet hasn't answered. Try again.")), WALLET_PATIENCE);
  });
  return Promise.race([prompt, late]).finally(() => clearTimeout(timer));
}

/** A failure in words that say whether anything happened and what to do next. */
function explain(error: unknown): string {
  if (error instanceof Plain) return error.message;
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) return "You cancelled in your wallet. Nothing was sent.";
    const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    switch (reverted?.data?.errorName) {
      case "EthShort":
        return "The price moved just now. Nothing was sent. Try again.";
      case "IncompleteSwap":
        return "The pool can't fill this right now. Nothing was sent. Pay in IMD, or try later.";
      case "NotSold":
        return "IMD isn't taking questions on this contract right now. Nothing was sent.";
      case "TextTooLong":
      case "NotAscii":
      case "EmptyText":
        return "The contract refused this text. Nothing was sent. Check both boxes.";
    }
    if (/insufficient funds/i.test(error.message)) return "This wallet doesn't have enough to pay and cover gas. Nothing was sent.";
    if (/timed? ?out|Timeout/i.test(error.message)) return "The network isn't answering. Nothing was sent. Try again.";
  }
  return "That didn't go through. Nothing was sent. Try again.";
}

export type AskInput = { rule: string; proof: string; pay: Pay; asset: Address; price: bigint; symbol: string; poolFee: number; poolTickSpacing: number };

export function useAsk(onOpened: (id: number) => void) {
  const config = useConfig();
  const { address, chainId } = useConnection();
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);

  const ask = useCallback(
    async (input: AskInput) => {
      if (!address) return;
      setError(null);
      // Once a transaction is out, no failure may say "nothing was sent" and invite a second payment.
      let out: "approval" | "ask" | null = null;
      try {
        const { chainId: wanted, judge, abi, door } = site();
        const client = getPublicClient(config, { chainId: wanted })!;
        if (chainId !== wanted) {
          setStage("switching");
          await answered(switchChain(config, { chainId: wanted }));
        }

        let call;
        if (input.pay === "eth" && door) {
          const quoted = await quoteEth(client, input.asset, input.price, input.poolFee, input.poolTickSpacing).catch(() => {
            throw new Plain("The pool can't price this right now. Nothing was sent. Pay in IMD, or try later.");
          });
          const value = ethToSend(quoted);
          const held = await client.getBalance({ address });
          if (held < value) throw new Plain(`You need ${amount(value)} ETH plus gas. This wallet has ${amount(held)}.`);
          call = { address: door.address, abi: door.abi, functionName: "ask", args: [input.rule, input.proof], account: address, value } as const;
        } else {
          const held = await readContract(config, { address: input.asset, abi: erc20Abi, functionName: "balanceOf", args: [address] });
          if (held < input.price) throw new Plain(`You need ${amount(input.price)} ${input.symbol}. This wallet has ${amount(held)}.`);
          const allowed = await readContract(config, { address: input.asset, abi: erc20Abi, functionName: "allowance", args: [address, judge] });
          if (allowed < input.price) {
            setStage("approve");
            const request = { address: input.asset, abi: erc20Abi, functionName: "approve", args: [judge, input.price], account: address } as const;
            const gas = await client.estimateContractGas(request);
            const hash = await answered(writeContract(config, { ...request, gas: withRoom(gas) }));
            out = "approval";
            setStage("approving");
            const receipt = await waitForTransactionReceipt(config, { hash, timeout: 180_000 });
            if (receipt.status !== "success") throw new Plain("The approval failed. Only gas was spent. Try again.");
            out = null;
          }
          call = { address: judge, abi, functionName: "ask", args: [input.rule, input.proof], account: address } as const;
        }

        setStage("confirm");
        await simulateContract(config, call);
        const gas = await client.estimateContractGas(call);
        const hash = await answered(writeContract(config, { ...call, gas: withRoom(gas) }));
        out = "ask";
        setStage("sending");
        const receipt = await waitForTransactionReceipt(config, { hash, timeout: 180_000 });
        if (receipt.status !== "success") throw new Plain("The transaction failed. Only gas was spent. Try again.");

        for (const log of receipt.logs) {
          if (log.address.toLowerCase() !== judge.toLowerCase()) continue;
          try {
            const event = decodeEventLog({ abi, data: log.data, topics: log.topics });
            if (event.eventName === "Asked") {
              const id = Number((event.args as unknown as { id: bigint }).id);
              rememberCase(id, input.rule, input.proof);
              setStage("idle");
              onOpened(id);
              return;
            }
          } catch {
            // another of this contract's events
          }
        }
        throw new Plain("Your question was sent. It will appear below in a moment.");
      } catch (e) {
        if (e instanceof Plain || !out) setError(explain(e));
        else if (out === "ask") setError("Your question was sent, but this page lost sight of it. Check your wallet before trying again: if it went through, it appears below.");
        else setError("Your approval was sent, but this page lost sight of it. Check your wallet, then try again.");
        setStage("idle");
      }
    },
    [address, chainId, config, onOpened],
  );

  return { ask, stage, error, clearError: () => setError(null) };
}
