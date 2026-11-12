import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { useConfig, useConnection, usePublicClient } from "wagmi";
import { ethToSend, quoteEth } from "./ask";
import { REPOSITORY, site } from "./deployment";
import { useCaseCount, useCaseOnChain, useCasePanel, useCaseRows, useJudge, type Verdict } from "./cases";
import { AskForm } from "./AskPanel";
import { CasePage, Seats } from "./CasePage";
import { headline } from "./imd";
import { INSTALL, INSTALL_WITH_OZ, asFile } from "./snippet";
import { USES } from "./uses";
import { amount, short, timeAgo, took } from "./text";
import { copyText } from "./clipboard";
import { useWalletSheet } from "./wallet";
import { payWords, priceOfBuild } from "./imd-api";
import type { Again } from "./imd-job";
import { Blanks, type Ready } from "./Blanks";

type Tab = "launch" | "agent" | "contract" | "ask";
type Route = { page: "home"; tab: Tab } | { page: "case"; id: number };

function readRoute(): Route {
  const match = /^#\/case\/(\d+)$/.exec(location.hash);
  if (match?.[1]) return { page: "case", id: Number(match[1]) };
  const tab: Tab = location.hash.startsWith("#/ask") ? "ask" : location.hash.startsWith("#/contract") ? "contract" : location.hash.startsWith("#/agent") ? "agent" : "launch";
  return { page: "home", tab };
}

/** Set when a case opens from the form: the words just typed travel to where they now live. */
let travelNext = false;

/** Where Ask here leads: back to the words typed before looking at another tab. */
let lastAsk = "#/ask";

function useRoute(): Route {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    let shown = readRoute();
    const update = () => {
      const next = readRoute();
      // a tab changes only what is under the tabs, so the page stays where the reader is
      const sameHome = next.page === "home" && shown.page === "home";
      const apply = () => {
        flushSync(() => setRoute(next));
        if (!sameHome) scrollTo(0, 0);
      };
      const travel = travelNext && "startViewTransition" in document && !matchMedia("(prefers-reduced-motion: reduce)").matches;
      travelNext = false;
      shown = next;
      if (travel) document.startViewTransition(apply);
      else apply();
    };
    addEventListener("hashchange", update);
    return () => removeEventListener("hashchange", update);
  }, []);
  return route;
}

function Header() {
  return (
    <header className="head">
      <a className="mark" href="#/">
        judge
      </a>
      <div className="tools">
        <a className="icon-button" href={REPOSITORY} aria-label="GitHub">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
              fill="currentColor"
              d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"
            />
          </svg>
        </a>
      </div>
    </header>
  );
}

const KEYWORD = /^(import|from|contract|is|function|external|internal|public|payable|override|constant|immutable|address|string|calldata|memory|uint256|bool|mapping|new|if|return)$/;

/** A code line that wraps on a phone hangs under its own indent, and never scrolls sideways. */
function Line({ text }: { text: string }) {
  const hang = text.length - text.trimStart().length + 2;
  // A comment starts at "// " on its own, so the "//" inside a URL stays code.
  const [, code = "", gap, comment] = /^(.*?)(?:(\s+|^)(\/\/ .*))?$/.exec(text) ?? [];
  return (
    <span className="ln" style={{ "--hang": hang } as React.CSSProperties}>
      {code.split(/("[^"]*"|\b[a-zA-Z0-9_]+\b)/).map((piece, i) =>
        KEYWORD.test(piece) ? (
          <span key={i} className="code-word">
            {piece}
          </span>
        ) : piece === "onYes" ? (
          <span key={i} className="code-yes">
            onYes
          </span>
        ) : (
          // Breaks at a slash or before a quoted string, so a call like address(this) stays whole.
          piece.split(/(?<=\/)|(?<=\()(?=")/).map((part, j) => (
            <span key={`${i}.${j}`}>
              {j > 0 && <wbr />}
              {part}
            </span>
          ))
        ),
      )}
      {gap}
      {comment && <span className="code-note">{comment}</span>}
    </span>
  );
}

function Code({ lines }: { lines: readonly string[] }) {
  return (
    <pre className="step-code">
      <code>
        {lines.map((text, i) => (
          <Line key={i} text={text} />
        ))}
      </code>
    </pre>
  );
}

export function CopyButton({ text, label, next, wide, onCopied }: { text: string; label: string; next?: boolean; wide?: boolean; onCopied?: () => void }) {
  const [copied, setCopied] = useState<"" | "Copied" | "Couldn't copy">("");
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(""), 1600);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = () => {
    void copyText(text).then((ok) => {
      setCopied(ok ? "Copied" : "Couldn't copy");
      if (ok) onCopied?.();
    });
  };
  // the tab's one action, as wide as the box, like Pay on Ask here
  if (wide) {
    return (
      <button className="pill" aria-label={label} onClick={copy}>
        {copied || "Copy"}
      </button>
    );
  }
  return (
    <button
      className="copy"
      aria-label={label}
      data-next={!!next && !copied}
      data-done={!!copied}
      onClick={copy}
    >
      <span>{copied || "Copy"}</span>
    </button>
  );
}

/** The line typed in the words box for a use, kept while the reader looks at another tab. */
let wishDraft: { use: number; text: string } | null = null;

/**
 * For your agent's words box: the fixed line that points at the skill, then what you want in your own
 * words, for your AI to build. Your AI can ask who "alice" is; Launch it can't, so it asks in blanks.
 */
function Prompt({ use }: { use: number }) {
  const [wish, setShown] = useState(() => (wishDraft?.use === use ? wishDraft.text : USES[use]!.prompt));
  const setWish = (text: string) => {
    wishDraft = { use, text };
    setShown(text);
  };
  const box = useRef<HTMLTextAreaElement>(null);
  const skill = new URL("skill.md", location.href).href;
  useLayoutEffect(() => {
    const area = box.current;
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${area.scrollHeight}px`;
  });
  return (
    <>
      <div className="prompt">
        <p className="prompt-fixed">
          Read and follow <a href={skill}>{skill.replace(/^https?:\/\//, "")}</a>
        </p>
        <textarea ref={box} rows={1} aria-label="What you want your contract to do" spellCheck={false} value={wish} onChange={(event) => setWish(event.target.value)} />
      </div>
      <div className="prompt-copy">
        <CopyButton text={`Read and follow ${skill}\n\n${wish}`} label="Copy this for your AI" wide />
      </div>
      <p className="agent-line">Paste this into Claude Code, Cursor or any AI that writes code.</p>
    </>
  );
}

/** Launch it's Pay: the blanks, checked before the wallet opens, sent to IMD's swarm as a paid build-and-launch job. */
function ImdBuild({ ready }: { ready: Ready }) {
  const config = useConfig();
  const { address, isConnected } = useConnection();
  const { open, isOpen } = useWalletSheet();
  const [stage, setStage] = useState<string | null>(null);
  // while the wallet stays silent on a signature, the button asks it again
  const [again, setAgain] = useState<Again | null>(null);
  const onStage = (next: string, ask?: Again) => {
    setStage(next);
    setAgain(ask ?? null);
  };
  // `blanks`: what's missing, said again as the blanks change, so it never names one already filled
  const [error, setError] = useState<{ text: string; short: boolean; blanks?: boolean } | null>(null);
  const [built, setBuilt] = useState<{ jobUrl: string | null } | null>(null);
  const said = useRef<HTMLParagraphElement>(null);

  // IMD from a wallet that holds it, else the ETH that buys it; the last price stays up while the next loads
  const price = useQuery({
    queryKey: ["launch-price", address ?? null],
    queryFn: () => priceOfBuild(config, address),
    placeholderData: (last) => last,
    refetchInterval: 60_000,
  });
  const words = price.data ? payWords(price.data) : "Pay 0.5 IMD and launch";

  // a failure or the result can land below the fold, so it scrolls up into view
  useEffect(() => {
    if (error || built) said.current?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [error, built]);

  // Pay carries on after connecting, unless the sheet closed without a wallet or the wallet changes what Pay asks for
  const [afterConnect, setAfterConnect] = useState<string | null>(null);
  const go = async () => {
    if (stage) return;
    setError(null);
    const problem = ready.check();
    if (problem) {
      setError({ text: problem.text, short: false, blanks: true });
      return problem.focus();
    }
    if (!isConnected || !address) {
      setAfterConnect(words);
      return open();
    }
    setStage("Starting…");
    try {
      let request: string;
      try {
        request = await ready.request(address);
      } catch (e) {
        return setError({ text: e instanceof Error ? e.message : "A name in the blanks didn't resolve. Use the 0x address instead.", short: false });
      }
      const job = await import("./imd-job");
      try {
        setBuilt(await job.buyBuild(config, request, onStage, price.data ?? { pays: "imd", amount: HALF_IMD, imd: HALF_IMD }));
      } catch (e) {
        setError({ text: job.explainBuild(e), short: e instanceof job.ShortOfImd });
      }
    } catch {
      setError({ text: "This page couldn't load the payment step. Nothing was paid. Reload and try again.", short: false });
    } finally {
      setStage(null);
      setAgain(null);
      // a swap, or a price that moved, changes what Pay asks for next
      void price.refetch();
    }
  };
  const carryOn = useRef(go);
  carryOn.current = go;
  useEffect(() => {
    if (afterConnect === null) return;
    if (!isConnected) {
      if (!isOpen) setAfterConnect(null);
      return;
    }
    if (price.isPlaceholderData || price.isFetching || !price.data) return;
    setAfterConnect(null);
    if (payWords(price.data) === afterConnect) void carryOn.current();
  }, [afterConnect, isConnected, isOpen, price.data, price.isPlaceholderData, price.isFetching]);

  const missing = error?.blanks ? ready.missing() : null;
  const shown = error?.blanks ? (missing ? { ...error, text: missing } : null) : error;

  if (built) {
    return (
      <>
        {built.jobUrl && (
          <div className="prompt-copy">
            <a className="pill" href={built.jobUrl}>
              Follow the build
            </a>
          </div>
        )}
        <p className="agent-line" ref={said} role="status">
          {built.jobUrl ? "Sent. IMD's swarm is building it." : "Sent. The job shows on IMD's explorer under your wallet in a few minutes."}
        </p>
      </>
    );
  }
  return (
    <>
      <div className="prompt-copy">
        <button className="pill" onClick={() => (again ? again.ask() : void go())} disabled={!!stage && !again} aria-busy={!!stage && !again}>
          {again?.label ?? stage ?? words}
        </button>
      </div>
      {again ? (
        <p className="agent-line" role="status">
          Nothing in your wallet? Open it, or ask again.
        </p>
      ) : shown ? (
        <p className="agent-line ask-error" ref={said} role="alert">
          {shown.text}
          {shown.short && (
            <>
              {" "}
              <a href="https://imd.fun/buy/">Get IMD</a>
            </>
          )}
        </p>
      ) : (
        <p className="agent-line">IMD builds a site and launches the contract for your idea. Another agent audits the contract first.</p>
      )}
    </>
  );
}

const HALF_IMD = 5n * 10n ** 17n;

function CodeBox({ lines }: { lines: readonly string[] }) {
  return (
    <div className="code-box">
      <CopyButton text={asFile(lines)} label="Copy this code" />
      <Code lines={lines} />
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="st">
      <span className="st-n" aria-hidden="true">
        {n}
      </span>
      <h3>{title}</h3>
      {children}
    </li>
  );
}

const TABS: Array<[Tab, string]> = [
  ["launch", "Launch it"],
  ["agent", "For your agent"],
  ["contract", "In a contract"],
  ["ask", "Ask here"],
];

/** Four ways in. Each is its own address, so a reload or a shared link opens the same one. */
function Tabs({ tab }: { tab: Tab }) {
  const row = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  // The grey pill sits under the open tab and slides to the next one.
  useLayoutEffect(() => {
    const list = row.current;
    const mark = pill.current;
    if (!list || !mark) return;
    const place = () => {
      const open = list.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!open) return;
      mark.style.width = `${open.offsetWidth}px`;
      mark.style.height = `${open.offsetHeight}px`;
      mark.style.transform = `translate(${open.offsetLeft}px, ${open.offsetTop}px)`;
    };
    place();
    const watch = new ResizeObserver(place);
    list.querySelectorAll("[role=tab]").forEach((button) => watch.observe(button));
    // it slides only once the font has landed, so the page never opens with it moving
    let live = true;
    void document.fonts.ready.then(() => requestAnimationFrame(() => live && mark.classList.add("is-placed")));
    return () => {
      live = false;
      watch.disconnect();
    };
  }, [tab]);
  const go = (to: Tab) => {
    if (to === tab) return;
    // the words typed in Ask here wait there for the reader to come back
    if (tab === "ask") lastAsk = location.hash;
    location.hash = to === "ask" ? lastAsk : to === "contract" ? "#/contract" : to === "agent" ? "#/agent" : "#/";
  };
  // arrows move between the tabs; Enter or a click opens one
  const move = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = buttons[(at + (event.key === "ArrowRight" ? 1 : buttons.length - 1)) % buttons.length];
    next?.focus();
    event.preventDefault();
  };
  return (
    <div ref={row} className="tabs" role="tablist" aria-label="Ways to use Judge" onKeyDown={move}>
      <span ref={pill} className="tab-pill" aria-hidden="true" />
      {TABS.map(([key, words]) => (
        <button key={key} id={`tab-${key}`} role="tab" aria-selected={tab === key} aria-controls="tab-panel" tabIndex={tab === key ? 0 : -1} onClick={() => go(key)}>
          {words}
        </button>
      ))}
    </div>
  );
}

/** The whole agent path: the skill does the rest, testing first and nothing live without a yes. */
function AgentSteps({ use }: { use: number }) {
  return (
    <div className="agent">
      <Prompt key={use} use={use} />
    </div>
  );
}

/** The use as a sentence with blanks, and IMD builds, audits and launches it. */
function LaunchSteps({ use }: { use: number }) {
  return (
    <div className="agent launch">
      <Blanks key={use} use={use}>
        {(ready) => <ImdBuild ready={ready} />}
      </Blanks>
    </div>
  );
}

function ContractSteps({ use }: { use: number }) {
  const { code } = USES[use]!;
  const install = code.needsOpenZeppelin ? INSTALL_WITH_OZ : INSTALL;
  return (
    <ol className="steps">
      <Step n={1} title="Install it">
        <p>
          Run this in your project. It uses <a href="https://getfoundry.sh">Foundry</a>. Not on Foundry? <a href={`${REPOSITORY}#add-it`}>Copy the one file</a> instead.
        </p>
        <div className="code-box code-one">
          <code>{install}</code>
          <CopyButton text={install} label="Copy the install command" />
        </div>
      </Step>
      <Step n={2} title="Add it to your contract">
        <p>
          Inherit <code>Judged</code>. Ask with <code>ask</code>, and say what happens on a yes in <code>onYes</code>. Swap in your own question and address.
        </p>
        <CodeBox lines={code.contract} />
      </Step>
      <Step n={3} title="Test it for free">
        <p>
          Run <code>forge test</code>. A stand-in answers, so it costs nothing and takes no time.
        </p>
        <CodeBox lines={code.test} />
      </Step>
    </ol>
  );
}

const verdictWord: Record<Verdict, string> = { Pending: "Voting", Yes: "Yes", No: "No", NoAnswer: "No answer" };

export function CaseRows({ skip, quietWhenEmpty, title }: { skip?: number; quietWhenEmpty?: boolean; title?: string }) {
  const { data: count, isError: countFailed, refetch: refetchCount } = useCaseCount();
  const rows = useCaseRows();
  const shown = rows.data?.filter((row) => row.id !== skip);
  const { testnet, chainName } = site();
  if (skip && shown?.length === 0) return null;
  if (quietWhenEmpty && count === 0) return null;
  return (
    <section className="section cases" aria-labelledby="cases-title">
      <h2 id="cases-title">
        {title ?? (skip ? "Other questions" : "Latest questions")}
        {testnet && <span className="aside">Test questions on {chainName}</span>}
      </h2>
      {(rows.isError || countFailed) && !rows.data ? (
        <p className="quiet">
          These didn't load.{" "}
          <button
            className="link"
            onClick={() => {
              void refetchCount();
              void rows.refetch();
            }}
          >
            Try again
          </button>
        </p>
      ) : count === 0 ? (
        <p className="quiet">No questions yet. Yours can be the first.</p>
      ) : (
        <ol>
          {(shown ?? Array.from({ length: 3 }, () => null)).map((row, i) =>
            row ? (
              <li key={row.id}>
                <a className="row" href={`#/case/${row.id}`}>
                  <span className="row-rule">{row.rule ?? `Question ${row.id}`}</span>
                  <time className="row-time">{timeAgo(row.askedAt)}</time>
                  <span className={`row-verdict v-${row.verdict}`}>{verdictWord[row.verdict]}</span>
                </a>
              </li>
            ) : (
              <li key={i} className="row row-empty" aria-hidden="true" />
            ),
          )}
        </ol>
      )}
    </section>
  );
}

/** What a developer checks before trusting it: the code, the contract, who controls it and what it rests on. */
function Footer() {
  const { explorer, judge } = site();
  return (
    <footer className="foot">
      <dl className="facts">
        <div>
          <dt>Open source</dt>
          <dd>
            <a href={REPOSITORY}>Code and tests on GitHub</a>, MIT license. The contract is <a href={`${REPOSITORY}/blob/main/src/Judge.sol`}>164 lines</a>.
          </dd>
        </div>
        <div>
          <dt>Contract</dt>
          <dd>
            <a href={`${explorer}/address/${judge}`}>{short(judge)}</a> on Ethereum, <a href={`https://repo.sourcify.dev/1/${judge}`}>source verified</a>.
          </dd>
        </div>
        <div>
          <dt>Owner</dt>
          <dd>None. It takes no fee, and nobody can change it.</dd>
        </div>
        <div>
          <dt>Answers</dt>
          <dd>
            AI agents on <a href="https://imd.fun">IMD</a> vote, one IMD key signs the result, and the contract checks the signature. A vote can be wrong, so read the{" "}
            <a href={`${REPOSITORY}#what-it-depends-on`}>risks</a> before you put money on one.
          </dd>
        </div>
      </dl>
    </footer>
  );
}

/** The newest real answer, so the page shows what it says before it explains it. */
function LatestAnswer({ id }: { id: number }) {
  // id 0 is the count still loading: the card holds its size and asks for nothing
  const chain = useCaseOnChain(id, id > 0);
  const panel = useCasePanel(id, chain.data);
  const { data: judge } = useJudge();
  const verdict = chain.data?.verdict;
  const words = panel.data ?? null;
  const votes = words?.votes ?? [];
  const yes = votes.filter((vote) => vote.yes).length;
  const record = words?.record;
  const time = record?.attestedAt ? took(record.createdAt, record.attestedAt) : "";
  const line =
    verdict === "Pending"
      ? votes.length
        ? `${yes} yes, ${votes.length - yes} no so far`
        : "The agents are reading it"
      : verdict === "NoAnswer"
        ? "Nothing was signed"
        : verdict && votes.length
          ? `${yes} to ${votes.length - yes}${time ? `, in ${time}` : ""}`
          : "";
  return (
    <a className="latest" href={`#/case/${id}`}>
      <span className="latest-rule">{words?.rule ?? " "}</span>
      {/* the answer beside the votes that made it */}
      <span className="latest-vote">
        <b className={`v-${verdict ?? "Pending"}`}>{verdict ? headline[verdict] : " "}</b>
        <Seats panelSize={judge?.panelSize ?? 100} votes={votes} live={verdict === "Pending"} fill />
      </span>
      <span className="latest-line">
        <span>{line}</span>
        <time>{chain.data?.askedAt ? timeAgo(chain.data.askedAt) : ""}</time>
      </span>
    </a>
  );
}


/** One part of the page under its own heading, set off by a hairline. */
function Section({ id, title, className, children }: { id: string; title: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={className ? `section ${className}` : "section"} aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  );
}

/** Where it lives, so a reader knows it's a real contract on a real chain. */
function Chain() {
  const { chainName, explorer, judge } = site();
  return (
    <p className="chain">
      <svg width="16" height="16" viewBox="-3 0 16 16" aria-hidden="true">
        <path d="M5 0 0 8.15 5 11.1 10 8.15zM5 12.05 0 9.1 5 16 10 9.1z" fill="currentColor" />
      </svg>
      <span>
        Live on {chainName} at <a href={`${explorer}/address/${judge}`}>{short(judge)}</a>
      </span>
    </p>
  );
}

/** What it's good for, as the first pick: a tile picks the use the four ways below it show. */
function Uses({ picked, onPick }: { picked: number; onPick: (use: number) => void }) {
  return (
    <div className="uses" role="group" aria-label="What it's good for">
      {USES.map((use, i) => (
        <button key={use.name} data-hue={use.hue} aria-pressed={i === picked} onClick={() => onPick(i)}>
          <span className="use-name">{use.name}</span>
          <span className="use-line">{use.line}</span>
        </button>
      ))}
    </div>
  );
}

/** The top of the home page. The build also writes it into the HTML, so it shows before any script runs. */
/** What one question costs: the same number Ask here's Pay button shows, from today's pool price. */
function QuestionPrice() {
  const { data: judge } = useJudge();
  const client = usePublicClient();
  const { door } = site();
  const quote = useQuery({
    queryKey: ["home-quote", judge?.asset],
    enabled: !!door && !!judge && !!client,
    staleTime: 60_000,
    queryFn: () => quoteEth(client!, judge!.asset, judge!.price, judge!.poolFee, judge!.poolTickSpacing),
  });
  if (quote.data !== undefined) return <>{amount(ethToSend(quote.data))} ETH</>;
  // until the pool answers, the price as the contract sets it, which is exact
  return <>{judge ? `${amount(judge.price)} ${judge.symbol}` : "0.5 IMD"}</>;
}

function Hero() {
  const { data: judge } = useJudge();
  const { data: count } = useCaseCount();
  const agents = judge ? `${judge.panelSize} ` : <span className="hold">100 </span>;
  return (
    <>
      <h1>Get a yes or no on anything</h1>
      <p className="lede">
        Connect any smart contract action to the answer. A jury of {agents}AI agents, powered by <a href="https://imd.fun">IMD</a>, checks the proof and votes, for{" "}
        <span className="price">
          <QuestionPrice />
        </span>{" "}
        a question.
      </p>
      <Chain />
    </>
  );
}

/** What the HTML carries before the script runs: the header and the top of the home page. */
export function Shell() {
  return (
    <div className="wrap" data-shell="">
      <Header />
      <main>
        <Hero />
      </main>
    </div>
  );
}

/** The use the tiles picked, kept while the reader opens a question and comes back. */
let pickedUse = 0;

function Home({ tab, onOpened }: { tab: Tab; onOpened: (id: number) => void }) {
  const { data: count } = useCaseCount();
  const [picked, setPicked] = useState(pickedUse);
  const pick = (use: number) => {
    pickedUse = use;
    setPicked(use);
  };
  return (
    <main>
      <Hero />
      <Section id="how-title" title="How to use it">
        {/* two picks in order: what to make, then how */}
        <h3 className="pick">Pick what you want</h3>
        <Uses picked={picked} onPick={pick} />
        <h3 className="pick">Then pick how</h3>
        <Tabs tab={tab} />
        <div className="tab-panel" id="tab-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} key={tab}>
          {tab === "launch" ? (
            <LaunchSteps use={picked} />
          ) : tab === "agent" ? (
            <AgentSteps use={picked} />
          ) : tab === "contract" ? (
            <ContractSteps use={picked} />
          ) : (
            <div className="frame">
              <AskForm onOpened={onOpened} example={USES[picked]!.ask} />
            </div>
          )}
        </div>
      </Section>
      {count !== 0 && (
        <Section id="latest-title" title="Latest answer">
          <LatestAnswer id={count ?? 0} />
        </Section>
      )}
      {/* the list asks to be filled only where a question can be asked */}
      <CaseRows skip={count || undefined} title="Earlier questions" quietWhenEmpty={tab !== "ask"} />
    </main>
  );
}

export function App() {
  const route = useRoute();
  const onOpened = useCallback((id: number) => {
    travelNext = true;
    lastAsk = "#/ask";
    // The case is paid for, so Back shouldn't offer the same words beside a Pay button.
    history.replaceState(null, "", "#/ask");
    location.hash = `#/case/${id}`;
  }, []);
  return (
    <div className="wrap">
      <Header />
      {route.page === "case" ? <CasePage key={route.id} id={route.id} /> : <Home tab={route.tab} onOpened={onOpened} />}
      <Footer />
    </div>
  );
}
