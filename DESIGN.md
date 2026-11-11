# Judge: design

**The bet.** Someone who has never seen Solidity can use this: three tabs under the headline are the three ways in. **For your agent** is a box to paste into their AI with what they want, **In a contract** is the install, the code and a free test, and **Ask here** asks a question from the page. Each step is one plain sentence, the way Stripe and Anthropic write theirs, and code and file names stay in In a contract. The page never looks like a court. No gavels, stamps, serif or parchment.

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

**Layout.** One 752px column, 16px gutter on a phone. The headline and its line stay put on every tab. Under them, the newest real answer shows what the line says: its question, a dot for every seat, the verdict and how long it took, live while a vote runs, and it opens its page. One line under it gives the test record. Then Good for lists four uses, each a kind of proof the panel has checked right, and then the tabs, each with its own address (`#/`, `#/contract`, `#/ask`) so a reload, Back or a shared link opens the same one. A tab changes only what is under it and never moves the page. Steps are numbered and joined by a hairline, one sentence each, with no frame around them. The form keeps its frame. Code sits in plain hairline boxes and never scrolls sideways: a line that doesn't fit wraps under its own indent. Real answered questions list under every tab, and the empty list asks to be filled only on Ask here. No shadows and no card inside a card. Color goes in one place: each use in Good for sits on its own tinted tile (blue, violet, cyan, amber), so what it's for reads apart from how to use it. Below that the page stays black and white, apart from green Yes and red No. The grey pill that slides to the open tab means selected, and the tab labels line up with the headline while the pill hangs into the gutter.

**The seats.** One dot per seat, in a line for a small panel and a block of 20 across for a large one. Yes fills from the start, no from the end, so the side that crosses the middle wins. The dots only move for someone watching the case open.

**Motion.** New seats sit down one after another inside 350ms, then the verdict lands in 240ms. The words you typed travel from the form to the answer page in 240ms. Press 0.97. Reduced motion gets fades.

**Words.** The page says question, proof, AI agents and answer. The contract says `rule`, `proof` and `verdict`. Answers read Yes, No, No answer, Voting. No court words on the page.

**Trust.** The contract is the source of truth for every answer. Words from IMD's API show only when their hash matches the question's onchain hash.

**Share image.** `site/public/og.png`: the title and the paste box, the first thing the page asks you to do. The site lives at taylor.fyi/judge, behind the router, so its URLs stay relative. Only `og:image` is absolute, since scrapers need that.

**Speed and sharing.** The build writes the header and the top of the home page into the HTML, so a phone on a slow network sees them before the script arrives (first paint 0.45s instead of 2s on a throttled phone). A question has its own address, taylor.fyi/judge/case/1, where the Worker names the answer in the link preview and draws its picture: the verdict, the question, the seats and the tally. Share on a question's page copies that address.
