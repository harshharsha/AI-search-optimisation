"use client";

import { useState } from "react";

export default function CopyButton({
  text,
  label = "Copy as Markdown",
}: {
  text: string;
  label?: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          /* clipboard blocked: nothing to do */
        }
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}
