"use client";

import { usePathname } from "next/navigation";

const TABS = [
  { label: "Feed", href: "/" },
  { label: "Ecosystem", href: "/ecosystem" },
  { label: "Facilitators", href: "/facilitators" },
  { label: "Sellers", href: "/sellers" },
  { label: "Assets", href: "/assets" },
] as const;

export function Nav(): React.ReactNode {
  const pathname = usePathname();
  return (
    <nav className="tabs">
      {TABS.map(tab => (
        <a key={tab.label} href={tab.href} className={`tab${pathname === tab.href ? " active" : ""}`}>
          {tab.label}
        </a>
      ))}
    </nav>
  );
}
