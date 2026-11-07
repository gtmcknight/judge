import "@fontsource-variable/inter/wght.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "./styles.css";
import { Component, StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { App } from "./App";
import { loadSite } from "./deployment";
import { WalletProvider, configFor } from "./wallet";

const root = createRoot(document.getElementById("root")!);

class Boundary extends Component<{ children: ReactNode }, { broken: boolean }> {
  override state = { broken: false };
  static getDerivedStateFromError() {
    return { broken: true };
  }
  override render() {
    return this.state.broken ? <p className="fatal">Something on this page broke. Reload to try again. Any question you asked is safe onchain.</p> : this.props.children;
  }
}

loadSite()
  .then((loaded) => {
    const queries = new QueryClient({
      defaultOptions: { queries: { retry: 2, refetchOnWindowFocus: false, staleTime: 5_000 } },
    });
    root.render(
      <StrictMode>
        <Boundary>
          <WagmiProvider config={configFor(loaded)}>
            <QueryClientProvider client={queries}>
              <WalletProvider>
                <App />
              </WalletProvider>
            </QueryClientProvider>
          </WagmiProvider>
        </Boundary>
      </StrictMode>,
    );
  })
  .catch(() => {
    root.render(<p className="fatal">This page couldn't load its settings. Reload to try again.</p>);
  });
