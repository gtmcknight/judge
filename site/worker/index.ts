// taylor.fyi/judge's server side. The taylor-fyi router hands it every request under /judge with that
// prefix stripped. Built files are served before this runs; it answers the two paths that need a server:
// a question's own page (/case/1), whose link preview names its answer, and that preview's picture.
import satori, { init as initLayout } from "satori/standalone";
import layoutWasm from "satori/yoga.wasm";
import { Resvg, initWasm } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import inter500 from "@fontsource/inter/files/inter-latin-500-normal.woff";
import inter700 from "@fontsource/inter/files/inter-latin-700-normal.woff";
import deployment from "../public/imd-deployment.json";
import { VERDICTS, get, headline, search, votesOf, type PanelRecord, type Verdict, type Vote } from "../src/imd";
import { parseQuestion, questionHashOf, took } from "../src/text";

type Env = { ASSETS: Fetcher; PUBLIC_URL: string };

const judge = deployment.contracts.find((c) => c.name === "Judge")!.address.toLowerCase();

type Case = { verdict: Verdict; rule: string | null; votes: Vote[]; panelSize: number; took: string };

/** Three reads in one batch: the case, its verdict and the panel's size. The first node that answers wins. */
async function readChain(id: number): Promise<{ askedAt: number; verdict: Verdict; questionHash: string; panelSize: number }> {
  const arg = id.toString(16).padStart(64, "0");
  const calls = ["0xf09790dd" + arg, "0xd3dc1fdf" + arg, "0xc58e94d0"].map((data, i) => ({ jsonrpc: "2.0", id: i, method: "eth_call", params: [{ to: judge, data }, "latest"] }));
  for (const url of deployment.network.rpcUrls) {
    try {
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(calls) });
      const answers = ((await response.json()) as Array<{ id: number; result?: string }>).sort((a, b) => a.id - b.id);
      const [record, verdict, size] = answers.map((a) => a.result ?? "");
      if (!record || !verdict || !size) continue;
      const word = (hex: string, i: number) => hex.slice(2 + i * 64, 2 + (i + 1) * 64);
      return {
        askedAt: parseInt(word(record, 0), 16),
        verdict: VERDICTS[parseInt(word(verdict, 0), 16)] ?? "Pending",
        questionHash: `0x${word(record, 2)}`,
        panelSize: parseInt(word(size, 0), 16),
      };
    } catch {
      // the next node
    }
  }
  throw new Error("no node answered");
}

/** The case as the page shows it, or null when nobody has asked it. IMD's words are best effort. */
async function readCase(id: number): Promise<Case | null> {
  const chain = await readChain(id);
  if (!chain.askedAt) return null;
  const found = await search(`Case ${id} on judge ${judge}`, 5).catch(() => null);
  const match = found?.requests.find((r) => parseQuestion(r.question)?.number === id && questionHashOf(r) === chain.questionHash);
  const record = match ? await get<PanelRecord>(`/oracle/requests/${match.id}`).catch(() => null) : null;
  return {
    verdict: chain.verdict,
    rule: match ? parseQuestion(match.question)!.rule : null,
    votes: record ? votesOf(record) : [],
    panelSize: chain.panelSize,
    took: record?.attestedAt ? took(record.createdAt, record.attestedAt) : "",
  };
}

/** The line under the answer, as the home page's card words it. */
function lineOf(c: Case): string {
  const yes = c.votes.filter((v) => v.yes).length;
  const no = c.votes.length - yes;
  if (c.verdict === "Pending") return c.votes.length ? `${yes} yes, ${no} no so far` : "The agents are reading it";
  if (c.verdict === "NoAnswer") return "Nothing was signed, so it isn't a ruling";
  if (!c.votes.length) return "Answered";
  return `${yes} to ${no}${c.took ? `, answered in ${c.took}` : ""}`;
}

const INK = "#0a0a0a";
const INK_2 = "#525252";
const COLOR: Record<Verdict, string> = { Pending: INK_2, Yes: "#15803d", No: "#dc2626", NoAnswer: INK_2 };

type Node = { type: string; props: Record<string, unknown> };
// satori reads an array as several children, so a lone child is passed as itself
const h = (type: string, style: Record<string, unknown>, ...children: Array<Node | string>): Node => ({
  type,
  props: { style, children: children.length === 1 ? children[0] : children.length ? children : undefined },
});

const rows = <T,>(items: T[]): T[][] => Array.from({ length: Math.ceil(items.length / 50) }, (_, i) => items.slice(i * 50, i * 50 + 50));

let ready: Promise<void> | undefined;

/** The link preview: the answer, the question, every seat's vote, and where it came from. */
async function draw(id: number, c: Case | null): Promise<Uint8Array> {
  ready ??= Promise.all([initLayout(layoutWasm), initWasm(resvgWasm)]).then(() => undefined);
  await ready;
  const seats = c?.panelSize || 100;
  const yes = c?.votes.filter((v) => v.yes).length ?? 0;
  const no = (c?.votes.length ?? 0) - yes;
  const dots = Array.from({ length: seats }, (_, i) =>
    h("div", { width: 16, height: 16, borderRadius: 8, background: i < yes ? COLOR.Yes : seats - 1 - i < no ? COLOR.No : "#c4c4c4" }),
  );
  const tree = h(
    "div",
    { width: 1200, height: 630, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", background: "#ffffff", fontFamily: "Inter", color: INK },
    h(
      "div",
      { display: "flex", flexDirection: "column" },
      h("div", { fontSize: 150, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.06em", color: COLOR[c?.verdict ?? "Pending"] }, c ? headline[c.verdict] : "Judge"),
      h("div", { marginTop: 28, fontSize: 44, fontWeight: 500, lineHeight: 1.25, letterSpacing: "-0.01em", lineClamp: 2 }, c?.rule ?? (c ? `Question ${id}` : `No question ${id} yet`)),
    ),
    h(
      "div",
      { display: "flex", flexDirection: "column" },
      // rows of 50, spaced so a full row spans the same width as the line under it
      h("div", { display: "flex", flexDirection: "column", gap: 6 }, ...rows(dots).map((row) => h("div", { display: "flex", columnGap: (1056 - 50 * 16) / 49 }, ...row))),
      h(
        "div",
        { display: "flex", justifyContent: "space-between", marginTop: 28, fontSize: 30, fontWeight: 500, color: INK_2 },
        h("div", {}, c ? lineOf(c) : "Get a yes or no on anything"),
        h("div", { color: INK }, "taylor.fyi/judge"),
      ),
    ),
  );
  const svg = await satori(tree as never, {
    width: 1200,
    height: 630,
    fonts: [
      { name: "Inter", data: inter500, weight: 500, style: "normal" },
      { name: "Inter", data: inter700, weight: 700, style: "normal" },
    ],
  });
  return new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
}

/** The page itself, with the preview tags naming this question, and a base so its files resolve from /case/. */
async function page(request: Request, env: Env, id: number, c: Case | null): Promise<Response> {
  const html = await env.ASSETS.fetch(new Request(new URL("/", request.url)));
  const title = c?.rule ? `${headline[c.verdict]}: ${c.rule}` : `Question ${id} on Judge`;
  const description = c ? `${lineOf(c)}. ${c.panelSize} AI agents vote on each question, and the contract gets the answer.` : "Get a yes or no on anything.";
  const image = `${env.PUBLIC_URL}/og/case/${id}.png`;
  const set = (content: string) => ({ element: (e: Element) => void e.setAttribute("content", content) });
  const out = new HTMLRewriter()
    .on("head", { element: (e) => void e.prepend('<base href="../" />', { html: true }) })
    .on("title", { element: (e) => void e.setInnerContent(title) })
    .on('meta[name="description"]', set(description))
    .on('meta[property="og:title"]', set(title))
    .on('meta[property="og:description"]', set(description))
    .on('meta[property="og:image"]', set(image))
    .on("head", { element: (e) => void e.append(`<meta property="og:url" content="${env.PUBLIC_URL}/case/${id}" />`, { html: true }) })
    .transform(html);
  const response = new Response(out.body, out);
  response.headers.set("cache-control", "public, max-age=60");
  return response;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const slashed = /^\/case\/(\d{1,9})\/$/.exec(url.pathname);
    // the page's files resolve from one level up, so a trailing slash goes to the address without it
    if (slashed) return new Response(null, { status: 301, headers: { location: `/case/${slashed[1]}` } });
    const asPage = /^\/case\/(\d{1,9})$/.exec(url.pathname);
    const asImage = /^\/og\/case\/(\d{1,9})\.png$/.exec(url.pathname);
    if (!asPage && !asImage) return env.ASSETS.fetch(request);
    const id = Number((asPage ?? asImage)![1]);

    if (asPage) return page(request, env, id, await readCase(id).catch(() => null));

    const cache = caches.default;
    const key = new Request(url.toString());
    const kept = await cache.match(key);
    if (kept) return kept;
    const c = await readCase(id).catch(() => null);
    const response = new Response(await draw(id, c), {
      headers: {
        "content-type": "image/png",
        // a settled answer never changes; anything still open, or read without its words, is drawn again soon
        "cache-control": c && c.verdict !== "Pending" && c.rule ? "public, max-age=86400" : "public, max-age=60",
      },
    });
    ctx.waitUntil(cache.put(key, response.clone()));
    return response;
  },
} satisfies ExportedHandler<Env>;
