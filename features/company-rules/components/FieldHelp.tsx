"use client";

import { HelpCircle } from "lucide-react";

interface FieldHelpProps {
  text: string;
}

export function FieldHelp({ text }: FieldHelpProps) {
  return (
    <span className="group/help relative inline-flex align-middle">
      <HelpCircle className="h-3.5 w-3.5 cursor-help text-gray-400 transition group-hover/help:text-primary" aria-hidden="true" />
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-56 -translate-x-1/2 rounded-lg bg-gray-900 px-3 py-2 text-[11px] font-medium leading-relaxed text-white opacity-0 shadow-lg transition-opacity group-hover/help:opacity-100 group-focus-within/help:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

