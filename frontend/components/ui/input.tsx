import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-12 w-full rounded-xl border border-ivory/10 bg-ivory/5 px-4 text-sm text-ivory placeholder:text-warmgray/70 focus:border-brass focus:ring-2 focus:ring-brass/30",
        props.className,
      )}
    />
  );
}

// A plain controlled `<input type="number" value={n} onChange={...}>` forces
// an empty field back to "0" on every keystroke (Number("") === 0) — so
// clearing "2" to type "5" flashes a "0" first and can leave a stray "05" or
// "50" behind, since the browser inserts the new digit next to that forced
// zero instead of replacing it. This keeps its own text buffer so the field
// can sit empty while the user is mid-edit; only on blur (or the next digit)
// does an empty/invalid value actually resolve to 0.
export function NumberInput({ value, onChange, unit, className, ...props }: {
  value: number;
  onChange: (v: number) => void;
  unit?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const [text, setText] = useState(String(value));

  // Re-syncs when `value` changes for a reason other than this field's own
  // typing (switching modules, "apply to all", undo...). Skipped when the
  // buffer already parses to the same number so it doesn't clobber an
  // in-progress "12." or a lone "-" the user just typed.
  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative">
      <Input
        {...props}
        type="number"
        value={text}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          if (raw === "" || raw === "-") return; // still typing — don't force 0 yet
          const num = Number(raw);
          if (!Number.isNaN(num)) onChange(num);
        }}
        onBlur={() => {
          if (Number.isNaN(Number(text)) || text === "") {
            setText("0");
            onChange(0);
          }
        }}
        className={className}
      />
      {unit && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-warmgray">{unit}</span>}
    </div>
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-28 w-full rounded-xl border border-ivory/10 bg-ivory/5 px-4 py-3 text-sm text-ivory placeholder:text-warmgray/70 focus:border-brass focus:ring-2 focus:ring-brass/30",
        props.className,
      )}
    />
  );
}
