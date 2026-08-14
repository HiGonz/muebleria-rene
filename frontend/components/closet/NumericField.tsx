"use client";

import { useEffect, useState } from "react";

// A numeric input that can be freely cleared/retyped without the field
// snapping back to its clamped minimum on every keystroke — the naive
// `onChange={(e) => onChange(Math.max(min, Number(e.target.value)))}`
// pattern clamps an empty/low intermediate value immediately, and since
// the clamped value flows back in as `value`, the next keystroke appends
// to that instead of replacing it (clearing "60" to type "40" becomes
// "2040": clear -> 0 -> clamped to 20 -> typing "4" -> "204" -> "0" -> "2040").
//
// Local text state stays free while the field is focused (no clamping,
// no resync from the committed `value` prop, so the user's own keystrokes
// are never fought); the min/blank-fallback only applies on blur or Enter.
export function NumericField({ value, min, onCommit, className, ariaLabel }: {
  value: number;
  min: number;
  onCommit: (n: number) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  const commit = () => {
    const parsed = Number(text);
    const next = text === "" || Number.isNaN(parsed) ? value : Math.max(min, parsed);
    setText(String(next));
    if (next !== value) onCommit(next);
  };

  return (
    <input
      type="number"
      value={text}
      min={min}
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { setFocused(false); commit(); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className={className}
      aria-label={ariaLabel}
    />
  );
}
