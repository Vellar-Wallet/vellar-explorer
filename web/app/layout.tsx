import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "./nav";

export const metadata: Metadata = {
  title: "x402 Payment Explorer — Stellar",
  description: "Browse x402 payments on Stellar, across any facilitator.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@800,700,500&display=swap" rel="stylesheet" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="topbar">
          <div className="topbar-inner">
            <span className="brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="brand-mark" src="/logo-mark.png" alt="Vellar x402 Explorer" />
            </span>
            <Nav />
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
