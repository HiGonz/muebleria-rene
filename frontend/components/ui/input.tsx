import { cn } from "@/lib/utils";
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
