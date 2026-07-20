"use client";

import type { ReactNode } from "react";
import { QueryState } from "@/components/feedback/QueryState";

interface RuleListDetailPanelProps<T> {
  title: string;
  items: T[];
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void | Promise<void>;
  getId: (item: T) => string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  emptyHint: string;
  renderListItem: (item: T) => ReactNode;
  detail: ReactNode;
}

export function RuleListDetailPanel<T>({
  title,
  items,
  isLoading,
  error,
  onRetry,
  getId,
  selectedId,
  onSelect,
  onAdd,
  emptyHint,
  renderListItem,
  detail,
}: RuleListDetailPanelProps<T>) {
  return (
    <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <p className="text-sm font-bold text-gray-900">{title}</p>
            <p className="text-[11px] text-gray-400">{items.length} configured</p>
          </div>
          <button
            type="button"
            onClick={onAdd}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition hover:bg-(--primary-hover)"
          >
            Add
          </button>
        </div>

        <QueryState
          isLoading={isLoading}
          error={error}
          isEmpty={items.length === 0}
          onRetry={onRetry}
          emptyTitle={`No ${title.toLowerCase()} yet`}
          emptyHint={emptyHint}
          minHeight={220}
        >
          <div className="max-h-[34rem] overflow-y-auto">
            {items.map((item) => {
              const id = getId(item);
              const selected = selectedId === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelect(id)}
                  className={`flex w-full items-start gap-3 border-b border-gray-100 px-4 py-3 text-left transition last:border-b-0 ${
                    selected ? "bg-orange-50" : "hover:bg-gray-50"
                  }`}
                >
                  <span className={`mt-1 h-2.5 w-2.5 rounded-full ${selected ? "bg-primary" : "bg-gray-200"}`} />
                  <div className="min-w-0 flex-1">{renderListItem(item)}</div>
                </button>
              );
            })}
          </div>
        </QueryState>
      </div>

      <div className="min-h-[24rem] rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">{detail}</div>
    </div>
  );
}