"use client";

import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, Database, Edit2, FileText, RefreshCw, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { computeTierResult, fmtPeso, recomputeItemLine } from "@/lib/dev/provisional/quotationBreakdownFixtures";
import type { PricelistBasis, ProvisionalItemLine, ProvisionalTier } from "@/lib/dev/provisional/quotationBreakdownTypes";

interface MinorRevisionPanelProps {
  tier: ProvisionalTier;
  originalItems: ProvisionalItemLine[];
  items: ProvisionalItemLine[];
  onItemsChange: (next: ProvisionalItemLine[]) => void;
  pricelistBasis: PricelistBasis;
  onBasisChange: (basis: PricelistBasis) => void;
  onClose: () => void;
  onApply: () => void;
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

function EditableAmount({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  if (editing) {
    return (
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = Number(draft);
          if (!isNaN(n) && n >= 0) onCommit(n);
          setEditing(false);
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        type="number"
        min={0}
        step="0.01"
        autoFocus
        className="w-24 rounded border border-primary px-1.5 py-0.5 text-right text-xs outline-none"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(String(value));
        setEditing(true);
      }}
      className="ml-auto flex items-center gap-1 rounded border border-transparent px-1.5 py-0.5 hover:border-gray-300 hover:bg-white"
    >
      {value.toLocaleString("en-PH", { maximumFractionDigits: 2 })}
      <Edit2 className="h-2.5 w-2.5 text-gray-400" />
    </button>
  );
}

// Part D — supplier picker: price AND stock side by side so the user can weigh
// cheaper-but-short against costlier-but-sufficient themselves, never auto-resolved.
function SupplierPicker({ line, onSelect }: { line: ProvisionalItemLine; onSelect: (supplierId: number) => void }) {
  const [open, setOpen] = useState(false);
  const selected = line.supplier_options.find((s) => s.supplier_id === line.selected_supplier_id);
  const hasConflict = selected && selected.quantity_available !== null && selected.quantity_available < line.quantity;

  if (line.supplier_options.length === 0) return <span className="text-gray-400">—</span>;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-1 rounded-lg border px-2 py-1.5 text-xs transition-colors ${hasConflict ? "border-red-300 bg-red-50" : "border-gray-200 bg-white hover:border-gray-300"}`}
      >
        <span className="truncate font-medium text-gray-700">{selected?.supplier_name ?? "Select…"}</span>
        {hasConflict && <AlertTriangle className="h-3 w-3 shrink-0 text-red-500" />}
        <ChevronDown className="h-3 w-3 shrink-0 text-gray-400" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="border-b border-gray-100 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Need {line.quantity.toFixed(1)} {line.unit}</p>
          </div>
          {line.supplier_options.map((sup) => {
            const conflict = sup.quantity_available !== null && sup.quantity_available < line.quantity;
            const isSel = sup.supplier_id === line.selected_supplier_id;
            return (
              <button
                key={sup.supplier_id}
                type="button"
                onClick={() => {
                  onSelect(sup.supplier_id);
                  setOpen(false);
                }}
                className={`flex w-full items-start justify-between px-3 py-2.5 text-left text-xs transition-colors hover:bg-gray-50 ${isSel ? "bg-orange-50/60" : ""}`}
              >
                <div className="flex flex-col items-start gap-0.5">
                  <span className={`font-semibold ${isSel ? "text-primary" : "text-gray-800"}`}>{sup.supplier_name}</span>
                  <span className="text-gray-500">
                    Stock:{" "}
                    <span className={conflict ? "font-bold text-red-600" : "font-semibold text-gray-700"}>
                      {sup.quantity_available === null ? "Unlimited" : `${sup.quantity_available.toFixed(0)} ${line.unit}`}
                    </span>
                  </span>
                  {conflict && (
                    <span className="flex items-center gap-0.5 text-red-500">
                      <AlertTriangle className="h-2.5 w-2.5" /> Insufficient for this quote
                    </span>
                  )}
                </div>
                <span className="font-bold text-gray-900">{fmtPeso(sup.unit_price)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MissingRuleRow({ line, onResolve }: { line: ProvisionalItemLine; onResolve: (unitPrice: number, saveAsRule: boolean) => void }) {
  const [value, setValue] = useState("");
  const [saveAsRule, setSaveAsRule] = useState(true);
  const parsed = Number(value);
  const valid = value.trim() !== "" && parsed > 0;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <p className="flex items-start gap-1.5 text-xs font-semibold text-amber-700">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        No rate on file for &quot;{line.item_name}&quot; ({line.segment_name}) — enter a unit price to continue.
        Nothing is guessed on your behalf.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">₱</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            type="number"
            min={0}
            step="0.01"
            placeholder="Unit price"
            className="w-32 rounded-lg border border-gray-200 bg-white py-1.5 pl-6 pr-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input type="checkbox" checked={saveAsRule} onChange={(e) => setSaveAsRule(e.target.checked)} className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/30" />
          Save as company rule for next time
        </label>
        <button
          type="button"
          disabled={!valid}
          onClick={() => onResolve(parsed, saveAsRule)}
          className="ml-auto flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition hover:bg-(--primary-hover) disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" /> Continue
        </button>
      </div>
      {saveAsRule && (
        <p className="text-[11px] text-amber-600">
          Mock only — no company_rule row is actually created yet. This previews the pattern the real save flow
          will use once rule creation is wired.
        </p>
      )}
    </div>
  );
}

// P2-D — Minor Revision is the ONLY place Part 2 lets you change a number (Part A: the
// Breakdown view is strictly read-only). Reference: MinorRevisionPanel.tsx (Replit
// prototype). "Regenerate" here means re-running the same mock formula
// (computeTierResult) against edited qty/price/supplier — there is no backend endpoint to
// regenerate against yet.
export function MinorRevisionPanel({ tier, originalItems, items, onItemsChange, pricelistBasis, onBasisChange, onClose, onApply }: MinorRevisionPanelProps) {
  const originalTotal = computeTierResult(tier, originalItems).grand_total;
  const revisedTotal = computeTierResult(tier, items).grand_total;
  const diff = revisedTotal - originalTotal;
  const conflicts = items.filter((l) => {
    const sup = l.supplier_options.find((s) => s.supplier_id === l.selected_supplier_id);
    return sup && sup.quantity_available !== null && sup.quantity_available < l.quantity;
  });

  const patchLine = (lineId: string, patch: Parameters<typeof recomputeItemLine>[1]) => {
    onItemsChange(items.map((l) => (l.line_id === lineId ? recomputeItemLine(l, patch) : l)));
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* sm:max-w-[1600px] is required alongside max-w-[1600px] — see
          QuotationBreakdownModal.tsx's identical comment for why the bare utility alone
          loses to DialogContent's own sm:max-w-sm default at any real viewport width. */}
      <DialogContent className="flex h-[92vh] w-[97vw] max-w-400 sm:max-w-400 flex-col p-0" showCloseButton={false}>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">Minor Revision — {tier}</h2>
            <p className="text-xs text-gray-500">Edit materials, quantities, prices, and suppliers without restarting the process.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500">Pricelist Basis:</span>
              <div className="flex overflow-hidden rounded-lg border border-gray-200 bg-white text-xs">
                <button
                  type="button"
                  onClick={() => onBasisChange("Uploaded")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 font-semibold transition-colors ${pricelistBasis === "Uploaded" ? "bg-primary text-primary-foreground" : "text-gray-500 hover:bg-gray-50"}`}
                >
                  <FileText className="h-3 w-3" /> Uploaded
                </button>
                <button
                  type="button"
                  onClick={() => onBasisChange("DPWH")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 font-semibold transition-colors ${pricelistBasis === "DPWH" ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-50"}`}
                >
                  <Database className="h-3 w-3" /> DPWH
                </button>
              </div>
            </div>
            <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-200">
              <X className="h-4 w-4 text-gray-600" />
            </button>
          </div>
        </div>

        {conflicts.length > 0 && (
          <div className="flex shrink-0 items-start gap-3 border-b border-red-200 bg-red-50 px-6 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <p className="text-xs text-red-700">
              {conflicts.length} supplier quantity conflict{conflicts.length > 1 ? "s" : ""} — switch to a supplier with
              sufficient stock, or adjust the quantity.
            </p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-gray-200 bg-gray-100">
                <th className="px-4 py-3 text-left font-semibold text-gray-500">Segment</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-500">Material / Labor</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-500">Qty</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-500 min-w-55">Supplier</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-500">Unit Price</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-500">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((line) => {
                const original = originalItems.find((o) => o.line_id === line.line_id);
                const changed = original && Math.abs((line.total_cost ?? 0) - (original.total_cost ?? 0)) > 1;
                if (line.unit_price === null) {
                  return (
                    <tr key={line.line_id} className="border-b border-gray-100 bg-amber-50/30">
                      <td className="px-4 py-2.5 text-gray-500">{line.segment_name}</td>
                      <td colSpan={5} className="px-4 py-2.5">
                        <MissingRuleRow line={line} onResolve={(unitPrice) => patchLine(line.line_id, { unit_price: unitPrice })} />
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
                      <EditableAmount value={line.unit_price} onCommit={(n) => patchLine(line.line_id, { unit_price: n })} />
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
            <button type="button" onClick={() => onItemsChange(originalItems)} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50">
              <RefreshCw className="h-3.5 w-3.5" /> Reset
            </button>
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50">
              Cancel
            </button>
            <button type="button" onClick={onApply} className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-(--primary-hover)">
              <Check className="h-4 w-4" /> Apply Revisions
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}