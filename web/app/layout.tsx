import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "x402 Payment Explorer — Stellar",
  description: "Browse x402 payments on Stellar, across any facilitator.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
