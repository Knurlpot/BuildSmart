"use client";

import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type SupplierOption = {
  supplier_id: number;
  supplier_name: string;
};

export function SupplierSearchInput({
  id,
  suppliers,
  selectedSupplierId,
  onSelectSupplier,
  isLoading = false,
  className,
}: {
  id?: string;
  suppliers: SupplierOption[];
  selectedSupplierId: number | null;
  onSelectSupplier: (supplierId: number | null) => void;
  isLoading?: boolean;
  className?: string;
}) {
  const selectedSupplier = suppliers.find((supplier) => supplier.supplier_id === selectedSupplierId) ?? null;
  const [query, setQuery] = useState(selectedSupplier?.supplier_name ?? "");
  const [isOpen, setIsOpen] = useState(false);

  const filteredSuppliers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return suppliers;
    return suppliers.filter((supplier) => supplier.supplier_name.toLowerCase().includes(normalizedQuery));
  }, [query, suppliers]);

  const helperText = isLoading
    ? "Loading suppliers..."
    : filteredSuppliers.length === 0
      ? "No suppliers found"
      : "Select a supplier";

  return (
    <div className={cn("relative w-full max-w-md", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          id={id}
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            onSelectSupplier(null);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
          disabled={isLoading}
          placeholder={isLoading ? "Loading suppliers..." : "Search supplier"}
          autoComplete="off"
          className="h-10 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-sm font-semibold text-gray-700 outline-none transition placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60"
        />
      </div>
      {isOpen && !isLoading && (
        <div className="absolute z-30 mt-2 max-h-56 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
          {filteredSuppliers.length > 0 ? (
            filteredSuppliers.map((supplier) => {
              const isSelected = supplier.supplier_id === selectedSupplierId;
              return (
                <button
                  key={supplier.supplier_id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onSelectSupplier(supplier.supplier_id);
                    setQuery(supplier.supplier_name);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold transition",
                    isSelected ? "bg-orange-50 text-primary" : "text-gray-700 hover:bg-gray-50"
                  )}
                >
                  <span className="min-w-0 truncate">{supplier.supplier_name}</span>
                  {isSelected && <Check className="h-4 w-4 shrink-0" />}
                </button>
              );
            })
          ) : (
            <p className="px-3 py-2 text-sm font-semibold text-gray-400">{helperText}</p>
          )}
        </div>
      )}
    </div>
  );
}
