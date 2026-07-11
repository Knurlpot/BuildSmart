"use client";

import { AlertTriangle, ChevronDown, ChevronUp, ListOrdered } from "lucide-react";
import { QueryState } from "@/components/feedback/QueryState";
import { usePricelistSourcePriority } from "@/hooks/usePricelistSourcePriority";

export function SourcePriorityTab() {
  const { list, isLoading, error, refetch, move, isDirty, saveOrder, isSaving, saveError, saved } =
    usePricelistSourcePriority();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          There is no source-priority table in the authoritative 13-table schema yet — this is modeled
          against a guessed shape so the page is reviewable now, not a confirmed contract. Persisting this
          rule needs a backend schema addition.
        </span>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <ListOrdered className="h-4 w-4 text-gray-400" />
          <p className="text-sm font-bold text-gray-900">Source Priority</p>
        </div>
        <p className="mb-4 text-xs text-gray-500">
          When more than one source has a price for the same material and period, the highest-ranked source
          here wins. Applies to quotation generation.
        </p>

        <QueryState
          isLoading={isLoading}
          error={error}
          isEmpty={!isLoading && !error && list.length === 0}
          onRetry={refetch}
          emptyTitle="No source priority rule set yet"
          minHeight={140}
        >
          <div className="flex flex-col gap-2">
            {list.map((entry, i) => (
              <div
                key={entry.source}
                className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <span className="flex-1 text-sm font-semibold text-gray-800">{entry.source}</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={i === list.length - 1}
                    onClick={() => move(i, 1)}
                    className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              disabled={!isDirty || isSaving}
              onClick={() => saveOrder().catch(() => {})}
              className="w-fit rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60"
            >
              {isSaving ? "Saving…" : "Save Priority Order"}
            </button>
            {saveError && <p className="text-xs text-red-500">{saveError.message}</p>}
            {saved && !saveError && !isSaving && <p className="text-xs text-green-600">Saved.</p>}
          </div>
        </QueryState>
      </div>
    </div>
  );
}
