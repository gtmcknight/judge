# Judge: design

**The bet.** Someone who has never seen Solidity can use this: four tabs under the headline are the four ways in. **Launch it**, first and open by default, sends what they want to IMD's swarm, which builds a site and launches the contract. **For your agent** is the same box to paste into their own AI, **In a contract** is the install, the code and a free test, and **Ask here** asks a question from the page. Each step is one plain sentence, the way Stripe and Anthropic write theirs, and code and file names stay in In a contract. The page never looks like a court. No gavels, stamps, serif or parchment.

**Theme.** Day by default, night fully designed. `?theme=` and `localStorage.theme` override, resolved before first paint.

| Token | Night | Day |
| --- | --- | --- |
| `--bg` | `#000` | `#fff` |
| `--ink` | `#f5f5f5` | `#0a0a0a` |
| `--ink-2` | `#a3a3a3` | `#525252` |
| `--line` | `#262626` | `#e5e5e5` |
| `--open` (an empty seat) | `#3a3a3a` | `#c4c4c4` |
| `--yes` | `#4ade80` | `#15803d` |
| `--no` | `#f87171` | `#dc2626` |

Green and red mean yes and no, and nothing else, so errors are plain ink. The one solid button is Copy on the paste box. Green in the code is `onYes`.

**Type.** Inter Variable and IBM Plex Mono, bundled. Five sizes: 120 (verdict), 54 (title), 20 (a case's rule), 16 (text), 14 (labels, rows, code). Weights 400, 500, 700. Mono is for code and addresses.

**Layout.** One 752px column, 16px gutter on a phone. The headline and its line stay put on every tab. Under them, the newest real answer shows what the line says: its question, a dot for every seat, the verdict and how long it took, live while a vote runs, and it opens its page. One line under it gives the test record. Then Good for lists four uses, each a kind of proof the panel has checked right, and then the tabs, each with its own address (`#/` for Launch it, `#/agent`, `#/contract`, `#/ask`) so a reload, Back or a shared link opens the same one. On a phone the four sit two by two. A tab changes only what is under it and never moves the page. Steps are numbered and joined by a hairline, one sentence each, with no frame around them. The form keeps its frame. Code sits in plain hairline boxes and never scrolls sideways: a line that doesn't fit wraps under its own indent. Real answered questions list under every tab, and the empty list asks to be filled only on Ask here. No shadows and no card inside a card. Color goes in one place: each of the eight uses sits on its own tinted tile (blue, violet, cyan, amber). A tile is also the picker: the one you tap wears its color's outline, and all four ways to use it below follow it: the words for IMD and for your agent, a tested contract (generated from src/examples by scripts/examples.mjs) and the example question in Ask here. Below that the page stays black and white, apart from green Yes and red No. The grey pill that slides to the open tab means selected, and the tab labels line up with the headline while the pill hangs into the gutter.

**The seats.** One dot per seat, in a line for a small panel and a block of 20 across for a large one. Yes fills from the start, no from the end, so the side that crosses the middle wins. The dots only move for someone watching the case open.

**Motion.** New seats sit down one after another inside 350ms, then the verdict lands in 240ms. The words you typed travel from the form to the answer page in 240ms. Press 0.97. Reduced motion gets fades.

**Words.** The page says question, proof, AI agents and answer. The contract says `rule`, `proof` and `verdict`. Answers read Yes, No, No answer, Voting. No court words on the page.

**Launch it.** The agent tab's box, with Pay where Copy sits: the words typed in one tab are there in the other, and go to IMD's swarm instead of your AI. Pay names exactly what leaves the wallet: IMD from a wallet that holds the job's IMD, ETH from any other. Paying ETH first buys the job's IMD in IMD's own pool, one exact-input swap the way IMD's launch page buys a shortfall, so a wallet with only ETH can launch. A wallet that turns out to hold IMD changes Pay to IMD and waits for a second press. When IMD has the job, Pay becomes Follow the build. The page buys IMD's `workflow.open` the way IMD's explorer does: quote, IMD's 402 offer checked against the quote before any wallet opens, a Permit2 payment and an EIP-712 approval of that payment for that quote. IMD's API refuses browsers on other sites, so the Worker passes five routes through to it (`/imd/requests/...`) with nothing of the browser's but the token and the payment. The request appends what IMD's checker needs said in words, or it won't quote: the audit, the deploy, the site, GitHub. Every failure says whether anything was paid; once the payment is sent, only IMD's order status can say it wasn't.

**Trust.** The contract is the source of truth for every answer. Words from IMD's API show only when their hash matches the question's onchain hash.

**Share image.** `site/public/og.png`: the title and the paste box, the first thing the page asks you to do. The site lives at taylor.fyi/judge, behind the router, so its URLs stay relative. Only `og:image` is absolute, since scrapers need that.

**Speed and sharing.** The build writes the header and the top of the home page into the HTML, so a phone on a slow network sees them before the script arrives (first paint 0.45s instead of 2s on a throttled phone). A question has its own address, taylor.fyi/judge/case/1, where the Worker names the answer in the link preview and draws its picture: the verdict, the question, the seats and the tally. Share on a question's page copies that address.
