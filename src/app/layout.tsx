import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "MbioTrade v16 — Deriv Multiplier Terminal",
  description:
    "A free, local-first Forex, Crypto and Gold analytics, strategy, backtesting and Deriv demo-trading terminal by mbiopeter.",
  icons: { icon: "/icon.svg" },
};

type RootLayoutProps = Readonly<{ children: ReactNode }>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
