import { THEME_INIT_SCRIPT } from "@plotpop/ui";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Outfit } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

/**
 * `docs/design-system.md` §7.1: all three families are self-hosted through
 * `next/font` and preloaded, so no request ever reaches a third party font domain.
 * The variable names are the ones `packages/ui` maps onto `--font-*`.
 */
const display = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PlotPop",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
      // The theme attribute is written by the inline script below, before React
      // sees the document, so the server markup cannot match it (§5.2).
      suppressHydrationWarning
    >
      <head>
        {/* Blocking on purpose: §5.2 forbids painting Light and then switching. */}
        <script>{THEME_INIT_SCRIPT}</script>
      </head>
      <body>{children}</body>
    </html>
  );
}
