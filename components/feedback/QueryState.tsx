"use client";

import { AlertTriangle, Inbox, Loader2 } from "lucide-react";

interface QueryStateProps {
  isLoading: boolean;
  error: Error | null;
  isEmpty: boolean;
  onRetry?: () => void;
  emptyTitle: string;
  emptyHint?: string;
  minHeight?: number;
  children: React.ReactNode;
}

export function QueryState({
  isLoading,
  error,
  isEmpty,
  onRetry,
  emptyTitle,
  emptyHint,
  minHeight = 200,
  children,
}: QueryStateProps) {
  if (isLoading) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2"
        style={{ minHeight }}
      >
        <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
        <p className="text-xs text-gray-400">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 px-6 text-center"
        style={{ minHeight }}
      >
        <AlertTriangle className="h-7 w-7 text-red-300" />
        <p className="text-sm font-medium text-gray-600">Couldn&apos;t load this data</p>
        <p className="max-w-sm text-xs text-gray-400">{error.message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 px-6 text-center"
        style={{ minHeight }}
      >
        <Inbox className="h-8 w-8 text-gray-200" />
        <p className="text-sm text-gray-400">{emptyTitle}</p>
        {emptyHint && <p className="max-w-sm text-xs text-gray-300">{emptyHint}</p>}
      </div>
    );
  }

  return <>{children}</>;
}
