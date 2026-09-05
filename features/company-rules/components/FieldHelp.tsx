"use client";

import { useId } from "react";
import type { ReactNode } from "react";

interface FieldHelpProps {
  label: ReactNode;
  text: ReactNode;
}

export function FieldHelp({ label, text }: FieldHelpProps) {
  const tooltipId = useId();

  return (
    <span
      className="group/help relative inline-flex cursor-help align-middle outline-none"
      tabIndex={0}
      aria-describedby={tooltipId}
    >
      <span className="transition group-hover/help:text-primary group-focus/help:text-primary group-focus-visible/help:rounded-sm group-focus-visible/help:ring-2 group-focus-visible/help:ring-primary/25">
        {label}
      </span>
      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full left-1/2 z-50 mb-2 w-80 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg bg-gray-900 px-3 py-2.5 text-left text-[11px] font-medium normal-case leading-relaxed tracking-normal text-white opacity-0 shadow-lg transition-[opacity,visibility] group-hover/help:visible group-hover/help:opacity-100 group-focus/help:visible group-focus/help:opacity-100"
      >
        {text}
        <span className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-gray-900" />
      </span>
    </span>
  );
}

