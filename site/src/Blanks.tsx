import { useRef, useState, type ReactNode } from "react";
import type { Address } from "viem";
import { normalize } from "viem/ens";
import { useConfig } from "wagmi";
import { getEnsAddress } from "wagmi/actions";
import { FORMS, blanksOf, firstProblem, problemOf, requestOf, type Blank, type Values } from "./blank-forms";

/** What Launch it's Pay button needs from the blanks. */
export type Ready = {
  /** Marks every blank that isn't ready and says what to fix first, or null when all are. */
  check: () => { text: string; focus: () => void } | null;
  /** What to fix first as the blanks stand now, without marking anything. */
  missing: () => string | null;
  /** IMD's request, once a wallet is in. */
  request: (me: Address) => Promise<string>;
};

/** What was typed for each use, kept while the reader switches tabs or uses. */
const drafts = new Map<number, Values>();

/** A suggested amount starts filled in; what only the launcher knows starts blank. */
const startOf = (use: number): Values =>
  Object.fromEntries(
    blanksOf(FORMS[use]!)
      .filter((blank) => blank.kind === "eth" || blank.kind === "count")
      .map((blank) => [blank.key, blank.example]),
  );

/** "How much ETH" reads "how much ETH" mid-sentence, not "how much eth". */
const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

const sayFirst = ({ blank, problem }: { blank: Blank; problem: string }) =>
  problem === "Fill this in" ? `Fill in ${lower(blank.label)}.` : `${blank.label}: ${lower(problem)}.`;

/**
 * Launch it: the use as one sentence with its blanks in it. Pay writes IMD's request from them, so
 * nobody writes a spec and nothing launches with "alice" in it.
 */
export function Blanks({ use, children }: { use: number; children: (ready: Ready) => ReactNode }) {
  const form = FORMS[use]!;
  const config = useConfig();
  const [values, setValues] = useState<Values>(() => drafts.get(use) ?? startOf(use));
  // a blank shows it's wrong only after Pay was pressed, then checks itself as it's typed in
  const [wrong, setWrong] = useState<Record<string, boolean>>({});
  const inputs = useRef(new Map<string, HTMLInputElement>());

  const set = (blank: Blank, value: string) => {
    const next = { ...values, [blank.key]: value };
    drafts.set(use, next);
    setValues(next);
    if (wrong[blank.key] !== undefined) setWrong((now) => ({ ...now, [blank.key]: !!problemOf(blank, value) }));
  };

  const ready: Ready = {
    check: () => {
      setWrong(Object.fromEntries(blanksOf(form).map((blank) => [blank.key, !!problemOf(blank, values[blank.key] ?? "")])));
      const first = firstProblem(form, values);
      return first ? { text: sayFirst(first), focus: () => inputs.current.get(first.blank.key)?.focus() } : null;
    },
    missing: () => {
      const first = firstProblem(form, values);
      return first ? sayFirst(first) : null;
    },
    request: (me) =>
      requestOf(form, values, me, async (name) => {
        try {
          return await getEnsAddress(config, { name: normalize(name), chainId: 1 });
        } catch {
          return null;
        }
      }),
  };

  const input = (blank: Blank) => {
    const value = values[blank.key] ?? "";
    return (
      <input
        key={blank.key}
        ref={(el) => {
          if (el) inputs.current.set(blank.key, el);
          else inputs.current.delete(blank.key);
        }}
        className="blank"
        aria-label={blank.label}
        aria-invalid={!!wrong[blank.key]}
        placeholder={blank.example}
        value={value}
        // as wide as what's in it, where field-sizing isn't supported
        size={Math.max((value || blank.example).length, 2)}
        inputMode={blank.kind === "eth" ? "decimal" : blank.kind === "count" ? "numeric" : undefined}
        enterKeyHint="go"
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={blank.kind === "words"}
        onChange={(event) => set(blank, event.target.value)}
      />
    );
  };

  const sentence: ReactNode[] = [];
  for (let i = 0; i < form.pieces.length; i++) {
    const piece = form.pieces[i]!;
    if (typeof piece === "string") {
      sentence.push(<span key={i}>{piece}</span>);
      continue;
    }
    const next = form.pieces[i + 1];
    const mark = typeof next === "string" ? /^[.,:;]/.exec(next)?.[0] : undefined;
    if (!mark) {
      sentence.push(input(piece));
      continue;
    }
    // a full stop stays on the line of the blank it ends
    sentence.push(
      <span key={piece.key} className="blank-end">
        {input(piece)}
        {mark}
      </span>,
    );
    if ((next as string).length > 1) sentence.push(<span key={i + 1}>{(next as string).slice(1)}</span>);
    i++;
  }

  return (
    // Enter in a blank presses Pay, the form's first button
    <form onSubmit={(event) => event.preventDefault()}>
      <div className="prompt">
        <p className="blanks">{sentence}</p>
      </div>
      {children(ready)}
    </form>
  );
}
