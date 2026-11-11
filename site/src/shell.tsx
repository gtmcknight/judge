// The build's prerender: the header and the top of the home page as HTML, so a phone on a slow
// network sees them before the script arrives. React replaces this markup when it starts.
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import type { Abi } from "viem";
import { Shell } from "./App";
import { siteFrom, type Deployment } from "./deployment";
import { WalletProvider, configFor } from "./wallet";

export function render(deployment: Deployment, abis: Record<string, Abi>): string {
  const site = siteFrom(deployment, abis);
  return renderToStaticMarkup(
    <WagmiProvider config={configFor(site)}>
      <QueryClientProvider client={new QueryClient()}>
        <WalletProvider>
          <Shell />
        </WalletProvider>
      </QueryClientProvider>
    </WagmiProvider>,
  );
}
