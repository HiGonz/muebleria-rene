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
        variant === "primary" && "bg-indigo-500 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)] hover:bg-indigo-400",
        variant === "secondary" && "glass text-white hover:border-white/20 hover:bg-white/8",
        variant === "ghost" && "bg-transparent text-zinc-300 hover:bg-white/6 hover:text-white",
        variant === "danger" && "bg-rose-500/20 text-rose-200 hover:bg-rose-500/30",
        className,
      )}
      {...props}
    />
  );
}
