# Judge: design

**The bet.** Someone who has never seen Solidity can use this in three steps: paste a line into their AI and say what they want, it builds and tests the contract, then they put it live. The page is a plain numbered guide, the way Stripe and Anthropic write theirs. Code stays behind "By hand", and no file names show unless you ask for code. The page never looks like a court. No gavels, stamps, serif or parchment.

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

**Layout.** One 752px column, 16px gutter on a phone. Three numbered steps joined by a hairline, one sentence each, with no frame around them. The paste box is the first thing to do, and its last line is yours to change. Code sits in plain hairline boxes under "By hand" and never scrolls sideways: a line that doesn't fit wraps under its own indent. Trying it from the page swaps the guide for the form. No shadows, no fills, no card inside a card.

**The seats.** One dot per seat, in a line for a small panel and a block of 20 across for a large one. Yes fills from the start, no from the end, so the side that crosses the middle wins. The dots only move for someone watching the case open.

**Motion.** New seats sit down one after another inside 350ms, then the verdict lands in 240ms. The words you typed travel from the form to the answer page in 240ms. Press 0.97. Reduced motion gets fades.

**Words.** The page says question, proof, AI agents and answer. The contract says `rule`, `proof` and `verdict`. Answers read Yes, No, No answer, Voting. No court words on the page.

**Trust.** The contract is the source of truth for every answer. Words from IMD's API show only when their hash matches the question's onchain hash.

**Share image.** `site/public/og.png`: the title and the paste box, the first thing the page asks you to do. The site lives at taylor.fyi/judge, behind the router, so its URLs stay relative. Only `og:image` is absolute, since scrapers need that.
