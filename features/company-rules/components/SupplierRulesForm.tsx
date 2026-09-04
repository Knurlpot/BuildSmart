"use client";

// PART A (Supplier Rules task) — the real, replacement of SupplierRulesPlaceholder.tsx.
// Built over the REAL supplier_discount_rule table (schema v3) — see
// lib/dev/provisional/companyRulesTypes.ts's SupplierRuleEntry doc for exactly why this
// doesn't reuse useEditableRuleList/RuleEnvelope the way the other five CPRM forms do.
// Reuses RuleListDetailPanel (fully generic, no changes needed) for the shared
// list+detail layout.
import { type Dispatch, type KeyboardEvent, type SetStateAction, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Filter, Pencil, X, XCircle } from "lucide-react";
import { FieldHelp } from "./FieldHelp";
import { RuleListDetailPanel } from "./RuleListDetailPanel";
import { useSupplierRules } from "@/lib/dev/provisional/useCompanyRulesProvisional";
import { useSuppliers } from "@/hooks/useSuppliers";
import { isPercent, isPositiveNumber } from "@/lib/dev/provisional/ruleValidation";
import { SUPPLIER_RULE_TYPES, type SupplierRuleEntry, type SupplierRuleType } from "@/lib/dev/provisional/companyRulesTypes";

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20";

// Local formatter, same convention LaborRulesForm.tsx already uses — feature-local rather
// than importing quotation-generation's fmtPeso, keeping the two features decoupled.
function fmtPeso(n: number): string {
  return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

function fmtPesoAmount(n: number): string {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

function parsePesoInput(value: string): number {
  const amount = Number(value.replace(/[₱,\s]/g, ""));
  return Number.isFinite(amount) ? amount : Number.NaN;
}

function fmtPesoInput(value: string | number): string {
  const amount = typeof value === "number" ? value : parsePesoInput(value);
  return Number.isFinite(amount) ? fmtPesoAmount(amount) : "";
}

function formatPesoInputFromDigits(value: string): string {
  const digits = value.split(".")[0].replace(/\D/g, "");
  if (digits === "") return "";
  return fmtPesoAmount(Number(digits));
}

function handlePesoKeyDown(event: KeyboardEvent<HTMLInputElement>, value: string, setValue: Dispatch<SetStateAction<string>>) {
  const input = event.currentTarget;

  if (/^\d$/.test(event.key)) {
    event.preventDefault();
    const digits = value.split(".")[0].replace(/\D/g, "") + event.key;
    const nextValue = formatPesoInputFromDigits(digits);
    setValue(nextValue);
    requestAnimationFrame(() => moveCaretBeforeDecimals(input));
    return;
  }

  if (event.key === "Backspace") {
    event.preventDefault();
    const digits = value.split(".")[0].replace(/\D/g, "").slice(0, -1);
    const nextValue = digits === "" ? "" : formatPesoInputFromDigits(digits);
    setValue(nextValue);
    requestAnimationFrame(() => moveCaretBeforeDecimals(input));
  }
}

function moveCaretBeforeDecimals(input: HTMLInputElement) {
  const decimalIndex = input.value.indexOf(".");
  const position = decimalIndex === -1 ? input.value.length : decimalIndex;
  input.setSelectionRange(position, position);
}

function parsePercentInput(value: string): number {
  const amount = Number(value.replace(/[%\s]/g, ""));
  return Number.isFinite(amount) ? amount : Number.NaN;
}

function fmtPercentInput(value: string | number): string {
  const amount = typeof value === "number" ? value : parsePercentInput(value);
  return Number.isFinite(amount) ? String(amount) : "";
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type DiscountKind = "percentage" | "fixed";

// Show relevant fields per rule_type only — Minimum Order and Bulk Discount both use a
// qualifying order size (a threshold for Bulk Discount, the whole point for Minimum
// Order); Bulk Discount and Negotiated Price both use a discount amount, either percentage
// or fixed; Preferred Supplier uses neither.
function usesMinimumOrder(type: SupplierRuleType): boolean {
  return type === "Minimum Order" || type === "Bulk Discount";
}
function usesDiscountFields(type: SupplierRuleType): boolean {
  return type === "Bulk Discount" || type === "Negotiated Price";
}

function ruleSummary(r: SupplierRuleEntry): string {
  if (r.rule_type === "Minimum Order") {
    return r.minimum_order_amount !== null ? `Min. order ${fmtPeso(r.minimum_order_amount)}` : "Minimum order";
  }
  if (r.rule_type === "Bulk Discount") {
    const threshold = r.minimum_order_amount !== null ? ` on orders ≥ ${fmtPeso(r.minimum_order_amount)}` : "";
    if (r.discount_percentage_rate !== null) return `${r.discount_percentage_rate}% off${threshold}`;
    if (r.fixed_discount_amount !== null) return `${fmtPeso(r.fixed_discount_amount)} off${threshold}`;
    return `Bulk discount${threshold}`;
  }
  if (r.rule_type === "Negotiated Price") {
    if (r.discount_percentage_rate !== null) return `${r.discount_percentage_rate}% negotiated discount`;
    if (r.fixed_discount_amount !== null) return `${fmtPeso(r.fixed_discount_amount)} negotiated discount`;
    return "Negotiated price";
  }
  return "Preferred supplier with no discount terms";
}

function supplierRuleRecordKey(r: SupplierRuleEntry): string {
  return [
    r.supplier_id,
    r.rule_type,
    r.minimum_order_amount ?? "",
    r.discount_percentage_rate ?? "",
    r.fixed_discount_amount ?? "",
    r.effective_date,
    r.expiration_date ?? "",
    r.is_active ? "active" : "inactive",
  ].join("|");
}

const RULE_TYPE_BADGE_CLS: Record<SupplierRuleType, string> = {
  "Bulk Discount": "bg-orange-50 text-primary",
  "Negotiated Price": "bg-indigo-50 text-indigo-600",
  "Minimum Order": "bg-blue-50 text-blue-600",
  "Preferred Supplier": "bg-green-50 text-green-700",
};

function RuleTypeBadge({ type }: { type: SupplierRuleType }) {
  return <span className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${RULE_TYPE_BADGE_CLS[type]}`}>{type}</span>;
}

interface SupplierRulesFormProps {
  focusRuleId?: string | null;
  onFocusHandled?: () => void;
}

export function SupplierRulesForm({ focusRuleId, onFocusHandled }: SupplierRulesFormProps) {
  const {
    rules,
    isLoading,
    error,
    refetch,
    save,
    isSaving,
    saveError,
    resetSave,
    update,
    isUpdating,
    updateError,
    resetUpdate,
    deactivate,
    isDeactivating,
    deactivateError,
  } = useSupplierRules();
  const { suppliers, isLoading: suppliersLoading } = useSuppliers();

  // Keep an immediate local view of edits/creates while the shared company rules payload
  // refetches after persistence.
  const [overrides, setOverrides] = useState<Record<string, Partial<SupplierRuleEntry>>>({});
  const [localExtra, setLocalExtra] = useState<SupplierRuleEntry[]>([]);
  const persistedRuleKeys = new Set(rules.map(supplierRuleRecordKey));
  const visibleLocalExtra = localExtra.filter((r) => !persistedRuleKeys.has(supplierRuleRecordKey(r)));
  const allRules = [...visibleLocalExtra, ...rules]
    .map((r) => (overrides[r.rule_id] ? { ...r, ...overrides[r.rule_id] } : r))
    .sort((a, b) => a.supplier_name.localeCompare(b.supplier_name) || a.rule_type.localeCompare(b.rule_type));
  const [statusFilter, setStatusFilter] = useState<"active" | "disabled">("active");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [supplierFilter, setSupplierFilter] = useState<number | "">("");
  const [pendingSupplierFilter, setPendingSupplierFilter] = useState<number | "">("");
  const [ruleTypeFilter, setRuleTypeFilter] = useState<SupplierRuleType | "">("");
  const [pendingRuleTypeFilter, setPendingRuleTypeFilter] = useState<SupplierRuleType | "">("");

  const [selectedId, setSelectedId] = useState<string | null>(focusRuleId ?? null);
  const [mode, setMode] = useState<"idle" | "add" | "edit">("idle");
  const [supplierId, setSupplierId] = useState<number | "">("");
  const [ruleType, setRuleType] = useState<SupplierRuleType | "">("");
  const [discountKind, setDiscountKind] = useState<DiscountKind>("percentage");
  const [minimumOrder, setMinimumOrder] = useState("");
  const [percentageRate, setPercentageRate] = useState("");
  const [fixedAmount, setFixedAmount] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(todayIso());
  const [expirationDate, setExpirationDate] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [touched, setTouched] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  useEffect(() => {
    if (focusRuleId) onFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setSupplierId("");
    setRuleType("");
    setDiscountKind("percentage");
    setMinimumOrder("");
    setPercentageRate("");
    setFixedAmount("");
    setEffectiveDate(todayIso());
    setExpirationDate("");
    setIsActive(true);
    setTouched(false);
  };

  const startAdd = () => {
    setMode("add");
    setSelectedId(null);
    resetForm();
    setSavedMessage(false);
    resetSave();
  };

  const startEdit = (r: SupplierRuleEntry) => {
    setMode("edit");
    setSupplierId(r.supplier_id);
    setRuleType(r.rule_type);
    setDiscountKind(r.fixed_discount_amount !== null ? "fixed" : "percentage");
    setMinimumOrder(r.minimum_order_amount !== null ? fmtPesoInput(r.minimum_order_amount) : "");
    setPercentageRate(r.discount_percentage_rate !== null ? fmtPercentInput(r.discount_percentage_rate) : "");
    setFixedAmount(r.fixed_discount_amount !== null ? fmtPesoInput(r.fixed_discount_amount) : "");
    setEffectiveDate(r.effective_date);
    setExpirationDate(r.expiration_date ?? "");
    setIsActive(r.is_active);
    setTouched(false);
    setSavedMessage(false);
    resetUpdate();
  };

  const supplierValid = supplierId !== "";
  const ruleTypeValid = ruleType !== "";
  const minimumOrderAmount = parsePesoInput(minimumOrder);
  const percentageRateAmount = parsePercentInput(percentageRate);
  const fixedDiscountAmount = parsePesoInput(fixedAmount);
  const minimumOrderValid = ruleType === "" || !usesMinimumOrder(ruleType) || (minimumOrder !== "" && isPositiveNumber(minimumOrderAmount));
  const discountValid =
    ruleType === "" ||
    !usesDiscountFields(ruleType) ||
    (discountKind === "percentage"
      ? percentageRate !== "" && isPercent(percentageRateAmount)
      : fixedAmount !== "" && isPositiveNumber(fixedDiscountAmount));
  const effectiveValid = effectiveDate !== "";
  const expirationValid = expirationDate === "" || expirationDate >= effectiveDate;
  const formValid = supplierValid && ruleTypeValid && minimumOrderValid && discountValid && effectiveValid && expirationValid;

  // The currently-selected supplier stays in the dropdown even if it's since gone
  // Inactive (editing an old rule shouldn't render a blank/invalid picker) — new rules
  // otherwise only offer Active suppliers, since negotiating fresh terms with an inactive
  // one doesn't make sense.
  const supplierOptions = [
    ...suppliers.filter((s) => s.status === "Active"),
    ...suppliers.filter((s) => s.status !== "Active" && s.supplier_id === supplierId),
  ];

  const buildPayload = (): Omit<SupplierRuleEntry, "rule_id"> => {
    const type = ruleType as SupplierRuleType;
    const supplier = suppliers.find((s) => s.supplier_id === supplierId);
    return {
      supplier_id: Number(supplierId),
      supplier_name: supplier?.supplier_name ?? "",
      rule_type: type,
      minimum_order_amount: usesMinimumOrder(type) && minimumOrder !== "" ? minimumOrderAmount : null,
      discount_percentage_rate: usesDiscountFields(type) && discountKind === "percentage" && percentageRate !== "" ? percentageRateAmount : null,
      fixed_discount_amount: usesDiscountFields(type) && discountKind === "fixed" && fixedAmount !== "" ? fixedDiscountAmount : null,
      effective_date: effectiveDate,
      expiration_date: expirationDate || null,
      is_active: isActive,
    };
  };

  const handleSave = async () => {
    setTouched(true);
    if (!formValid) return;
    const payload = buildPayload();

    if (mode === "edit" && selectedId) {
      try {
        await update(selectedId, payload);
        setOverrides((prev) => ({ ...prev, [selectedId]: payload }));
        setStatusFilter(payload.is_active ? "active" : "disabled");
        setMode("idle");
        setSavedMessage(true);
      } catch {
        // surfaced via updateError below — no fabricated success
      }
      return;
    }

    try {
      const saved = await save(payload);
      setLocalExtra((prev) => [saved, ...prev.filter((r) => supplierRuleRecordKey(r) !== supplierRuleRecordKey(saved))]);
      setStatusFilter(saved.is_active ? "active" : "disabled");
      setMode("idle");
      setSelectedId(saved.rule_id);
      setSavedMessage(true);
    } catch {
      // surfaced via saveError below — no fabricated success
    }
  };

  const handleDeactivate = async (r: SupplierRuleEntry) => {
    setDeactivatingId(r.rule_id);
    try {
      await deactivate(r.rule_id);
      setOverrides((prev) => ({ ...prev, [r.rule_id]: { is_active: false, expiration_date: todayIso() } }));
      setStatusFilter("disabled");
      setSelectedId(r.rule_id);
    } catch {
      // surfaced via deactivateError below — no fabricated success
    } finally {
      setDeactivatingId(null);
    }
  };

  const selected = allRules.find((r) => r.rule_id === selectedId) ?? null;
  const effectiveStatusFilter = selected?.is_active === false ? "disabled" : statusFilter;
  const visibleRules = allRules.filter((rule) => {
    if (rule.is_active !== (effectiveStatusFilter === "active")) return false;
    if (supplierFilter !== "" && rule.supplier_id !== supplierFilter) return false;
    if (ruleTypeFilter !== "" && rule.rule_type !== ruleTypeFilter) return false;
    return true;
  });
  const activeFilterCount = (supplierFilter !== "" ? 1 : 0) + (ruleTypeFilter !== "" ? 1 : 0);
  const supplierFilterOptions = [...suppliers].sort((a, b) => a.supplier_name.localeCompare(b.supplier_name));

  const openFilters = () => {
    setPendingSupplierFilter(supplierFilter);
    setPendingRuleTypeFilter(ruleTypeFilter);
    setFiltersOpen((open) => !open);
  };

  const applyFilters = () => {
    setSupplierFilter(pendingSupplierFilter);
    setRuleTypeFilter(pendingRuleTypeFilter);
    setSelectedId(null);
    setMode("idle");
    setFiltersOpen(false);
  };

  const resetFilters = () => {
    setSupplierFilter("");
    setPendingSupplierFilter("");
    setRuleTypeFilter("");
    setPendingRuleTypeFilter("");
    setSelectedId(null);
    setMode("idle");
    setFiltersOpen(false);
  };

  const header = (
    <div>
      <h2 className="text-base font-bold text-gray-900">Supplier Rules</h2>
      <p className="text-xs text-gray-500">Set supplier discounts, minimum orders, and preferred status.</p>
    </div>
  );

  // Honest empty state — Supplier Rules has nothing to attach a rule to without a
  // supplier on file yet (Manage Pricelist's supplier records, not created here).
  if (!suppliersLoading && suppliers.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white p-16 text-center">
          <p className="text-sm font-bold text-gray-700">Add suppliers first</p>
          <p className="max-w-sm text-sm text-gray-400">
            Add a supplier before creating rules.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {header}

      <RuleListDetailPanel
        title="Supplier Rules"
        items={visibleRules}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        getId={(r) => r.rule_id}
        selectedId={selectedId}
        onSelect={(id) => {
          setSelectedId(id);
          setMode("idle");
        }}
        onAdd={startAdd}
        countLabel={`${allRules.length} configured`}
        listHeader={
          <div className="relative flex flex-col gap-2">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
              {(["active", "disabled"] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => {
                    setStatusFilter(filter);
                    setMode("idle");
                    setSelectedId(null);
                  }}
                  className={`min-h-9 rounded-lg border px-3 py-2 text-center text-xs font-semibold capitalize transition ${
                    effectiveStatusFilter === filter
                      ? "border-primary bg-orange-50 text-primary"
                      : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                  }`}
                >
                  {filter}
                </button>
              ))}
              <button
                type="button"
                onClick={openFilters}
                title="Filter supplier rules"
                aria-label="Filter supplier rules"
                aria-expanded={filtersOpen}
                className={`relative flex h-9 w-9 items-center justify-center rounded-lg border transition ${
                  activeFilterCount > 0
                    ? "border-primary bg-orange-50 text-primary"
                    : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                }`}
              >
                <Filter className="h-4 w-4" />
                {activeFilterCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>
            {filtersOpen && (
              <div className="absolute right-0 top-11 z-30 w-full rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
                <div className="grid grid-cols-1 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-gray-600">Supplier</label>
                    <select value={pendingSupplierFilter} onChange={(e) => setPendingSupplierFilter(e.target.value ? Number(e.target.value) : "")} className={inputCls}>
                      <option value="">All suppliers</option>
                      {supplierFilterOptions.map((supplier) => (
                        <option key={supplier.supplier_id} value={supplier.supplier_id}>
                          {supplier.supplier_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-gray-600">Rule Type</label>
                    <select value={pendingRuleTypeFilter} onChange={(e) => setPendingRuleTypeFilter(e.target.value as SupplierRuleType | "")} className={inputCls}>
                      <option value="">All rule types</option>
                      {SUPPLIER_RULE_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={resetFilters} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-500 transition hover:border-gray-300">
                    Reset
                  </button>
                  <button type="button" onClick={applyFilters} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition hover:bg-(--primary-hover)">
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>
        }
        renderListItem={(r) => (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold text-gray-800">{r.supplier_name}</span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  r.is_active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-400"
                }`}
              >
                {r.is_active ? "Active" : "Disabled"}
              </span>
            </div>
            <RuleTypeBadge type={r.rule_type} />
            <span className="text-xs text-gray-400">{ruleSummary(r)}</span>
          </div>
        )}
        detail={
          mode === "add" || mode === "edit" ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-gray-900">{mode === "edit" ? "Edit Supplier Rule" : "New Supplier Rule"}</p>
                <button type="button" onClick={() => setMode("idle")} className="text-gray-300 hover:text-gray-500">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                  Supplier
                  <FieldHelp text="The supplier this rule applies to during quotation pricing and supplier ranking." />
                  <span className="text-red-500">*</span>
                </label>
                <select value={supplierId} onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : "")} className={inputCls}>
                  <option value="">Select…</option>
                  {supplierOptions.map((s) => (
                    <option key={s.supplier_id} value={s.supplier_id}>
                      {s.supplier_name}
                      {s.status !== "Active" ? " (Inactive)" : ""}
                    </option>
                  ))}
                </select>
                {touched && !supplierValid && <p className="text-xs text-red-500">Select a supplier.</p>}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                  Rule Type
                  <FieldHelp text="Defines how the supplier rule behaves: discount, negotiated price, minimum order, or preferred supplier." />
                  <span className="text-red-500">*</span>
                </label>
                <select value={ruleType} onChange={(e) => setRuleType(e.target.value as SupplierRuleType)} className={inputCls}>
                  <option value="">Select…</option>
                  {SUPPLIER_RULE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                {touched && !ruleTypeValid && <p className="text-xs text-red-500">Select a rule type.</p>}
              </div>

              {(ruleType !== "" && usesMinimumOrder(ruleType)) || (ruleType !== "" && usesDiscountFields(ruleType)) ? (
                <div className="flex flex-col gap-3">
                  {usesDiscountFields(ruleType) && (
                    <div className="flex min-w-0 flex-col gap-2">
                      <div className="grid grid-cols-1 gap-2">
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                          Discount
                          <FieldHelp text="The price reduction applied when this supplier rule is used in quotation generation." />
                        </label>
                        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                          <div className="grid min-w-0 grid-cols-2 gap-1 rounded-lg border border-gray-200 bg-white p-1">
                            {(["percentage", "fixed"] as DiscountKind[]).map((k) => (
                              <button
                                key={k}
                                type="button"
                                onClick={() => setDiscountKind(k)}
                                className={`min-h-8 min-w-0 whitespace-nowrap rounded-md px-2 py-1 text-center text-xs font-semibold transition ${
                                  discountKind === k ? "bg-primary text-primary-foreground" : "text-gray-500 hover:bg-gray-50"
                                }`}
                              >
                                {k === "percentage" ? "Percentage" : "Fixed Amount"}
                              </button>
                            ))}
                          </div>
                          {discountKind === "percentage" ? (
                            <div className="relative min-w-0">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={percentageRate}
                                onChange={(e) => setPercentageRate(e.target.value.replace(/[^\d.]/g, ""))}
                                placeholder="5"
                                className={`${inputCls} pr-8 tabular-nums`}
                              />
                              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">%</span>
                            </div>
                          ) : (
                            <div className="relative min-w-0">
                              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">₱</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={fixedAmount}
                                onFocus={(e) => moveCaretBeforeDecimals(e.currentTarget)}
                                onKeyDown={(e) => handlePesoKeyDown(e, fixedAmount, setFixedAmount)}
                                onChange={(e) => setFixedAmount(formatPesoInputFromDigits(e.target.value))}
                                placeholder="15,000.00"
                                className={`${inputCls} pl-7 tabular-nums`}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                      {touched && !discountValid && (
                        <p className="text-xs text-red-500">{discountKind === "percentage" ? "Enter a percentage between 0 and 100." : "Enter a positive amount."}</p>
                      )}
                    </div>
                  )}

                  {usesMinimumOrder(ruleType) && (
                    <div className="flex min-w-0 flex-col gap-2">
                      <div className="grid grid-cols-1 gap-1.5">
                        <div>
                          <label className="flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-gray-600">
                            {ruleType === "Minimum Order" ? "Minimum Order Amount" : "Order Threshold"} (₱)
                            <FieldHelp text="Minimum Order records the supplier policy. Order Threshold controls when a bulk discount becomes available." />
                            <span className="text-red-500">*</span>
                          </label>
                        </div>
                        <div className="relative min-w-0">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">₱</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={minimumOrder}
                            onFocus={(e) => moveCaretBeforeDecimals(e.currentTarget)}
                            onKeyDown={(e) => handlePesoKeyDown(e, minimumOrder, setMinimumOrder)}
                            onChange={(e) => setMinimumOrder(formatPesoInputFromDigits(e.target.value))}
                            placeholder="500,000.00"
                            className={`${inputCls} pl-7 tabular-nums`}
                          />
                        </div>
                      </div>
                      {touched && !minimumOrderValid && <p className="text-xs text-red-500">Enter a positive amount.</p>}
                    </div>
                  )}
                </div>
              ) : null}

              {ruleType === "Preferred Supplier" && (
                <p className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2 text-xs text-gray-500">
                  Marks this supplier as preferred without a discount.
                </p>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                    Effective Date
                    <FieldHelp text="The date when this supplier rule starts being considered by the system." />
                    <span className="text-red-500">*</span>
                  </label>
                  <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className={inputCls} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                    Expiration Date
                    <FieldHelp text="Optional end date. Leave blank if this rule should remain active until manually disabled." />
                    <span className="text-[10px] font-medium text-gray-400">(optional)</span>
                  </label>
                  <input type="date" value={expirationDate} onChange={(e) => setExpirationDate(e.target.value)} className={inputCls} />
                  {touched && !expirationValid && <p className="text-xs text-red-500">Expiration can&apos;t be before the effective date.</p>}
                </div>
              </div>

              <label className="flex items-center gap-2.5 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/30"
                />
                Active
              </label>

              {(saveError || updateError) && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Couldn&apos;t save: {(saveError ?? updateError)?.message}
                </div>
              )}

              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || isUpdating}
                className="w-fit rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60"
              >
                {isSaving || isUpdating ? "Saving…" : mode === "edit" ? "Save Changes" : "Save Supplier Rule"}
              </button>
            </div>
          ) : selected ? (
            <div className="flex flex-col gap-4">
              {savedMessage && (
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> Supplier Rule updated.
                </div>
              )}
              <div className="flex items-start justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                <div className="flex flex-col gap-1.5">
                  <p className="text-lg font-bold text-gray-900">{selected.supplier_name}</p>
                  <span
                    className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      selected.is_active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {selected.is_active ? "Active" : "Disabled"}
                  </span>
                  <RuleTypeBadge type={selected.rule_type} />
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(selected)}
                    title="Edit"
                    aria-label="Edit supplier rule"
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:border-primary hover:text-primary"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {selected.is_active && (
                    <button
                      type="button"
                      disabled={deactivatingId === selected.rule_id && isDeactivating}
                      onClick={() => handleDeactivate(selected)}
                      title="Disable"
                      aria-label="Disable supplier rule"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:border-red-300 hover:text-red-600 disabled:opacity-50"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {deactivateError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">Couldn&apos;t deactivate: {deactivateError.message}</div>}

              <dl className="grid grid-cols-2 gap-4 px-4 text-sm">
                {selected.minimum_order_amount !== null && (
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">{selected.rule_type === "Minimum Order" ? "Minimum Order" : "Order Threshold"}</dt>
                    <dd className="text-gray-700">{fmtPeso(selected.minimum_order_amount)}</dd>
                  </div>
                )}
                {selected.discount_percentage_rate !== null && (
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Discount Rate</dt>
                    <dd className="text-gray-700">{selected.discount_percentage_rate}%</dd>
                  </div>
                )}
                {selected.fixed_discount_amount !== null && (
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Fixed Discount</dt>
                    <dd className="text-gray-700">{fmtPeso(selected.fixed_discount_amount)}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Effective</dt>
                  <dd className="text-gray-700">{selected.effective_date}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Expiration</dt>
                  <dd className="text-gray-700">{selected.expiration_date ?? "No end date"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Status</dt>
                  <dd className="text-gray-700">{selected.is_active ? "Active" : "Disabled"}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="flex min-h-[26rem] w-full flex-col items-center justify-center gap-2 text-center text-gray-400">
              <p className="text-sm">Select Supplier Rule</p>
            </div>
          )
        }
      />
    </div>
  );
}
