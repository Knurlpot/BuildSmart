"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { MAX_SPECIALIZATIONS, SPECIALIZATIONS, formatSpecializations } from "@/lib/specializations";

interface SpecializationSelectProps {
  selected: string[];
  onChange: (next: string[]) => void;
  error?: string;
  label?: string;
}

export function SpecializationSelect({ selected, onChange, error, label = "Specialization" }: SpecializationSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else if (selected.length < MAX_SPECIALIZATIONS) {
      onChange([...selected, value]);
    }
  };

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
          {label} <span className="text-red-500">*</span>
        </label>
        <span className="text-[11px] font-normal normal-case text-gray-400">up to {MAX_SPECIALIZATIONS}</span>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-left text-sm outline-none transition ${
          error
            ? "border-red-400 bg-red-50"
            : open
              ? "border-primary bg-white ring-2 ring-primary/20"
              : "border-gray-200 bg-gray-50 hover:bg-gray-100"
        }`}
      >
        <span className={`truncate ${selected.length ? "text-gray-700" : "text-gray-400"}`}>
          {selected.length ? formatSpecializations(selected) : "Select up to 3 specializations…"}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}

      {open && (
        <div className="absolute top-full left-0 z-30 mt-1 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="max-h-[min(16rem,60vh)] overflow-y-auto overscroll-contain">
            {SPECIALIZATIONS.map((s) => {
              const checked = selected.includes(s);
              const disabled = !checked && selected.length >= MAX_SPECIALIZATIONS;
              return (
                <label
                  key={s}
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 text-sm transition ${
                    disabled ? "cursor-not-allowed text-gray-300" : "cursor-pointer text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggle(s)}
                    className="h-4 w-4 shrink-0 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/30 disabled:opacity-40"
                  />
                  {s}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}