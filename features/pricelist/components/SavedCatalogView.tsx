"use client";

import { CheckCircle2, Eye, Upload } from "lucide-react";

interface SavedCatalogViewProps {
  savedCount: number;
  onUploadAnother: () => void;
  /** Navigates to the canonical Price Catalog tab. Omitted only if the host page hasn't wired it. */
  onViewCatalog?: () => void;
}

// Just-saved summary only — no embedded full-catalog table here. The canonical, full,
// read-only catalog view lives in the Price Catalog tab (features/pricelist/components/
// PriceCatalogTab.tsx); this screen links to it instead of duplicating a second renderer.
export function SavedCatalogView({ savedCount, onUploadAnother, onViewCatalog }: SavedCatalogViewProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-gray-200 bg-white p-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
        <CheckCircle2 className="h-8 w-8 text-green-600" />
      </div>
      <div>
        <p className="text-lg font-bold text-gray-900">Pricelist updated</p>
        <p className="mt-1 text-sm text-gray-500">
          {savedCount} record{savedCount !== 1 ? "s" : ""} saved to your catalog.
        </p>
      </div>
      <div className="flex gap-3">
        {onViewCatalog && (
          <button
            type="button"
            onClick={onViewCatalog}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover)"
          >
            <Eye className="h-4 w-4" /> View Full Catalog
          </button>
        )}
        <button
          type="button"
          onClick={onUploadAnother}
          className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
        >
          <Upload className="h-4 w-4" /> Upload Another
        </button>
      </div>
    </div>
  );
}
