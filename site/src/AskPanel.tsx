import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConfig, useConnection, usePublicClient } from "wagmi";
import { readContract } from "wagmi/actions";
import { erc20Abi, site } from "./deployment";
import { useJudge } from "./cases";
import { ethToSend, quoteEth, useAsk, type Pay, type Stage } from "./ask";
import { EXAMPLES, MAX_PROOF, MAX_RULE, amount, problemWith, straighten } from "./text";
import { useWalletSheet } from "./wallet";

const stageWords: Partial<Record<Stage, string>> = {
  switching: "Switching network…",
  approving: "Approving…",
  confirm: "Confirm in your wallet",
  sending: "Sending your question…",
};

type Field = "rule" | "proof";

const draftOf = (field: Field) => new URLSearchParams(location.hash.split("?")[1] ?? "").get(field) ?? "";

/** The one action on the page: the two boxes and the way to pay. */
export function AskForm({ onOpened, example }: { onOpened: (id: number) => void; example: { rule: string; proof: string } }) {
  const [rule, setRule] = useState(() => draftOf("rule"));
  const [proof, setProof] = useState(() => draftOf("proof"));
  const [picked, setPicked] = useState<Pay | null>(null);
  const [shown, setShown] = useState<Partial<Record<Field, string>>>({});
  const ruleBox = useRef<HTMLTextAreaElement>(null);
  const proofBox = useRef<HTMLTextAreaElement>(null);

  const config = useConfig();
  const client = usePublicClient();
  const { open, isOpen } = useWalletSheet();
  const { address, isConnected } = useConnection();
  const { data: judge, isError: judgeFailed, refetch: refetchJudge } = useJudge();
  const { ask, stage, error, clearError } = useAsk(onOpened);
  const paysInEth = !!site().door;

  const pay: Pay = picked ?? (paysInEth ? "eth" : "imd");

  // A mouse reader can start typing at once. On a phone the keyboard would cover the page,
  // and a tab opened from the keyboard keeps its focus.
  useEffect(() => {
    const fresh = !document.activeElement || document.activeElement === document.body;
    if (fresh && matchMedia("(pointer: fine)").matches && !ruleBox.current?.value) ruleBox.current?.focus();
  }, []);

  // The draft lives in the URL, so it survives a reload and the jump into a wallet's own browser.
  // Written after a pause: Safari throws past 100 writes in a short while.
  const saveDraft = useCallback(() => {
    if (!location.hash.startsWith("#/ask")) return;
    const query = new URLSearchParams(Object.entries({ rule, proof }).filter(([, text]) => text)).toString();
    try {
      history.replaceState(null, "", `#/ask${query ? `?${query}` : ""}`);
    } catch {
      // the draft stays in the boxes; only the URL missed it
    }
  }, [rule, proof]);
  useEffect(() => {
    const timer = setTimeout(saveDraft, 300);
    return () => clearTimeout(timer);
  }, [saveDraft]);

  const symbol = judge?.symbol ?? "IMD";

  const quote = useQuery({
    queryKey: ["quote", judge?.price?.toString()],
    enabled: !!judge && paysInEth,
    refetchInterval: 30_000,
    queryFn: () => quoteEth(client!, judge!.asset, judge!.price, judge!.poolFee, judge!.poolTickSpacing),
  });

  const held = useQuery({
    queryKey: ["held", address, pay, judge?.asset],
    enabled: !!address && !!judge,
    refetchInterval: 30_000,
    queryFn: async () =>
      pay === "eth" ? client!.getBalance({ address: address! }) : readContract(config, { address: judge!.asset, abi: erc20Abi, functionName: "balanceOf", args: [address!] }),
  });

  const allowed = useQuery({
    queryKey: ["allowed", address, judge?.asset],
    enabled: !!address && !!judge && pay === "imd",
    queryFn: () => readContract(config, { address: judge!.asset, abi: erc20Abi, functionName: "allowance", args: [address!, site().judge] }),
  });

  const { refetch: refetchHeld } = held;
  const { refetch: refetchAllowed } = allowed;
  useEffect(() => {
    if (stage !== "idle" || !address) return;
    void refetchHeld();
    void refetchAllowed();
  }, [stage, address, refetchHeld, refetchAllowed]);

  // ETH is the only way to pay until the wallet holds enough IMD to pay in it.
  const imdHeld = useQuery({
    queryKey: ["held", address, "imd", judge?.asset],
    enabled: !!address && !!judge && paysInEth,
    refetchInterval: 30_000,
    queryFn: () => readContract(config, { address: judge!.asset, abi: erc20Abi, functionName: "balanceOf", args: [address!] }),
  });
  const offerImd = paysInEth && (picked === "imd" || (!!judge && imdHeld.data !== undefined && imdHeld.data >= judge.price));

  const needsApproval = pay === "imd" && !!judge && allowed.data !== undefined && allowed.data < judge.price;
  const busy = stage !== "idle";

  // exactly what the wallet will be asked to send
  const price = pay === "eth" ? (quote.data !== undefined ? `${amount(ethToSend(quote.data))} ETH` : "in ETH") : judge ? `${amount(judge.price)} ${symbol}` : `in ${symbol}`;

  const label = stage === "approve" ? `Approve ${judge ? amount(judge.price) : ""} ${symbol} in your wallet` : (stageWords[stage] ?? `Pay ${price}`);

  // Once a box has shown an error it checks itself as you type, and not before.
  useEffect(() => {
    setShown((now) => {
      const next = { ...now };
      if (now.rule) next.rule = problemWith(straighten(rule), MAX_RULE) ?? undefined;
      if (now.proof) next.proof = problemWith(straighten(proof), MAX_PROOF) ?? undefined;
      return next;
    });
  }, [rule, proof]);

  const submit = () => {
    if (busy) return;
    clearError();
    const cleanRule = straighten(rule);
    const cleanProof = straighten(proof);
    const ruleProblem = problemWith(cleanRule, MAX_RULE);
    const proofProblem = problemWith(cleanProof, MAX_PROOF);
    setShown({ rule: ruleProblem ?? undefined, proof: proofProblem ?? undefined });
    if (ruleProblem) return ruleBox.current?.focus();
    if (proofProblem) return proofBox.current?.focus();
    if (!isConnected) {
      saveDraft();
      setAfterConnect(true);
      return open();
    }
    if (!judge) return void refetchJudge();
    void ask({ rule: cleanRule, proof: cleanProof, pay, asset: judge.asset, price: judge.price, symbol, poolFee: judge.poolFee, poolTickSpacing: judge.poolTickSpacing });
  };

  // Pay carries on after connecting, unless the sheet was closed without a wallet.
  const [afterConnect, setAfterConnect] = useState(false);
  const carryOn = useRef(submit);
  carryOn.current = submit;
  useEffect(() => {
    if (!afterConnect) return;
    if (isConnected) {
      setAfterConnect(false);
      carryOn.current();
    } else if (!isOpen) {
      setAfterConnect(false);
    }
  }, [afterConnect, isConnected, isOpen]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
  };

  return (
    <form
      className="ask-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="box box-rule">
        <span className="box-head">
          Your question
          {shown.rule && <em>{shown.rule}</em>}
        </span>
        <textarea ref={ruleBox} rows={1} value={rule} placeholder={example.rule} aria-invalid={!!shown.rule} onChange={(e) => setRule(e.target.value)} onKeyDown={onKey} />
      </label>
      <label className="box">
        <span className="box-head">
          Your proof
          {shown.proof && <em>{shown.proof}</em>}
        </span>
        <textarea ref={proofBox} rows={1} value={proof} placeholder={example.proof} aria-invalid={!!shown.proof} onChange={(e) => setProof(e.target.value)} onKeyDown={onKey} />
      </label>
      <div className="ask-row">
        <span>
          Try{" "}
          {EXAMPLES.map((example, i) => (
            <span key={example.label}>
              {i > 0 && (i === EXAMPLES.length - 1 ? " or " : ", ")}
              <button
                type="button"
                className="link"
                onClick={() => {
                  setRule(example.rule);
                  setProof(example.proof);
                  setShown({});
                  clearError();
                }}
              >
                {example.label}
              </button>
            </span>
          ))}
        </span>
        {offerImd && (
          <div className="choice" role="radiogroup" aria-label="Pay in">
            <span>Pay in</span>
            {(["eth", "imd"] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={pay === option}
                disabled={busy}
                onClick={() => {
                  setPicked(option);
                  clearError();
                }}
              >
                {option === "eth" ? "ETH" : symbol}
              </button>
            ))}
          </div>
        )}
      </div>
      <button className="pill" type="submit" disabled={busy} aria-busy={busy}>
        {label}
      </button>
      {error || (judgeFailed && !judge) ? (
        <p className="ask-line ask-error" role="alert">
          {error ?? "The network isn't answering. Try again in a moment."}
        </p>
      ) : needsApproval && !busy ? (
        <p className="ask-line">Two confirmations: approve {symbol}, then ask.</p>
      ) : held.data !== undefined && !busy ? (
        <p className="ask-line">
          This wallet has {amount(held.data)} {pay === "eth" ? "ETH" : symbol}.
        </p>
      ) : null}
    </form>
  );
}
