import * as React from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition duration-200 disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" && "bg-brass text-ink shadow-[0_0_0_1px_rgba(243,234,216,0.08)] hover:bg-brass-soft",
        variant === "secondary" && "glass text-ivory hover:border-ivory/20 hover:bg-ivory/8",
        variant === "ghost" && "bg-transparent text-ivory/70 hover:bg-ivory/6 hover:text-ivory",
        variant === "danger" && "bg-terracotta/20 text-terracotta hover:bg-terracotta/30",
        className,
      )}
      {...props}
    />
  );
}
