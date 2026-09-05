import type { HTMLAttributes } from "react";

import { cn } from "../lib/utils.js";

export function Badge({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600",
        className,
      )}
      {...props}
    />
  );
}
