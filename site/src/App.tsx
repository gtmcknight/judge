import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { flushSync } from "react-dom";
import { quoteEth } from "./ask";
import { REPOSITORY, site } from "./deployment";
import { useCaseCount, useCaseRows, useJudge, type Verdict } from "./cases";
import { AskForm } from "./AskPanel";
import { CasePage } from "./CasePage";
import { CONTRACT, IDEAS, INSTALL, TEST, asFile } from "./snippet";
import { amount, copyText, timeAgo } from "./text";
import { WalletButton } from "./wallet";

type Route = { page: "home"; ask: boolean } | { page: "case"; id: number };

function readRoute(): Route {
  const match = /^#\/case\/(\d+)$/.exec(location.hash);
  if (match?.[1]) return { page: "case", id: Number(match[1]) };
  return { page: "home", ask: location.hash.startsWith("#/ask") };
}

/** Set when a case opens from the form: the words just typed travel to where they now live. */
let travelNext = false;

/** Where Try it leads: back to the words typed before looking at the code. */
let lastAsk = "#/ask";

function useRoute(): Route {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    let shown = readRoute();
    const update = () => {
      const next = readRoute();
      const apply = () => {
        flushSync(() => setRoute(next));
        scrollTo(0, 0);
      };
      const swaps = next.page === "home" && shown.page === "home" && next.ask !== shown.ask;
      const travel = (travelNext || swaps) && "startViewTransition" in document && !matchMedia("(prefers-reduced-motion: reduce)").matches;
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

function ThemeButton() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === "dark");
  const flip = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "dark" ? "#000000" : "#ffffff");
    try {
      localStorage.setItem("theme", next);
    } catch {
      // private windows may refuse; the page still flips
    }
    setDark(!dark);
  };
  return (
    <button className="icon-button" aria-label={dark ? "Switch to day" : "Switch to night"} onClick={flip}>
      {dark ? (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="3.2" fill="currentColor" />
          <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M13 3l-1.4 1.4M4.4 11.6L3 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M13.5 9.6A6 6 0 0 1 6.4 2.5a6 6 0 1 0 7.1 7.1z" fill="currentColor" />
        </svg>
      )}
    </button>
  );
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
        <ThemeButton />
        <WalletButton />
      </div>
    </header>
  );
}

const KEYWORD = /^(import|from|contract|is|function|external|internal|public|payable|override|constant|address|string|calldata|uint256|new)$/;

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

function Code({ lines }: { lines: string[] }) {
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

export function CopyButton({ text, label, next, onCopied }: { text: string; label: string; next?: boolean; onCopied?: () => void }) {
  const [copied, setCopied] = useState<"" | "Copied" | "Couldn't copy">("");
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(""), 1600);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <button
      className="copy"
      aria-label={label}
      data-next={!!next && !copied}
      data-done={!!copied}
      onClick={() => {
        void copyText(text).then((ok) => {
          setCopied(ok ? "Copied" : "Couldn't copy");
          if (ok) onCopied?.();
        });
      }}
    >
      <span>{copied || "Copy"}</span>
    </button>
  );
}

export const Chevron = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M6 3.5L10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** The box to paste into an AI: the fixed line that points it here, then what you want in your own words. */
function Prompt() {
  const [wish, setWish] = useState<string>(IDEAS[0]![1]);
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
        <div className="prompt-end">
          <CopyButton text={`Read and follow ${skill}\n\n${wish}`} label="Copy this for your AI" next />
        </div>
      </div>
      <p className="ideas">
        Try{" "}
        {IDEAS.map(([name, text], i) => (
          <span key={name}>
            {i > 0 && " · "}
            <button
              className="link"
              onClick={() => {
                setWish(text);
                box.current?.focus();
              }}
            >
              {name}
            </button>
          </span>
        ))}
      </p>
    </>
  );
}

function CodeBox({ lines }: { lines: string[] }) {
  return (
    <div className="code-box">
      <CopyButton text={asFile(lines)} label="Copy this code" />
      <Code lines={lines} />
    </div>
  );
}

function Price() {
  const { data: judge } = useJudge();
  const client = usePublicClient();
  const { door } = site();
  const quote = useQuery({
    queryKey: ["home-quote", judge?.asset],
    enabled: !!door && !!judge && !!client,
    staleTime: 60_000,
    queryFn: () => quoteEth(client!, judge!.asset, judge!.price, judge!.poolFee, judge!.poolTickSpacing),
  });
  if (quote.data !== undefined) return <>about {amount(quote.data)} ETH</>;
  return <>{judge ? `${amount(judge.price)} ${judge.symbol}` : "0.5 IMD"}</>;
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

function HowTo() {
  const [way, setWay] = useState<"ai" | "hand">("ai");
  return (
    <section className="howto">
      <div className="howto-head">
        <h2>How to use it</h2>
        <div className="seg" role="tablist" aria-label="How to use it">
          {(
            [
              ["ai", "With your AI"],
              ["hand", "By hand"],
            ] as const
          ).map(([key, words]) => (
            <button key={key} role="tab" aria-selected={way === key} onClick={() => setWay(key)}>
              {words}
            </button>
          ))}
        </div>
      </div>
      {way === "ai" ? (
        <ol className="steps" key="ai">
          <Step n={1} title="Tell your AI what you want">
            <p>Paste this into Claude Code, Cursor or any AI that writes code. Change the last line to whatever you want.</p>
            <Prompt />
          </Step>
          <Step n={2} title="Your AI builds and tests it">
            <p>Testing is free. Nothing goes live and no money moves until you say so.</p>
          </Step>
          <Step n={3} title="Put it live">
            <p>
              Tell your AI to put it live, and it'll show you how to use it. Each question costs <Price />. A vote can be wrong, so only put in what you can afford to lose.
            </p>
          </Step>
        </ol>
      ) : (
        <ol className="steps" key="hand">
          <Step n={1} title="Install it">
            <p>
              Run this in your project. It uses <a href="https://getfoundry.sh">Foundry</a>. Not on Foundry? <a href={`${REPOSITORY}#add-it`}>Copy the one file</a> instead.
            </p>
            <div className="code-box code-one">
              <code>{INSTALL}</code>
              <CopyButton text={INSTALL} label="Copy the install command" />
            </div>
          </Step>
          <Step n={2} title="Add it to your contract">
            <p>
              Inherit <code>Judged</code>. Ask with <code>ask</code>, and say what happens on a yes in <code>onYes</code>. Swap in your own question and address.
            </p>
            <CodeBox lines={CONTRACT} />
          </Step>
          <Step n={3} title="Test it for free">
            <p>
              Run <code>forge test</code>. A stand-in answers, so it costs nothing and takes no time.
            </p>
            <CodeBox lines={TEST} />
          </Step>
        </ol>
      )}
    </section>
  );
}

const verdictWord: Record<Verdict, string> = { Pending: "Voting", Yes: "Yes", No: "No", NoAnswer: "No answer" };

export function CaseRows({ skip, quietWhenEmpty }: { skip?: number; quietWhenEmpty?: boolean }) {
  const { data: count, isError: countFailed, refetch: refetchCount } = useCaseCount();
  const rows = useCaseRows();
  const shown = rows.data?.filter((row) => row.id !== skip);
  const { testnet, chainName } = site();
  if (skip && shown?.length === 0) return null;
  if (quietWhenEmpty && count === 0) return null;
  return (
    <section className="cases" aria-labelledby="cases-title">
      <h2 id="cases-title">
        {skip ? "Other questions" : "Latest questions"}
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

function Footer() {
  return (
    <footer className="foot">
      Judge has no owner and adds no fee, and nobody can change it. It runs on <a href="https://imd.fun">IMD</a>. Read the <a href={`${REPOSITORY}/blob/main/src/Judge.sol`}>164 lines</a> and the{" "}
      <a href={`${REPOSITORY}#before-you-put-money-on-a-verdict`}>rules</a> before you put money on an answer.
    </footer>
  );
}

function Home({ ask, onOpened }: { ask: boolean; onOpened: (id: number) => void }) {
  const { data: judge } = useJudge();
  const agents = judge ? `${judge.panelSize} ` : <span className="hold">100 </span>;
  if (ask) {
    return (
      <main>
        <h1>Ask AI from this page</h1>
        <p className="lede">Ask a yes or no question and attach proof. {agents}AI agents check it and vote. You get the answer in about 5 minutes.</p>
        <div className="frame">
          <AskForm onOpened={onOpened} />
          <a
            className="frame-row frame-try"
            href="#/"
            onClick={() => {
              lastAsk = location.hash;
            }}
          >
            <span>Add Judge to your contract</span>
            <Chevron />
          </a>
        </div>
        <CaseRows />
      </main>
    );
  }
  return (
    <main>
      <h1>Ask AI from your contract</h1>
      <p className="lede">Your smart contract asks a yes or no question and attaches proof. {agents}AI agents check it and vote. About 5 minutes later, your contract gets the answer.</p>
      <HowTo />
      <p className="try-line">
        Just want to try it? <a href={lastAsk}>Ask a question from this page</a>.
      </p>
      <CaseRows quietWhenEmpty />
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
      {route.page === "case" ? <CasePage key={route.id} id={route.id} /> : <Home ask={route.ask} onOpened={onOpened} />}
      <Footer />
    </div>
  );
}
