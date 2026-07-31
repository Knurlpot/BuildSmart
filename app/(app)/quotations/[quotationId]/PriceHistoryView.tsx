"use client";

import { useEffect, useState } from "react";

type PriceHistoryEntry = {
  price_history_id: number;
  item_name: string;
  unit_cost_before: number;
  unit_cost_after: number;
  total_cost_before: number | null;
  total_cost_after: number | null;
  changed_at: string;
  changed_reason: string;
};

function peso(value: number) {
  return value.toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

export function PriceHistoryView({ quotationId, refreshKey }: { quotationId: string; refreshKey: number }) {
  const [history, setHistory] = useState<PriceHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      setIsLoading(true);
      const response = await fetch(`/api/quotations/${quotationId}/price-history`);
      const data = await response.json();
      if (!cancelled) {
        setHistory(response.ok ? data.price_changes : []);
        setIsLoading(false);
      }
    }
    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [quotationId, refreshKey]);

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-gray-900">Price History</h2>
      {isLoading ? (
        <p className="text-sm text-gray-500">Loading history...</p>
      ) : history.length === 0 ? (
        <p className="text-sm text-gray-500">No price changes recorded.</p>
      ) : (
        <div className="space-y-2">
          {history.map((entry) => (
            <div key={entry.price_history_id} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{entry.changed_reason}</p>
                  <p className="text-xs text-gray-500">{new Date(entry.changed_at).toLocaleString()}</p>
                </div>
                <p className="text-gray-600">{entry.item_name}</p>
              </div>
              <p className="mt-2 text-gray-700">
                {peso(entry.unit_cost_before)} to {peso(entry.unit_cost_after)}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
