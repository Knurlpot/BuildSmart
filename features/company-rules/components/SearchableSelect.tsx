"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export type SearchableSelectOption = {
  value: string;
  label: string;
};

type SearchableSelectProps = {
  value: string;
  options: SearchableSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
};

export function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = "Select...",
  className = "",
  disabled = false,
  ariaLabel,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const clearQueryRef = useRef<number | null>(null);
  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) => `${option.label} ${option.value}`.toLowerCase().includes(normalized));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    return () => {
      if (clearQueryRef.current) window.clearTimeout(clearQueryRef.current);
    };
  }, []);

  const appendTypeaheadQuery = (key: string) => {
    const next = `${query}${key}`.toLowerCase();
    setQuery(next);
    setOpen(true);
    if (clearQueryRef.current) window.clearTimeout(clearQueryRef.current);
    clearQueryRef.current = window.setTimeout(() => setQuery(""), 900);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          if (disabled) return;
          setOpen((current) => !current);
          setQuery("");
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "Escape") {
            setOpen(false);
            setQuery("");
            return;
          }
          if (event.key === "Backspace") {
            setQuery((current) => current.slice(0, -1));
            setOpen(true);
            return;
          }
          if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
            appendTypeaheadQuery(event.key);
          }
        }}
        className={`${className} flex w-full items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <span className={selected ? "truncate" : "truncate text-gray-400"}>{selected?.label ?? placeholder}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <div role="listbox" className="max-h-56 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-400">No matches</div>
            ) : (
              filtered.map((option) => (
                <button
                  key={`${option.value}-${option.label}`}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`flex w-full rounded-lg px-3 py-2 text-left text-sm transition hover:bg-gray-50 ${
                    option.value === value ? "bg-orange-50 font-semibold text-primary" : "text-gray-700"
                  }`}
                >
                  <span className="truncate">{option.label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
