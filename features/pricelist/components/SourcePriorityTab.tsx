"use client";

import { useState } from "react";
import { GripVertical, ListOrdered } from "lucide-react";
import { QueryState } from "@/components/feedback/QueryState";
import { usePricelistSourcePriority } from "@/hooks/usePricelistSourcePriority";

interface SourcePriorityTabProps {
  companyId?: number | null;
}

export function SourcePriorityTab({ companyId }: SourcePriorityTabProps) {
  const { list, isLoading, error, refetch, reorder, isDirty, saveOrder, isSaving, saveError, saved } =
    usePricelistSourcePriority(companyId ?? undefined);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const finishDrag = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="flex flex-col gap-5">
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
                key={entry.price_source}
                draggable
                onDragStart={(event) => {
                  setDraggedIndex(i);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", entry.price_source);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDragOverIndex(i);
                }}
                onDragLeave={() => setDragOverIndex((current) => (current === i ? null : current))}
                onDrop={(event) => {
                  event.preventDefault();
                  if (draggedIndex !== null) {
                    reorder(draggedIndex, i);
                  }
                  finishDrag();
                }}
                onDragEnd={finishDrag}
                className={`flex cursor-grab items-center gap-3 rounded-xl border px-4 py-3 transition active:cursor-grabbing ${
                  draggedIndex === i
                    ? "border-primary/40 bg-orange-50 opacity-70"
                    : dragOverIndex === i
                      ? "border-primary/50 bg-orange-50/60"
                      : "border-gray-100 bg-gray-50/60 hover:border-gray-200 hover:bg-white"
                }`}
              >
                <GripVertical className="h-4 w-4 shrink-0 text-gray-300" aria-hidden="true" />
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <span className="flex-1 text-sm font-semibold text-gray-800">{entry.price_source}</span>
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
