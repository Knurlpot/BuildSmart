"use client";

import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { QueryState } from "@/components/feedback/QueryState";

interface RuleListDetailPanelProps<T> {
  title: string;
  items: T[];
  isLoading: boolean;
  error: Error | null;
  onRetry?: () => void;
  getId: (item: T) => string;
  renderListItem: (item: T) => ReactNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Whatever should render in the right panel right now — empty state, add form, or read-only detail. The caller owns that decision. */
  detail: ReactNode;
  onAdd: () => void;
  emptyHint: string;
}

// Shared "list of configured rules + detail/add panel" layout used by Scope Templates,
// Labor Rules, Pricing Strategy, and Unit Rules — matches the split-panel pattern in the
// Replit reference's Company Preferences page. Material Rules and Manage Existing Rules
// don't fit this shape (former needs a per-category completeness table, latter is a
// cross-type list with a disable action) so they don't use this component.
export function RuleListDetailPanel<T>({
  title,
  items,
  isLoading,
  error,
  onRetry,
  getId,
  renderListItem,
  selectedId,
  onSelect,
  detail,
  onAdd,
  emptyHint,
}: RuleListDetailPanelProps<T>) {
  return (
    <div className="flex overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm" style={{ minHeight: 440 }}>
      <div className="flex w-80 shrink-0 flex-col border-r border-gray-100">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
            {title} ({items.length})
          </p>
          <button
            type="button"
            onClick={onAdd}
            className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground transition hover:bg-(--primary-hover)"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <QueryState
            isLoading={isLoading}
            error={error}
            isEmpty={items.length === 0}
            onRetry={onRetry}
            emptyTitle="Nothing configured yet"
            emptyHint={emptyHint}
            minHeight={200}
          >
            <div className="flex flex-col divide-y divide-gray-50">
              {items.map((item) => {
                const id = getId(item);
                const selected = selectedId === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onSelect(id)}
                    className={`px-4 py-3 text-left transition ${selected ? "bg-orange-50/60" : "hover:bg-gray-50"}`}
                  >
                    {renderListItem(item)}
                  </button>
                );
              })}
            </div>
          </QueryState>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-5">{detail}</div>
    </div>
  );
}
