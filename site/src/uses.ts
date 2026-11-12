import { EXAMPLE_CODE } from "./examples.gen";

/**
 * The eight things it's for. A tile picks one, and all four ways to use it follow: the prompt for
 * your agent (and for IMD to build), a tested contract, and an example question for Ask here. Each pays only on a yes: a
 * no never moves money, so a market's no side and a missed goal win by deadline instead.
 */
export const USES = [
  {
    name: "Prediction markets",
    line: "Pay out when the result is official.",
    hue: 1,
    prompt: "Build me a prediction market where people bet ETH on whether GTA 6 is released before Dec 31, 2026. A yes answer pays the yes side. If no yes answer lands by Jan 7, 2027, the no side wins.",
    ask: { rule: "Was GTA 6 released on or before Dec 31, 2026? Only a page on apnews.com, bbc.com or rockstargames.com/newswire counts.", proof: "https://www.rockstargames.com/newswire" },
    code: EXAMPLE_CODE.PredictionMarket,
  },
  {
    name: "Bounties",
    line: "Pay when the pull request merges.",
    hue: 2,
    prompt: "Build me a contract that holds 1 ETH and pays whoever gets a pull request that fixes issue 12 merged into my repo.",
    ask: { rule: "Was pull request 18202 in github.com/foundry-rs/foundry merged?", proof: "https://github.com/foundry-rs/foundry/pull/18202" },
    code: EXAMPLE_CODE.Bounty,
  },
  {
    name: "Jobs",
    line: "Pay when the article is published.",
    hue: 3,
    prompt: "Build me a contract that holds 1 ETH and pays alice when their article is published on my site.",
    ask: { rule: "Is alice's article published on mysite.com?", proof: "https://mysite.com/alices-article" },
    code: EXAMPLE_CODE.Job,
  },
  {
    name: "Grants",
    line: "Pay as each milestone ships.",
    hue: 4,
    prompt: "Build me a grant that holds 3 ETH and pays my team 1 ETH for each milestone they ship: a v1 release on GitHub, a live docs site and a mainnet deploy.",
    ask: { rule: "Is a v1 release of github.com/team/app published on GitHub?", proof: "https://github.com/team/app/releases" },
    code: EXAMPLE_CODE.Grant,
  },
  {
    name: "Shoutouts",
    line: "Pay when the post goes up on X.",
    hue: 2,
    prompt: "Build me a contract that holds 0.5 ETH and pays alice when their post about my app goes up on X with a link to it.",
    ask: { rule: "Did alice post about myapp.xyz on X with a link to it?", proof: "https://x.com/alice/status/123" },
    code: EXAMPLE_CODE.Shoutout,
  },
  {
    name: "Contests",
    line: "Pay each entry that meets the rules.",
    hue: 3,
    prompt: "Build me a contest that holds 1 ETH and pays 0.1 ETH to each of the first 10 people who post a thread on X explaining my app.",
    ask: { rule: "Does this thread on X explain myapp.xyz?", proof: "https://x.com/fan/status/456" },
    code: EXAMPLE_CODE.Contest,
  },
  {
    name: "Goals",
    line: "Get your deposit back if you do it.",
    hue: 4,
    prompt: "Build me a contract where I lock 0.5 ETH and get it back if I finish a marathon before June 1, 2027. If I don't, it goes to a charity I pick.",
    ask: { rule: "Did alice finish a marathon before June 1, 2027?", proof: "https://results.marathon.org/alice" },
    code: EXAMPLE_CODE.Goal,
  },
  {
    name: "Dares",
    line: "Pay when the proof is posted.",
    hue: 1,
    prompt: "Build me a contract that holds 1 ETH and pays alice if they post proof they smashed two eggs on their head.",
    ask: { rule: "Did alice smash two eggs on their head?", proof: "A link, or a few words" },
    code: EXAMPLE_CODE.EggDare,
  },
] as const;
