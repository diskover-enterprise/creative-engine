"use client";

import { useState } from "react";

export default function CopyPromptButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium dark:border-white/15"
    >
      {copied ? "Copied!" : "Copy Prompt"}
    </button>
  );
}
