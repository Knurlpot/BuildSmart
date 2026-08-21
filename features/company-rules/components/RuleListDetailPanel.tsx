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
  emptyHint?: string;
  countLabel?: string;
  listHeader?: ReactNode;
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
  countLabel,
  listHeader,
  renderListItem,
  detail,
}: RuleListDetailPanelProps<T>) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div
        className="flex min-h-10 items-center justify-between gap-4"
        aria-label={countLabel ?? `${items.length} configured`}
      >
        <div className="w-full max-w-sm">{listHeader}</div>
        <button
          type="button"
          onClick={onAdd}
          className="shrink-0 rounded-xl bg-primary px-7 py-2 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover)"
        >
          Add
        </button>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="min-w-0">
        <QueryState
          isLoading={isLoading}
          error={error}
          isEmpty={items.length === 0}
          onRetry={onRetry}
          emptyTitle={`No ${title.toLowerCase()}`}
          emptyHint={emptyHint}
          minHeight={448}
          keepEmptyTextCentered
        >
          <div className="grid max-h-[34rem] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-12 [scrollbar-width:thin]">
            {items.map((item, index) => {
              const id = getId(item);
              const selected = selectedId === id;
              const staggeredWidth = index % 4 === 0 || index % 4 === 3 ? "sm:col-span-5" : "sm:col-span-7";
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelect(id)}
                  aria-current={selected ? "true" : undefined}
                  className={`group flex min-h-28 w-full cursor-pointer items-start rounded-xl border p-4 text-left shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary/40 ${staggeredWidth} ${
                    selected
                      ? "border-primary bg-primary text-primary-foreground ring-1 ring-primary/20 [&_*]:!text-white [&_.rounded-full]:!bg-white/20"
                      : "border-gray-200 bg-white hover:border-primary/40 hover:shadow-md"
                  }`}
                >
                  <div className="min-w-0 flex-1">{renderListItem(item)}</div>
                </button>
              );
            })}
          </div>
        </QueryState>
        </div>

        <div className="min-h-[28rem] rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">{detail}</div>
      </div>
    </div>
  );
}
