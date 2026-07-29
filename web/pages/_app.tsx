import type { AppProps } from "next/app";
import "../styles/globals.css";
import { ThemeProvider } from "next-themes";
import { NetworkProvider } from "../context/NetworkContext";
import { WalletProvider } from "../context/WalletContext";
import { ErrorBoundary } from "../components/ErrorBoundary";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ErrorBoundary>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <NetworkProvider>
          <WalletProvider>
            <Component {...pageProps} />
          </WalletProvider>
        </NetworkProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
