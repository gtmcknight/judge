import { defineChain, parseAbi, type Abi, type Address } from "viem";

/** `imd-deployment.json`: what IMD's deployment handed this site. Everything chain-specific reads from it. */
export type Deployment = {
  chainId: number;
  contracts: Array<{ name: string; address: Address; abiPath: string }>;
  network: {
    name: string;
    testnet: boolean;
    rpcUrls: string[];
    explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    uniswapV4: { quoter: Address };
  };
};

export type Site = {
  chainId: number;
  chainName: string;
  testnet: boolean;
  explorer: string;
  rpcUrls: string[];
  quoter: Address;
  judge: Address;
  abi: Abi;
  /** The ETH door, where this chain has one. */
  door: { address: Address; abi: Abi } | null;
  chain: ReturnType<typeof defineChain>;
};

let loaded: Site | undefined;

const json = async <T,>(path: string): Promise<T> => {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} answered ${response.status}`);
  return (await response.json()) as T;
};

/** The contracts this site reads, by name. */
const NAMES = ["Judge", "JudgeEthDoor"];

export async function loadSite(): Promise<Site> {
  const deployment = await json<Deployment>("./imd-deployment.json");
  // the ABIs come down together, not one after another
  const paths = deployment.contracts.filter((c) => NAMES.includes(c.name)).map((c) => c.abiPath);
  const abis = Object.fromEntries(await Promise.all(paths.map(async (path) => [path, await json<Abi>(`./${path}`)] as const)));
  return siteFrom(deployment, abis);
}

/** The site's settings from a deployment and its ABIs. The build's prerender passes them in from disk. */
export function siteFrom(deployment: Deployment, abis: Record<string, Abi>): Site {
  const judge = deployment.contracts.find((c) => c.name === "Judge");
  if (!judge) throw new Error("no Judge in the deployment");
  const door = deployment.contracts.find((c) => c.name === "JudgeEthDoor");
  const { network } = deployment;
  loaded = {
    chainId: deployment.chainId,
    chainName: network.name,
    testnet: network.testnet,
    explorer: network.explorer,
    rpcUrls: network.rpcUrls,
    quoter: network.uniswapV4.quoter,
    judge: judge.address,
    abi: abis[judge.abiPath]!,
    door: door ? { address: door.address, abi: abis[door.abiPath]! } : null,
    chain: defineChain({
      id: deployment.chainId,
      name: network.name,
      nativeCurrency: network.nativeCurrency,
      rpcUrls: { default: { http: network.rpcUrls } },
      blockExplorers: { default: { name: "Explorer", url: network.explorer } },
      testnet: network.testnet,
    }),
  };
  return loaded;
}

export function site(): Site {
  if (!loaded) throw new Error("the site's deployment has not loaded");
  return loaded;
}

export { IMD_API } from "./imd";
export const IMD_EXPLORER = "https://explorer.imd.fun";
export const REPOSITORY = "https://github.com/gtmcknight/judge";

/** Where a question has its own address, with a link preview that names its answer. */
export const HOME = "https://taylor.fyi/judge/";

/** The link to share for a question: its own address on taylor.fyi, the page's own hash route anywhere else. */
export const caseLink = (id: number) =>
  location.href.startsWith(HOME) ? `${HOME}case/${id}` : `${location.origin}${location.pathname}#/case/${id}`;

export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address, address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
  "function symbol() view returns (string)",
]);

export const quoterAbi = [
  {
    type: "function",
    name: "quoteExactOutputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          {
            name: "poolKey",
            type: "tuple",
            components: [
              { name: "currency0", type: "address" },
              { name: "currency1", type: "address" },
              { name: "fee", type: "uint24" },
              { name: "tickSpacing", type: "int24" },
              { name: "hooks", type: "address" },
            ],
          },
          { name: "zeroForOne", type: "bool" },
          { name: "exactAmount", type: "uint128" },
          { name: "hookData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      { name: "amountIn", type: "uint256" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;
