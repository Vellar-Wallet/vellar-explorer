"use client";

import { useState } from "react";

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="copy-btn"
      title={copied ? "Copied" : `Copy ${value}`}
      onClick={async e => {
        e.preventDefault();
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          // Clipboard access can be denied by the browser; failing silently is fine here - the
          // full value is always available via the adjacent link's title/href anyway.
        }
      }}
    >
      {copied ? "✓" : "⧉"}
    </button>
  );
}
