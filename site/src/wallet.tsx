import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createConfig, fallback, http, useConnect, useConnection, useConnectors, useDisconnect, useSwitchChain, type Connector } from "wagmi";
import { coinbaseWallet, injected } from "wagmi/connectors";
import type { Site } from "./deployment";
import { site } from "./deployment";
import { short } from "./text";
import { WALLET_MARKS } from "./wallet-marks";

export const SITE_NAME = "Judge";

export function configFor(s: Site) {
  return createConfig({
    chains: [s.chain],
    // EIP-6963 discovery lists every installed extension under its own name
    multiInjectedProviderDiscovery: true,
    connectors: [injected(), coinbaseWallet({ appName: SITE_NAME })],
    transports: { [s.chainId]: fallback(s.rpcUrls.map((url) => http(url, { batch: true }))) },
  });
}

/**
 * Mobile without a relay: a phone browser has no extension, so the sheet offers to open this page
 * inside a wallet's own browser, where that wallet is injected. Each link is the one its vendor
 * documents; none needs a project ID or a server.
 */
const OPEN_IN: ReadonlyArray<{ id: string; name: string; href: (url: string) => string }> = [
  { id: "metamask", name: "MetaMask", href: (url) => `https://link.metamask.io/dapp/${url.replace(/^https?:\/\//, "")}` },
  { id: "coinbase", name: "Coinbase Wallet", href: (url) => `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}` },
  { id: "rabby", name: "Rabby", href: (url) => `https://go.rabby.io/mobile/dapp/${encodeURIComponent(url)}` },
  { id: "phantom", name: "Phantom", href: (url) => `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(new URL(url).origin)}` },
];

const isMobileBrowser = () =>
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && !(window as unknown as { ethereum?: unknown }).ethereum;

const COINBASE_MARK =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="28" height="28" fill="#2C5FF6"/><path fill-rule="evenodd" clip-rule="evenodd" d="M14 23.8C19.4124 23.8 23.8 19.4124 23.8 14C23.8 8.58761 19.4124 4.2 14 4.2C8.58761 4.2 4.2 8.58761 4.2 14C4.2 19.4124 8.58761 23.8 14 23.8ZM11.55 10.8C11.1358 10.8 10.8 11.1358 10.8 11.55V16.45C10.8 16.8642 11.1358 17.2 11.55 17.2H16.45C16.8642 17.2 17.2 16.8642 17.2 16.45V11.55C17.2 11.1358 16.8642 10.8 16.45 10.8H11.55Z" fill="white"/></svg>',
  );

/** For the browser wallet that didn't name itself: a plain wallet, in the page's own colours. */
const BROWSER_WALLET_MARK =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="28" height="28" fill="#737373"/><rect x="6" y="9" width="16" height="11" rx="2" stroke="white" stroke-width="1.6"/><path d="M6 12.5h16" stroke="white" stroke-width="1.6"/><circle cx="18.5" cy="16" r="1.2" fill="white"/></svg>',
  );

type Sheet = { open: () => void; isOpen: boolean };
const SheetContext = createContext<Sheet>({ open: () => {}, isOpen: false });
export const useWalletSheet = () => useContext(SheetContext);

/** The one connect sheet: any button may open it, so "Connect" only ever appears in the header. */
export function WalletProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const value = useMemo(() => ({ open: () => setOpen(true), isOpen }), [isOpen]);
  return (
    <SheetContext.Provider value={value}>
      {children}
      {isOpen && <ConnectSheet onClose={() => setOpen(false)} />}
    </SheetContext.Provider>
  );
}

function ConnectSheet({ onClose }: { onClose: () => void }) {
  const mobile = isMobileBrowser();
  const { isConnected } = useConnection();
  const connectors = useConnectors();
  const { mutate: connect, isPending, variables, error, reset } = useConnect();
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    addEventListener("keydown", onKey);
    const before = document.activeElement as HTMLElement | null;
    sheet.current?.querySelector<HTMLElement>("button, a")?.focus();
    return () => {
      removeEventListener("keydown", onKey);
      before?.focus();
    };
  }, [onClose]);

  useEffect(() => {
    if (isConnected) onClose();
  }, [isConnected, onClose]);

  // EIP-6963 names each installed extension; wagmi's generic row is only for a browser where
  // discovery found nothing, and then it is called what it is.
  const named = connectors.some((c) => c.type === "injected" && c.id !== "injected");
  const listed = [...connectors.filter((c) => c.type === "injected"), ...connectors.filter((c) => c.type !== "injected")].filter(
    (c) => !(c.id === "injected" && named) && (!mobile || c.type !== "injected"),
  );
  const label = (c: Connector) =>
    c.id === "injected" ? "Browser wallet" : c.id === "coinbaseWalletSDK" && mobile ? "Coinbase Smart Wallet" : c.name;
  const icon = (c: Connector) => c.icon ?? (c.id === "coinbaseWalletSDK" ? COINBASE_MARK : BROWSER_WALLET_MARK);

  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Connect a wallet" ref={sheet} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>Connect a wallet</h2>
          <button className="icon-button" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3.5 3.5l9 9m0-9l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {mobile &&
          OPEN_IN.map((w) => (
            <a key={w.id} className="wallet-row" href={w.href(location.href)}>
              <img className="wallet-mark" width={28} height={28} src={w.id === "coinbase" ? COINBASE_MARK : WALLET_MARKS[w.id]} alt="" />
              <span>Open in {w.name}</span>
            </a>
          ))}
        {listed.map((c) => (
          <button
            key={c.uid}
            className="wallet-row"
            onClick={() => {
              reset();
              connect({ connector: c });
            }}
          >
            <img className="wallet-mark" width={28} height={28} src={icon(c)} alt="" />
            <span>
              {label(c)}
              {isPending && variables?.connector === c ? ", opening…" : ""}
            </span>
          </button>
        ))}
        {error && <p className="sheet-note">That wallet didn't connect. Try again, or pick another.</p>}
      </div>
    </div>
  );
}

/** The header's control: Connect, the address, or the way back to the right chain. */
export function WalletButton() {
  const { open } = useWalletSheet();
  const { address, isConnected, chainId } = useConnection();
  const { mutate: disconnect } = useDisconnect();
  const { mutate: switchChain, isPending } = useSwitchChain();
  const [menu, setMenu] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const { chainId: wanted, chainName } = site();

  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setMenu(false);
    };
    addEventListener("pointerdown", close);
    addEventListener("keydown", close);
    return () => {
      removeEventListener("pointerdown", close);
      removeEventListener("keydown", close);
    };
  }, [menu]);

  if (!isConnected || !address) {
    return (
      <button className="plain-button" onClick={open}>
        Connect
      </button>
    );
  }
  if (chainId !== wanted) {
    return (
      <button className="plain-button" onClick={() => switchChain({ chainId: wanted })}>
        {isPending ? "Switching…" : `Switch to ${chainName}`}
      </button>
    );
  }
  return (
    <div className="wallet-menu" ref={box}>
      <button className="plain-button mono" aria-expanded={menu} onClick={() => setMenu(!menu)}>
        {short(address)}
      </button>
      {menu && (
        <div className="popover">
          <button
            onClick={() => {
              setMenu(false);
              disconnect({});
            }}
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
