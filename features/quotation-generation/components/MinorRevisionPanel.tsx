"use client";

import { useState } from "react";
import { flushSync } from "react-dom";
import { AlertTriangle, Check, ChevronDown, Edit2, RefreshCw, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { apiClient } from "@/lib/api/client";
import { computeTierResult, fmtPeso, recomputeItemLine } from "@/lib/dev/provisional/quotationBreakdownFixtures";
import { PROVISIONAL_TIERS, type ProvisionalItemLine, type ProvisionalTier } from "@/lib/dev/provisional/quotationBreakdownTypes";
import { useSuppliers } from "@/hooks/useSuppliers";

interface MinorRevisionPanelProps {
  tier: ProvisionalTier;
  originalItems: ProvisionalItemLine[];
  items: ProvisionalItemLine[];
  onItemsChange: (tier: ProvisionalTier, next: ProvisionalItemLine[]) => void;
  onTierChange?: (tier: ProvisionalTier) => void;
  onClose: () => void;
  onApply: () => void;
}

function parseMoneyInput(value: string): number {
  return Number(value.replace(/[₱,\s]/g, ""));
}

function formatMoneyInput(value: string): string {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [whole = "", ...decimalParts] = cleaned.split(".");
  const decimal = decimalParts.join("").slice(0, 2);
  const wholeNumber = whole === "" ? "" : Number(whole).toLocaleString("en-PH");
  return decimalParts.length > 0 ? `${wholeNumber}.${decimal}` : wholeNumber;
}

function formatMoneyForEdit(value: number): string {
  return value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function EditableText({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (editing) {
    return (
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft.trim()) onCommit(draft.trim());
          setEditing(false);
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        autoFocus
        className="w-full min-w-[180px] rounded border border-primary px-1.5 py-1 text-xs outline-none"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className="flex items-center gap-1 rounded border border-transparent px-1.5 py-0.5 text-left hover:border-gray-300 hover:bg-white"
    >
      <span className="truncate">{value}</span>
      <Edit2 className="h-2.5 w-2.5 shrink-0 text-gray-400" />
    </button>
  );
}

function EditableAmount({
  value,
  onCommit,
  hideNumberSteppers = false,
  money = false,
}: {
  value: number;
  onCommit: (n: number) => void;
  hideNumberSteppers?: boolean;
  money?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(money ? formatMoneyForEdit(value) : String(value));
  if (editing) {
    return (
      <input
        value={draft}
        onChange={(e) => setDraft(money ? formatMoneyInput(e.target.value) : e.target.value)}
        onBlur={() => {
          const n = money ? parseMoneyInput(draft) : Number(draft);
          if (!isNaN(n) && n >= 0) onCommit(money ? Math.round(n * 100) / 100 : n);
          setEditing(false);
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        type={money ? "text" : "number"}
        inputMode={money ? "decimal" : undefined}
        min={0}
        step="0.01"
        autoFocus
        className={`w-24 rounded border border-primary px-1.5 py-0.5 text-right text-xs outline-none ${
          hideNumberSteppers ? "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" : ""
        }`}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(money ? formatMoneyForEdit(value) : String(value));
        setEditing(true);
      }}
      className="ml-auto flex items-center gap-1 rounded border border-transparent px-1.5 py-0.5 hover:border-gray-300 hover:bg-white"
    >
      {money ? fmtPeso(value) : value.toLocaleString("en-PH", { maximumFractionDigits: 2 })}
      <Edit2 className="h-2.5 w-2.5 text-gray-400" />
    </button>
  );
}

// Part C (Task 7) — supplier picker is PRICE-ONLY. Backend decision: the system does not
// track supplier stock/availability at all (out of scope — a quoting tool, not inventory) —
// there is no quantity_available field on ProvisionalSupplierOption anymore, so there is
// nothing here to compare it against.
function SupplierPicker({ line, onSelect }: { line: ProvisionalItemLine; onSelect: (supplierId: number) => void }) {
  const [open, setOpen] = useState(false);
  const selected = line.supplier_options.find((s) => s.supplier_id === line.selected_supplier_id);

  if (line.supplier_options.length === 0) return <span className="text-gray-400">—</span>;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs transition-colors hover:border-gray-300"
      >
        <span className="truncate font-medium text-gray-700">{selected?.supplier_name ?? "Select…"}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-gray-400" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="border-b border-gray-100 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Compare prices for {line.quantity.toFixed(1)} {line.unit}</p>
          </div>
          {line.supplier_options.map((sup) => {
            const isSel = sup.supplier_id === line.selected_supplier_id;
            return (
              <button
                key={sup.supplier_id}
                type="button"
                onClick={() => {
                  onSelect(sup.supplier_id);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-xs transition-colors hover:bg-gray-50 ${isSel ? "bg-orange-50/60" : ""}`}
              >
                <span className={`font-semibold ${isSel ? "text-primary" : "text-gray-800"}`}>{sup.supplier_name}</span>
                <span className="font-bold text-gray-900">{fmtPeso(sup.unit_price)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

type MissingPriceSaveMode = "quote-only" | "supplier-price";
type MissingPriceDraft = {
  value: string;
  saveMode: MissingPriceSaveMode;
  supplierId: number | null;
};

function MissingRuleRow({
  line,
  draft,
  onDraftChange,
}: {
  line: ProvisionalItemLine;
  draft: MissingPriceDraft;
  onDraftChange: (patch: Partial<MissingPriceDraft>) => void;
}) {
  const { suppliers, isLoading: suppliersLoading } = useSuppliers();
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <p className="flex items-start gap-1.5 text-xs font-semibold text-amber-700">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        No rate on file for &quot;{line.item_name}&quot; ({line.segment_name}). Enter a unit price to continue.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">₱</span>
          <input
            value={draft.value}
            onChange={(e) => onDraftChange({ value: formatMoneyInput(e.target.value) })}
            type="text"
            inputMode="decimal"
            placeholder="Unit price"
            className="w-32 rounded-lg border border-gray-200 bg-white py-1.5 pl-6 pr-2 text-xs outline-none [appearance:textfield] focus:border-primary focus:ring-2 focus:ring-primary/20 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        </div>
        <div className="flex overflow-hidden rounded-lg border border-amber-200 bg-white text-xs">
          {(["quote-only", "supplier-price"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onDraftChange({ saveMode: mode, supplierId: mode === "quote-only" ? null : draft.supplierId })}
              className={`px-3 py-1.5 font-semibold transition ${
                draft.saveMode === mode ? "bg-primary text-primary-foreground" : "text-gray-500 hover:bg-gray-50"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {mode === "quote-only" ? "Quotation Only" : "Save Supplier Price"}
            </button>
          ))}
        </div>
        {draft.saveMode === "supplier-price" && (
          <select
            value={draft.supplierId ?? ""}
            onChange={(e) => onDraftChange({ supplierId: e.target.value ? Number(e.target.value) : null })}
            disabled={suppliersLoading}
            className="min-w-56 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="">{suppliersLoading ? "Loading suppliers..." : "Select supplier"}</option>
            {suppliers.map((supplier) => (
              <option key={supplier.supplier_id} value={supplier.supplier_id}>
                {supplier.supplier_name}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

// P2-D — Minor Revision is the ONLY place Part 2 lets you change a number (Part A: the
// Breakdown view is strictly read-only). Reference: MinorRevisionPanel.tsx (Replit
// prototype). "Regenerate" here means re-running the same mock formula
// (computeTierResult) against edited qty/price/supplier — there is no backend endpoint to
// regenerate against yet.
export function MinorRevisionPanel({ tier, originalItems, items, onItemsChange, onTierChange, onClose, onApply }: MinorRevisionPanelProps) {
  const [workingItems, setWorkingItems] = useState(items);
  const [missingPriceDrafts, setMissingPriceDrafts] = useState<Record<string, MissingPriceDraft>>({});
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const materialItems = workingItems.filter((line) => line.category === "Material");

  const patchLine = (lineId: string, patch: Parameters<typeof recomputeItemLine>[1]) => {
    flushSync(() => {
      setWorkingItems((current) => current.map((l) => (l.line_id === lineId ? recomputeItemLine(l, patch) : l)));
    });
  };

  const draftForLine = (lineId: string): MissingPriceDraft =>
    missingPriceDrafts[lineId] ?? { value: "", saveMode: "quote-only", supplierId: null };

  const updateMissingPriceDraft = (lineId: string, patch: Partial<MissingPriceDraft>) => {
    setMissingPriceDrafts((current) => ({
      ...current,
      [lineId]: { ...(current[lineId] ?? { value: "", saveMode: "quote-only", supplierId: null }), ...patch },
    }));
  };

  const saveSupplierPrice = (line: ProvisionalItemLine, unitPrice: number, supplierId: number) =>
    apiClient<{ historicalrec_id: number; item_code: number }>("/api/historical-price-records", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_code: Number.isInteger(Number(line.item_code)) ? Number(line.item_code) : null,
        item_name: line.item_name === "Material (no rate on file)" && line.treatment_type ? `${line.treatment_type} Material` : line.item_name,
        unit: line.unit,
        supplier_id: supplierId,
        price: unitPrice,
      }),
    });

  const buildResolvedLine = (line: ProvisionalItemLine, unitPrice: number, supplierId: number | null, savedItemCode?: number): ProvisionalItemLine => {
    const lineWithItemCode = savedItemCode ? { ...line, item_code: String(savedItemCode) } : line;
    if (supplierId === null) return recomputeItemLine(lineWithItemCode, { unit_price: unitPrice });
    const existingSupplier = lineWithItemCode.supplier_options.find((supplier) => supplier.supplier_id === supplierId);
    return recomputeItemLine(
      {
        ...lineWithItemCode,
        source_type: "Uploaded",
        selected_supplier_id: supplierId,
        supplier_options: existingSupplier
          ? lineWithItemCode.supplier_options.map((supplier) => supplier.supplier_id === supplierId ? { ...supplier, unit_price: unitPrice } : supplier)
          : [
              ...lineWithItemCode.supplier_options,
              {
                supplier_id: supplierId,
                supplier_name: `Supplier #${supplierId}`,
                brand: null,
                location: null,
                unit_price: unitPrice,
                quantity_available: null,
                source_type: "Uploaded",
              },
            ],
      },
      { unit_price: unitPrice }
    );
  };

  const missingMaterialItems = workingItems.filter((line) => line.category === "Material" && line.unit_price === null);
  const allMissingPricesHaveDrafts = missingMaterialItems.every((line) => parseMoneyInput(draftForLine(line.line_id).value) > 0);
  const previewItems = allMissingPricesHaveDrafts
    ? workingItems.map((line) => {
        if (line.category !== "Material" || line.unit_price !== null) return line;
        const unitPrice = Math.round(parseMoneyInput(draftForLine(line.line_id).value) * 100) / 100;
        return buildResolvedLine(line, unitPrice, null);
      })
    : workingItems;
  const originalTotal = computeTierResult(tier, originalItems).grand_total;
  const revisedTotal = computeTierResult(tier, previewItems).grand_total;
  const diff = revisedTotal - originalTotal;

  const commitWorkingItems = () => {
    onItemsChange(tier, workingItems);
  };

  const handleApplyRevisions = async () => {
    if (isApplying) return;
    setIsApplying(true);
    setApplyError(null);
    try {
      const resolved = new Map<string, { unitPrice: number; supplierId: number | null; itemCode?: number }>();

      for (const line of missingMaterialItems) {
        const draft = draftForLine(line.line_id);
        const unitPrice = Math.round(parseMoneyInput(draft.value) * 100) / 100;
        if (!(unitPrice > 0)) {
          throw new Error(`Enter a unit price for ${line.item_name}.`);
        }
        if (draft.saveMode === "supplier-price") {
          if (draft.supplierId === null) throw new Error(`Select a supplier for ${line.item_name}.`);
          const saved = await saveSupplierPrice(line, unitPrice, draft.supplierId);
          resolved.set(line.line_id, { unitPrice, supplierId: draft.supplierId, itemCode: saved.item_code });
        } else {
          resolved.set(line.line_id, { unitPrice, supplierId: null });
        }
      }

      const nextItems = workingItems.map((line) => {
        const resolvedLine = resolved.get(line.line_id);
        return resolvedLine ? buildResolvedLine(line, resolvedLine.unitPrice, resolvedLine.supplierId, resolvedLine.itemCode) : line;
      });
      onItemsChange(tier, nextItems);
      onApply();
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : "Could not apply revisions.");
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* sm:max-w-[1600px] is required alongside max-w-[1600px] — see
          QuotationBreakdownModal.tsx's identical comment for why the bare utility alone
          loses to DialogContent's own sm:max-w-sm default at any real viewport width. */}
      <DialogContent className="flex h-[92vh] w-[97vw] max-w-400 sm:max-w-400 flex-col p-0" showCloseButton={false}>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">Resolve Missing Prices</h2>
            <p className="text-xs text-gray-500">
              Add or update rates before marking either quotation as accepted.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex overflow-hidden rounded-lg border border-gray-200 bg-white text-xs">
              {PROVISIONAL_TIERS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    if (option === tier) return;
                    commitWorkingItems();
                    onTierChange?.(option);
                  }}
                  className={`px-3 py-1.5 font-semibold transition-colors ${
                    option === tier
                      ? option === "Practical"
                        ? "bg-primary text-primary-foreground"
                        : "bg-indigo-600 text-white"
                      : "text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
            <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-200">
              <X className="h-4 w-4 text-gray-600" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-gray-200 bg-gray-100">
                <th className="px-4 py-3 text-left font-semibold text-gray-500">Segment</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-500">Material</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-500">Qty</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-500 min-w-55">Supplier</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-500">Unit Price</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-500">Total</th>
              </tr>
            </thead>
            <tbody>
              {materialItems.map((line) => {
                const original = originalItems.find((o) => o.line_id === line.line_id);
                const changed = original && Math.abs((line.total_cost ?? 0) - (original.total_cost ?? 0)) > 1;
                if (line.unit_price === null) {
                  return (
                    <tr key={line.line_id} className="border-b border-gray-100 bg-amber-50/30">
                      <td className="px-4 py-2.5 text-gray-500">{line.segment_name}</td>
                      <td colSpan={5} className="px-4 py-2.5">
                        <MissingRuleRow
                          line={line}
                          draft={draftForLine(line.line_id)}
                          onDraftChange={(patch) => updateMissingPriceDraft(line.line_id, patch)}
                        />
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={line.line_id} className={`border-b border-gray-100 ${changed ? "bg-blue-50/30" : "hover:bg-gray-50"}`}>
                    <td className="px-4 py-2.5 text-gray-500">{line.segment_name}</td>
                    <td className="px-4 py-2.5">
                      <EditableText value={line.item_name} onCommit={(v) => patchLine(line.line_id, { item_name: v })} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <EditableAmount value={line.quantity} onCommit={(n) => patchLine(line.line_id, { quantity: n })} />
                    </td>
                    <td className="px-4 py-2.5">
                      <SupplierPicker line={line} onSelect={(id) => patchLine(line.line_id, { selected_supplier_id: id })} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <EditableAmount value={line.unit_price} onCommit={(n) => patchLine(line.line_id, { unit_price: n })} hideNumberSteppers money />
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-gray-900">
                      {line.total_cost !== null ? fmtPeso(line.total_cost) : "—"}
                      {line.is_overridden && <span className="ml-1.5 rounded bg-blue-100 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-600">Overridden</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4">
          <div className="flex items-center gap-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Original Total</p>
              <p className="text-sm font-bold text-gray-600">{fmtPeso(originalTotal)}</p>
            </div>
            <span className="text-gray-300">→</span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Revised Total</p>
              <p className={`text-sm font-bold ${diff < 0 ? "text-green-600" : diff > 0 ? "text-red-500" : "text-gray-900"}`}>{fmtPeso(revisedTotal)}</p>
            </div>
            {Math.abs(diff) > 1 && (
              <div className={`rounded-lg px-3 py-1.5 text-xs font-bold ${diff < 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                {diff < 0 ? "Saving " : "Increase "}
                {fmtPeso(Math.abs(diff))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {applyError && <p className="max-w-md text-xs font-semibold text-red-600">{applyError}</p>}
            <button type="button" onClick={() => setWorkingItems(originalItems)} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50">
              <RefreshCw className="h-3.5 w-3.5" /> Reset
            </button>
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleApplyRevisions()}
              disabled={isApplying}
              className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-(--primary-hover)"
            >
              <Check className="h-4 w-4" /> {isApplying ? "Applying..." : "Apply Revisions"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
