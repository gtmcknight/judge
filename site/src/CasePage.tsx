import { useEffect, useRef, useState, type ReactNode } from "react";
import { IMD_EXPLORER, caseLink } from "./deployment";
import { rememberedCase, useCaseOnChain, useCasePanel, useJudge, type CasePanel, type Verdict, type Vote } from "./cases";
import { CaseRows } from "./App";
import { headline } from "./imd";
import { timeAgo, took } from "./text";
import { copyText } from "./clipboard";

/** Seats fill from the start for yes and from the end for no, so the side that crosses the middle wins.
 * `fill` spreads a big panel across the width it sits in. */
export function Seats({ panelSize, votes, live, fill }: { panelSize: number; votes: Vote[]; live: boolean; fill?: boolean }) {
  const yes = votes.filter((v) => v.yes);
  const no = votes.filter((v) => !v.yes);
  const columns = panelSize <= 25 ? panelSize : 20;

  // Votes arrive in batches, one per poll. They sit down one after another, not all at once.
  const seated = useRef({ yes: 0, no: 0 });
  const newYes = Math.max(0, yes.length - seated.current.yes);
  const newNo = Math.max(0, no.length - seated.current.no);
  const step = Math.min(24, 150 / Math.max(1, newYes + newNo));
  useEffect(() => {
    seated.current = { yes: yes.length, no: no.length };
  });

  const spread = !!fill && panelSize > 25;
  return (
    <div
      className={spread ? "seats seats-fill" : "seats"}
      data-live={live}
      style={spread ? undefined : { gridTemplateColumns: `repeat(${columns}, 1fr)`, maxWidth: columns * 20 - 4 }}
      role="img"
      aria-label={`${yes.length} yes, ${no.length} no, of ${panelSize} seats`}
    >
      {Array.from({ length: panelSize }, (_, i) => {
        const fromEnd = panelSize - 1 - i;
        const kind = i < yes.length ? "yes" : fromEnd < no.length ? "no" : "open";
        const seat = kind === "yes" ? yes[i]?.seat : kind === "no" ? no[fromEnd]?.seat : "";
        const turn = kind === "yes" ? i - seated.current.yes : kind === "no" ? newYes + fromEnd - seated.current.no : -1;
        return (
          <i
            key={i}
            className={`seat-${kind}`}
            style={turn >= 0 ? { animationDelay: `${turn * step}ms` } : undefined}
            title={seat ? `Seat ${seat}: ${kind}` : undefined}
          />
        );
      })}
    </div>
  );
}

/** A claimant's text: plain, with its links made safe to follow and marked as theirs. */
function Proof({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return (
    <>
      {parts.map((part, i): ReactNode =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} rel="noopener noreferrer nofollow ugc" target="_blank">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}


/** Past this, "usually 2 to 5 minutes" has stopped being true for this case. */
const OVERDUE_SECONDS = 600;

function statusLine(verdict: Verdict, votes: Vote[], panelSize: number, quorum: number, panel: CasePanel | null | undefined, overdue: boolean): string {
  const yes = votes.filter((v) => v.yes).length;
  const no = votes.length - yes;
  const tally = `${yes} yes, ${no} no`;
  const record = panel?.record;
  if (verdict === "Pending") {
    if (overdue) return `${votes.length ? `${tally} so far. ` : ""}This is taking longer than usual. It ends within a day.`;
    return votes.length ? `${tally} so far. The first to ${quorum} of ${panelSize} wins.` : "The agents are reading this. It usually takes 2 to 5 minutes.";
  }
  if (verdict === "NoAnswer") {
    if (record?.status === "disagreed") return `The agents split, ${tally}. Nothing was signed, so this isn't a ruling.`;
    if (record && record.status !== "attested") return "The agents didn't take this question. Nothing was signed, so this isn't a ruling.";
    return "No answer came within a day. Nothing was signed, so this isn't a ruling.";
  }
  const time = record?.attestedAt ? took(record.createdAt, record.attestedAt) : "";
  if (!votes.length) return "Answered.";
  return time ? `${tally}. Answered in ${time}.` : `${tally}. Answered.`;
}

export function CasePage({ id }: { id: number }) {
  const chain = useCaseOnChain(id);
  const panel = useCasePanel(id, chain.data);
  const { data: judge } = useJudge();
  const verdict = chain.data?.verdict;

  // Reading an old case, the verdict is just there. Watching one open, the last votes sit down first
  // and the word lands on top of them.
  const sawPending = useRef(false);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (verdict === "Pending") sawPending.current = true;
    if (!verdict || verdict === "Pending" || !sawPending.current) return;
    const timer = setTimeout(() => setSettled(true), panel.isFetching ? 1500 : 350);
    return () => clearTimeout(timer);
  }, [verdict, panel.isFetching]);
  const shown = verdict && sawPending.current && !settled ? "Pending" : verdict;

  // Nothing new may arrive for minutes, and the line still has to notice the time.
  const [, tick] = useState(0);
  useEffect(() => {
    if (shown !== "Pending") return;
    const timer = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, [shown]);

  // The wait is long enough to look away, so the tab says it too.
  useEffect(() => {
    if (!shown) return;
    const before = document.title;
    document.title = `${headline[shown]}: question ${id}`;
    return () => {
      document.title = before;
    };
  }, [shown, id]);

  if (chain.isError && !chain.data) {
    return (
      <main>
        <p className="quiet">
          This question didn't load.{" "}
          <button className="link" onClick={() => chain.refetch()}>
            Try again
          </button>
        </p>
      </main>
    );
  }
  const saved = rememberedCase(id);
  if (chain.data && !chain.data.askedAt && !saved) {
    return (
      <main>
        <h1>No question {id.toLocaleString("en")}</h1>
        <p className="lede">
          Nobody has asked this one yet. <a href="#/ask">Ask one</a>
        </p>
      </main>
    );
  }

  const words = panel.data ?? null;
  const overdue = !!chain.data?.askedAt && Date.now() / 1000 - chain.data.askedAt > OVERDUE_SECONDS;
  const rule = words?.rule ?? saved?.rule;
  const proof = words?.proof ?? saved?.proof;
  const votes = words?.votes ?? [];
  const noWords = !rule && !!verdict && (panel.isError || panel.isSuccess);
  const final = !!verdict && verdict !== "Pending";

  return (
    <main className="case">
      <h1 className={`verdict v-${shown ?? "Pending"}`} data-landed={final && sawPending.current && settled}>
        {shown ? headline[shown] : " "}
      </h1>
      {rule || !noWords ? (
        <p className="case-rule">{rule ?? " "}</p>
      ) : (
        <p className="case-proof">
          {final ? (
            <>
              IMD isn't showing this question right now.{" "}
              <button className="link" onClick={() => panel.refetch()}>
                Try again
              </button>
            </>
          ) : (
            "IMD hasn't posted this question yet."
          )}
        </p>
      )}
      {proof ? (
        <p className="case-proof">
          <Proof text={proof} />
        </p>
      ) : null}
      {judge && (!final || votes.length > 0 || panel.isLoading) && <Seats panelSize={judge.panelSize} votes={votes} live={sawPending.current} />}
      <p className="case-line" aria-live="polite">
        {shown && judge ? statusLine(shown, votes, judge.panelSize, judge.quorum, words, overdue) : " "}
      </p>
      <div className="case-links">
        <ShareButton id={id} line={shown && rule ? `${headline[shown]}: ${rule}` : ""} />
        {words?.record.jobId && <a href={`${IMD_EXPLORER}/jobs/${words.record.jobId}`}>See every answer</a>}
        <a href="#/ask">Ask your own</a>
        <span className="case-meta">
          Question {id.toLocaleString("en")}
          {chain.data?.askedAt ? `, ${timeAgo(chain.data.askedAt)}` : ""}
        </span>
      </div>
      <CaseRows skip={id} />
    </main>
  );
}

/** A case's own line and link: the phone's share sheet where there is one, the clipboard elsewhere. */
function ShareButton({ id, line }: { id: number; line: string }) {
  const [done, setDone] = useState<"" | "Copied" | "Couldn't copy">("");
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(""), 1600);
    return () => clearTimeout(timer);
  }, [done]);
  const canShare = typeof navigator.share === "function";
  return (
    <button
      className="link"
      onClick={() => {
        const url = caseLink(id);
        const copy = () => void copyText(line ? `${line}\n${url}` : url).then((ok) => setDone(ok ? "Copied" : "Couldn't copy"));
        if (!canShare) return copy();
        void navigator.share({ text: line, url }).catch((e: Error) => {
          // closing the share sheet is a choice; anything else falls back to the clipboard
          if (e.name !== "AbortError") copy();
        });
      }}
    >
      {done || (canShare ? "Share" : "Copy link")}
    </button>
  );
}
