"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Pencil, Search, X, XCircle } from "lucide-react";
import { RuleListDetailPanel } from "./RuleListDetailPanel";
import { useMaterialRules, useCheckRuleUsage, stagingId } from "@/lib/dev/provisional/useCompanyRulesProvisional";
import { useEditableRuleList } from "@/lib/dev/provisional/useEditableRuleList";
import { apiClient } from "@/lib/api/client";
import { MATERIAL_TREATMENT_TIERS, type MaterialRuleEntry, type MaterialTreatmentTier } from "@/lib/dev/provisional/companyRulesTypes";
import { useItemsCatalog } from "@/hooks/useItemsCatalog";
import { usePricelistCatalog, type SavedPriceRecord } from "@/hooks/usePricelistCatalog";
import { usePricelistPublishedSource, type DpwhCatalogRow } from "@/hooks/usePricelistPublishedSource";
import { useCategories } from "@/hooks/useCategories";
import { useSuppliers } from "@/hooks/useSuppliers";
import { TREATMENT_TYPES } from "@/lib/dev/provisional/quotationGenerationTypes";
import { CATEGORY_TYPES, type CategoryType } from "@/types/entities/category";
import type { Items } from "@/types/entities/items";

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20";

const DEFAULT_MATERIAL_PRIORITY = 1;
const DEFAULT_PRIORITY_SOURCE = "Supplier" as const;
const DEFAULT_FALLBACK_RULE = "Flag for manual review" as const;
const TREATMENT_OPTIONS = [...TREATMENT_TYPES];
const DPWH_SUPPLIER_VALUE = "DPWH";
const tierBadgeClass = (tier: MaterialTreatmentTier) =>
  tier === "Premium" ? "bg-[#0000CD]/5 text-[#0000CD]" : "bg-orange-50 text-primary";
const activeTierFilterClass = (tier: MaterialTreatmentTier) =>
  tier === "Premium" ? "border-[#0000CD]/40 bg-[#0000CD]/5 text-[#0000CD]" : "border-primary bg-orange-50 text-primary";

interface MaterialRulesFormProps {
  focusRuleId?: string | null;
  onFocusHandled?: () => void;
}

type CatalogItem = Items & { catalogKey: string };

// v6 Correction 3 — REBUILT as a catalog picker. A category contains many materials used
// TOGETHER (a waterproofing system needs primer AND membrane AND topcoat), not
// alternatives chosen one-per-category from a dropdown — so this is now a flat,
// standalone list of treatment-tagged material records, added by searching/checking
// items straight from the catalog. Category is filtering metadata on the picker, not the
// organizing structure of the list itself (see RuleListDetailPanel below, same
// select+detail pattern every other rule type already uses).
export function MaterialRulesForm({ focusRuleId, onFocusHandled }: MaterialRulesFormProps) {
  const {
    rules,
    isLoading,
    error,
    refetch,
    save,
    update,
    supersede,
    isSaving: isCreating,
    saveError: createError,
    resetSave: resetCreate,
  } = useMaterialRules();
  const { checkUsage } = useCheckRuleUsage();
  const editable = useEditableRuleList<MaterialRuleEntry>({ checkUsage, update, supersede, idPrefix: "mr" });
  const { isLoading: itemsLoading, error: itemsError } = useItemsCatalog();
  const { categories, isLoading: categoriesLoading, error: categoriesError } = useCategories();
  const { suppliers, isLoading: suppliersLoading } = useSuppliers();
  const supplierCatalog = usePricelistCatalog();
  const { dpwhCatalog } = usePricelistPublishedSource();
  const supplierCatalogRecords = supplierCatalog.records;
  const supplierCatalogLoad = supplierCatalog.load;
  const supplierCatalogLoading = supplierCatalog.isLoading;
  const supplierCatalogError = supplierCatalog.error;
  const dpwhCatalogRecords = dpwhCatalog.records;
  const dpwhCatalogLoad = dpwhCatalog.load;
  const dpwhCatalogLoading = dpwhCatalog.isLoading;
  const dpwhCatalogError = dpwhCatalog.error;

  const allRules = editable.applyOverrides([...editable.localExtra, ...rules]);

  const categoryTypeOf = (item: Items): CategoryType | undefined =>
    categories.find((c) => c.category_id === item.category_id)?.category_type;

  // Seeded from the prop at construction, not synced via effect: a jump always remounts
  // this component fresh through CompanyRulesShell.
  const [selectedId, setSelectedId] = useState<string | null>(focusRuleId ?? null);
  const [mode, setMode] = useState<"idle" | "details" | "browse" | "configure" | "edit-group">("idle");
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState<string>(DPWH_SUPPLIER_VALUE);
  const [categoryFilter, setCategoryFilter] = useState<CategoryType | "">("");
  const [checkedCatalogKeys, setCheckedCatalogKeys] = useState<Set<string>>(new Set());
  const [treatmentType, setTreatmentType] = useState("");
  const [treatmentTier, setTreatmentTier] = useState<MaterialTreatmentTier>("Practical");
  const [warrantyYears, setWarrantyYears] = useState<number | "">("");
  const [lifespanYears, setLifespanYears] = useState<number | "">("");
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);
  const [isDisablingGroup, setIsDisablingGroup] = useState(false);
  const [disableError, setDisableError] = useState<Error | null>(null);

  useEffect(() => {
    if (focusRuleId) onFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categoryIdByType = useMemo(
    () => new Map(categories.map((category) => [category.category_type, category.category_id])),
    [categories]
  );

  const catalogItems = useMemo<CatalogItem[]>(() => {
    if (supplierFilter === DPWH_SUPPLIER_VALUE) {
      return dpwhCatalogRecords.map((record: DpwhCatalogRow) => ({
        catalogKey: `dpwh-${record.historicalrec_id}`,
        item_code: record.item_code,
        category_id: record.category_type ? categoryIdByType.get(record.category_type as CategoryType) ?? 0 : 0,
        company_id: null,
        item_name: record.item_name ?? `Material ${record.item_code}`,
        brand: "",
        unit: "",
        item_source: "DPWH",
        source_location: record.location ?? record.region ?? null,
        description: record.location ?? record.region ?? undefined,
      }));
    }

    const supplierId = Number(supplierFilter);
    return supplierCatalogRecords
      .filter((record: SavedPriceRecord) => record.supplier_id === supplierId)
      .map((record) => ({
        catalogKey: `supplier-${record.historicalrec_id}`,
        item_code: record.item_code,
        category_id: record.category_type ? categoryIdByType.get(record.category_type as CategoryType) ?? 0 : 0,
        company_id: null,
        item_name: record.item_name,
        brand: record.brand,
        unit: record.unit,
        item_source: "Supplier",
        source_location: record.supplier_location,
        description: record.description_material || record.supplier_location || undefined,
      }));
  }, [categoryIdByType, dpwhCatalogRecords, supplierCatalogRecords, supplierFilter]);

  useEffect(() => {
    if (mode !== "browse") return;
    if (supplierFilter === DPWH_SUPPLIER_VALUE) {
      dpwhCatalogLoad();
    } else {
      supplierCatalogLoad();
    }
  }, [mode, supplierFilter, dpwhCatalogLoad, supplierCatalogLoad]);

  const filteredItems = catalogItems.filter((item) => {
    const matchesSearch = search.trim() === "" || item.item_name.toLowerCase().includes(search.trim().toLowerCase());
    const matchesCategory = categoryFilter === "" || categoryTypeOf(item) === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const itemMeta = (item: Items) =>
    [
      item.description?.trim(),
      categoryTypeOf(item) ?? "Uncategorized",
      item.brand,
      item.unit,
    ].filter(Boolean).join(" · ");

  const checkedItems = catalogItems.filter((i) => checkedCatalogKeys.has(i.catalogKey));

  const toggleChecked = (catalogKey: string) => {
    setCheckedCatalogKeys((prev) => {
      const next = new Set(prev);
      if (next.has(catalogKey)) next.delete(catalogKey);
      else next.add(catalogKey);
      return next;
    });
  };

  const startAdd = () => {
    resetCreate();
    setMode("details");
    setSelectedId(null);
    setSelectedGroup(null);
    setSearch("");
    setSupplierFilter(DPWH_SUPPLIER_VALUE);
    setCategoryFilter("");
    setCheckedCatalogKeys(new Set());
    setTreatmentType("");
    setTreatmentTier("Practical");
    setWarrantyYears("");
    setLifespanYears("");
    setTouched(false);
    setSavedMessage(false);
  };

  const goToConfigure = () => {
    setTouched(false);
    setMode("configure");
  };

  const activeTreatmentTierExists = allRules.some(
    (rule) =>
      rule.is_active &&
      rule.treatment_type?.trim() === treatmentType.trim() &&
      (rule.treatment_tier ?? "Practical") === treatmentTier
  );
  const activeTiersForTreatment = (type: string) =>
    new Set(
      allRules
        .filter((rule) => rule.is_active && rule.treatment_type?.trim() === type.trim())
        .map((rule) => rule.treatment_tier ?? "Practical")
    );
  const availableTreatmentOptions = TREATMENT_OPTIONS.filter(
    (type) => activeTiersForTreatment(type).size < MATERIAL_TREATMENT_TIERS.length
  );
  const availableTiersForSelectedTreatment = MATERIAL_TREATMENT_TIERS.filter(
    (tier) => !activeTiersForTreatment(treatmentType).has(tier)
  );

  const treatmentDetailsValid =
    availableTreatmentOptions.includes(treatmentType as (typeof availableTreatmentOptions)[number]) &&
    !activeTreatmentTierExists &&
    warrantyYears !== "" &&
    Number(warrantyYears) > 0 &&
    lifespanYears !== "" &&
    Number(lifespanYears) > 0;

  const startEditGroup = (groupId: string) => {
    const groupRules = groupedRules.find(([id]) => id === groupId)?.[1] ?? [];
    const firstWithWarranty = groupRules.find((rule) => rule.warranty_years !== null);
    const firstWithLifespan = groupRules.find((rule) => rule.lifespan_years !== null);
    setMode("edit-group");
    const groupTreatment = groupRules[0]?.treatment_type?.trim() || "No treatment type";
    setTreatmentType(groupTreatment === "No treatment type" ? "" : groupTreatment);
    setTreatmentTier(groupRules[0]?.treatment_tier ?? "Practical");
    setWarrantyYears(firstWithWarranty?.warranty_years ?? "");
    setLifespanYears(firstWithLifespan?.lifespan_years ?? "");
    setTouched(false);
    setSavedMessage(false);
  };

  const allConfigValid =
    checkedItems.length > 0 &&
    availableTreatmentOptions.includes(treatmentType as (typeof availableTreatmentOptions)[number]) &&
    !activeTreatmentTierExists &&
    warrantyYears !== "" &&
    Number(warrantyYears) > 0 &&
    lifespanYears !== "" &&
    Number(lifespanYears) > 0 &&
    checkedItems.every((i) => categoryTypeOf(i) !== undefined);

  const handleSaveAll = async () => {
    setTouched(true);
    if (!allConfigValid) return;
    try {
      for (const item of checkedItems) {
        const code = String(item.item_code);
        const category = categoryTypeOf(item);
        if (!category) throw new Error(`Could not resolve the category for ${item.item_name}.`);
        const payload = {
          treatment_type: treatmentType.trim() || null,
          treatment_tier: treatmentTier,
          material_rule_name: null,
          warranty_years: Number(warrantyYears),
          lifespan_years: Number(lifespanYears),
          category,
          preferred_item_code: code,
          preferred_item_name: item.item_name,
          material_priority: DEFAULT_MATERIAL_PRIORITY,
          priority_source: supplierFilter === DPWH_SUPPLIER_VALUE ? "DPWH" as const : DEFAULT_PRIORITY_SOURCE,
          fallback_rule: DEFAULT_FALLBACK_RULE,
        };
        await save(payload);
        editable.addCreated({
          rule_id: stagingId("mr"),
          ...payload,
          is_active: true,
          effective_date: new Date().toISOString().slice(0, 10),
        });
      }
      setMode("idle");
      setSelectedGroup(`${treatmentType.trim() || "No treatment type"}::${treatmentTier}`);
      setSavedMessage(true);
    } catch {
      // surfaced via editable.saveError below — no fabricated success
    }
  };

  const handleSaveGroupEdit = async () => {
    setTouched(true);
    if (!groupEditValid) return;
    const nextGroup = treatmentType.trim();
    let savedAny = false;
    for (const rule of selectedGroupRules) {
      const payload = {
          treatment_type: nextGroup,
          treatment_tier: treatmentTier,
          material_rule_name: null,
          warranty_years: Number(warrantyYears),
        lifespan_years: Number(lifespanYears),
        category: rule.category,
        preferred_item_code: rule.preferred_item_code,
        preferred_item_name: rule.preferred_item_name,
        material_priority: rule.material_priority || DEFAULT_MATERIAL_PRIORITY,
        priority_source: rule.priority_source || DEFAULT_PRIORITY_SOURCE,
        fallback_rule: rule.fallback_rule || DEFAULT_FALLBACK_RULE,
      };
      const resultId = await editable.saveEdit(rule.rule_id, payload);
      if (resultId) savedAny = true;
    }
    if (savedAny) {
      setMode("idle");
      setSelectedId(null);
      setSelectedGroup(`${nextGroup || "No treatment type"}::${treatmentTier}`);
      setSavedMessage(true);
    }
  };

  const selected = allRules.find((r) => r.rule_id === selectedId) ?? null;
  const groupedRules = Array.from(
    allRules.reduce((groups, rule) => {
      const treatment = rule.treatment_type?.trim() || "No treatment type";
      const key = `${treatment}::${rule.treatment_tier ?? "Practical"}`;
      const list = groups.get(key) ?? [];
      list.push(rule);
      groups.set(key, list);
      return groups;
    }, new Map<string, MaterialRuleEntry[]>())
  ).sort(([, aRules], [, bRules]) => {
    const aTreatment = aRules[0]?.treatment_type?.trim() || "No treatment type";
    const bTreatment = bRules[0]?.treatment_type?.trim() || "No treatment type";
    const treatmentSort = aTreatment.localeCompare(bTreatment);
    if (treatmentSort !== 0) return treatmentSort;
    return (aRules[0]?.treatment_tier ?? "Practical").localeCompare(bRules[0]?.treatment_tier ?? "Practical");
  });
  const [statusFilter, setStatusFilter] = useState<"active" | "disabled">("active");
  const [tierFilter, setTierFilter] = useState<MaterialTreatmentTier | null>(null);
  const visibleGroupedRules = groupedRules.filter(([, groupRules]) =>
    groupRules.some((rule) => rule.is_active) === (statusFilter === "active") &&
    (tierFilter === null || groupRules.some((rule) => (rule.treatment_tier ?? "Practical") === tierFilter))
  );
  const selectedGroupName =
    mode === "details" || mode === "browse" || mode === "configure"
      ? null
      : selectedGroup ?? (selected ? `${selected.treatment_type?.trim() || "No treatment type"}::${selected.treatment_tier ?? "Practical"}` : null) ?? visibleGroupedRules[0]?.[0] ?? null;
  const selectedGroupRules = groupedRules.find(([group]) => group === selectedGroupName)?.[1] ?? [];
  const treatmentNameForGroup = (groupRules: MaterialRuleEntry[]) => groupRules[0]?.treatment_type?.trim() || "No treatment type";
  const groupWarrantyLabel = (groupRules: MaterialRuleEntry[]) => {
    const years = Math.max(0, ...groupRules.map((rule) => rule.warranty_years ?? 0));
    return years > 0 ? `${years} year${years === 1 ? "" : "s"}` : "None";
  };
  const groupEffectiveDateLabel = (groupRules: MaterialRuleEntry[]) =>
    groupRules
      .map((rule) => rule.effective_date)
      .sort()
      .at(-1) ?? "Not set";
  const groupLifespanLabel = (groupRules: MaterialRuleEntry[]) => {
    const years = Math.max(0, ...groupRules.map((rule) => rule.lifespan_years ?? 0));
    return years > 0 ? `${years} year${years === 1 ? "" : "s"}` : "Not set";
  };
  const groupTierLabel = (groupRules: MaterialRuleEntry[]) => {
    const tiers = MATERIAL_TREATMENT_TIERS.filter((tier) => groupRules.some((rule) => (rule.treatment_tier ?? "Practical") === tier));
    return tiers.length > 0 ? tiers.join(", ") : "Practical";
  };
  const groupStatusLabel = (groupRules: MaterialRuleEntry[]) => groupRules.some((rule) => rule.is_active) ? "Active" : "Disabled";
  const selectedGroupRuleIds = new Set(selectedGroupRules.map((rule) => rule.rule_id));
  const groupEditDuplicateExists = allRules.some(
    (rule) =>
      rule.is_active &&
      !selectedGroupRuleIds.has(rule.rule_id) &&
      rule.treatment_type?.trim() === treatmentType.trim() &&
      (rule.treatment_tier ?? "Practical") === treatmentTier
  );
  const groupEditValid =
    !!selectedGroupName &&
    selectedGroupRules.length > 0 &&
    TREATMENT_OPTIONS.includes(treatmentType as (typeof TREATMENT_OPTIONS)[number]) &&
    !groupEditDuplicateExists &&
    warrantyYears !== "" &&
    Number(warrantyYears) > 0 &&
    lifespanYears !== "" &&
    Number(lifespanYears) > 0;

  const handleDisableGroup = async () => {
    if (!selectedGroupName || selectedGroupRules.length === 0 || isDisablingGroup) return;
    setIsDisablingGroup(true);
    setDisableError(null);
    try {
      await Promise.all(
        selectedGroupRules
          .filter((rule) => rule.is_active)
          .map((rule) =>
            apiClient(`/api/company-rules/material-rules/${rule.rule_id}`, {
              method: "DELETE",
              credentials: "include",
            })
          )
      );
      setSavedMessage(false);
      setSelectedGroup(null);
      setSelectedId(null);
      await refetch();
      window.dispatchEvent(new CustomEvent("buildsmart:company-rules-changed", { detail: { kind: "material-rules" } }));
    } catch (error) {
      setDisableError(error instanceof Error ? error : new Error("Could not disable this treatment group."));
    } finally {
      setIsDisablingGroup(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">Material Rules</h2>
        <p className="text-xs text-gray-500">
          Link materials from your catalog to each treatment type.
        </p>
      </div>

      <RuleListDetailPanel
        title="Treatment Groups"
        items={visibleGroupedRules}
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        getId={([group]) => group}
        selectedId={selectedGroupName}
        onSelect={(id) => {
          setSelectedGroup(id);
          setSelectedId(null);
          setMode("idle");
        }}
        onAdd={startAdd}
        emptyHint="Add materials from your catalog and tag them with a treatment type."
        countLabel={`${allRules.length} configured`}
        listHeader={
          <div className="grid grid-cols-2 gap-2">
            <div className="grid grid-cols-2 gap-2">
              {(["active", "disabled"] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => {
                    setStatusFilter(filter);
                    setMode("idle");
                    setSelectedId(null);
                    setSelectedGroup(null);
                  }}
                  className={`min-h-9 rounded-lg border px-3 py-2 text-center text-xs font-semibold capitalize transition ${
                    statusFilter === filter
                      ? "border-primary bg-orange-50 text-primary"
                      : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 border-l border-gray-200 pl-2">
              {MATERIAL_TREATMENT_TIERS.map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => {
                    setTierFilter((current) => (current === tier ? null : tier));
                    setMode("idle");
                    setSelectedId(null);
                    setSelectedGroup(null);
                  }}
                  className={`min-h-9 rounded-lg border px-3 py-2 text-center text-xs font-semibold transition ${
                    tierFilter === tier
                      ? activeTierFilterClass(tier)
                      : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                  }`}
                >
                  {tier}
                </button>
              ))}
            </div>
          </div>
        }
        renderListItem={([, groupRules]) => (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold text-gray-800">{treatmentNameForGroup(groupRules)}</span>
              <div className="flex shrink-0 items-center gap-1.5">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    groupRules.some((rule) => rule.is_active) ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {groupStatusLabel(groupRules)}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tierBadgeClass((groupRules[0]?.treatment_tier ?? "Practical") as MaterialTreatmentTier)}`}>
                  {groupTierLabel(groupRules)}
                </span>
              </div>
            </div>
            <div className="grid gap-0.5 text-xs text-gray-400">
              <span>Warranty: {groupWarrantyLabel(groupRules)}</span>
              <span>Lifespan: {groupLifespanLabel(groupRules)}</span>
            </div>
          </div>
        )}
        detail={
          mode === "details" ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-gray-900">Add Treatment</p>
                <button type="button" onClick={() => setMode("idle")} className="text-gray-300 hover:text-gray-500">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-600">
                  Treatment Level <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {MATERIAL_TREATMENT_TIERS.map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      disabled={!availableTiersForSelectedTreatment.includes(tier)}
                      onClick={() => setTreatmentTier(tier)}
                      className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${
                        treatmentTier === tier
                          ? activeTierFilterClass(tier)
                          : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                      } disabled:cursor-not-allowed disabled:border-gray-100 disabled:bg-gray-50 disabled:text-gray-300`}
                    >
                      {tier}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="relative">
                  <select
                    id="material-treatment-type"
                    value={treatmentType}
                    onChange={(e) => {
                      const nextTreatment = e.target.value;
                      setTreatmentType(nextTreatment);
                      const nextAvailableTiers = MATERIAL_TREATMENT_TIERS.filter(
                        (tier) => !activeTiersForTreatment(nextTreatment).has(tier)
                      );
                      setTreatmentTier(nextAvailableTiers[0] ?? "Practical");
                    }}
                    className="peer w-full rounded-lg border border-gray-200 bg-gray-50 px-3 pb-2 pt-5 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">Select...</option>
                    {availableTreatmentOptions.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                  <label
                    htmlFor="material-treatment-type"
                    className="pointer-events-none absolute left-3 top-1.5 text-[10px] font-semibold text-gray-500 transition-all peer-focus:text-primary"
                  >
                    Treatment Type <span className="text-red-500">*</span>
                  </label>
                </div>
                {touched && !TREATMENT_OPTIONS.includes(treatmentType as (typeof TREATMENT_OPTIONS)[number]) && (
                  <p className="text-xs text-red-500">Choose one of BuildSmart&apos;s treatment types.</p>
                )}
                {activeTreatmentTierExists && (
                  <p className="text-xs text-red-500">
                    This treatment already has an active {treatmentTier} rule. Update or disable the existing one first.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <div className="relative">
                    <input
                      id="material-warranty-years"
                      type="text"
                      inputMode="decimal"
                      value={warrantyYears}
                      onChange={(e) => {
                        const next = e.target.value.replace(/[^\d.]/g, "");
                        setWarrantyYears(next === "" ? "" : Number(next));
                      }}
                      placeholder=" "
                      className="peer w-full rounded-lg border border-gray-200 bg-gray-50 px-3 pb-2 pt-5 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
                    />
                    <label
                      htmlFor="material-warranty-years"
                      className="pointer-events-none absolute left-3 top-1.5 text-[10px] font-semibold text-gray-500 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:font-medium peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-[10px] peer-focus:font-semibold peer-focus:text-primary"
                    >
                      Warranty Years <span className="text-red-500">*</span>
                    </label>
                  </div>
                  {touched && (warrantyYears === "" || Number(warrantyYears) <= 0) && <p className="text-xs text-red-500">Warranty years is required.</p>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="relative">
                    <input
                      id="material-lifespan-years"
                      type="text"
                      inputMode="decimal"
                      value={lifespanYears}
                      onChange={(e) => {
                        const next = e.target.value.replace(/[^\d.]/g, "");
                        setLifespanYears(next === "" ? "" : Number(next));
                      }}
                      placeholder=" "
                      className="peer w-full rounded-lg border border-gray-200 bg-gray-50 px-3 pb-2 pt-5 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
                    />
                    <label
                      htmlFor="material-lifespan-years"
                      className="pointer-events-none absolute left-3 top-1.5 text-[10px] font-semibold text-gray-500 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:font-medium peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-[10px] peer-focus:font-semibold peer-focus:text-primary"
                    >
                      Expected Lifespan Years <span className="text-red-500">*</span>
                    </label>
                  </div>
                  {touched && (lifespanYears === "" || Number(lifespanYears) <= 0) && <p className="text-xs text-red-500">Expected lifespan years is required.</p>}
                </div>
              </div>

              <div className="mt-auto flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setTouched(true);
                    if (treatmentDetailsValid) {
                      setTouched(false);
                      setMode("browse");
                    }
                  }}
                  disabled={activeTreatmentTierExists}
                  className="w-fit rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60"
                >
                  Continue to Materials
                </button>
              </div>
            </div>
          ) : mode === "browse" ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-gray-900">Select Materials</p>
                  <p className="text-xs text-gray-400">{treatmentType} · {treatmentTier}</p>
                </div>
                <button type="button" onClick={() => setMode("idle")} className="text-gray-300 hover:text-gray-500">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,12rem)_minmax(0,12rem)]">
                <div className="relative min-w-0">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search the catalog…"
                    className={`${inputCls} pl-9`}
                  />
                </div>
                <select
                  value={supplierFilter}
                  onChange={(e) => {
                    setSupplierFilter(e.target.value);
                    setCheckedCatalogKeys(new Set());
                  }}
                  className={`${inputCls} min-w-0`}
                  disabled={suppliersLoading}
                  aria-label="Supplier source"
                >
                  <option value={DPWH_SUPPLIER_VALUE}>DPWH</option>
                  {suppliers
                    .filter((s) => s.status === "Active")
                    .map((supplier) => (
                      <option key={supplier.supplier_id} value={String(supplier.supplier_id)}>
                        {supplier.supplier_name}
                      </option>
                    ))}
                </select>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as CategoryType | "")}
                  className={`${inputCls} min-w-0`}
                >
                  <option value="">All categories</option>
                  {CATEGORY_TYPES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>

              {(supplierFilter === DPWH_SUPPLIER_VALUE ? dpwhCatalogLoading : supplierCatalogLoading) || itemsLoading ? (
                <p className="text-xs text-gray-400">Loading catalog…</p>
              ) : itemsError || dpwhCatalogError || supplierCatalogError ? (
                <p className="text-xs text-red-500">Couldn&apos;t load your catalog: {(itemsError ?? dpwhCatalogError ?? supplierCatalogError)?.message}</p>
              ) : catalogItems.length === 0 ? (
                <p className="text-xs text-amber-600">No items in your catalog. Upload a pricelist first.</p>
              ) : filteredItems.length === 0 ? (
                <p className="text-xs text-gray-400">No catalog items match that search.</p>
              ) : (
                <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-200">
                  {filteredItems.map((item) => {
                    return (
                      <label
                        key={item.catalogKey}
                        className="flex cursor-pointer items-center gap-3 border-b border-gray-50 px-3 py-2 last:border-b-0 hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          checked={checkedCatalogKeys.has(item.catalogKey)}
                          onChange={() => toggleChecked(item.catalogKey)}
                          className="h-4 w-4 shrink-0 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/30"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-800">{item.item_name}</p>
                          <p className="truncate text-[11px] text-gray-400">{itemMeta(item)}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              <div className="mt-auto flex justify-end pt-2">
                <button
                  type="button"
                  disabled={checkedItems.length === 0 || categoriesLoading || !!categoriesError}
                  onClick={goToConfigure}
                  className="w-fit rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60"
                >
                  {categoriesLoading
                    ? "Loading categories..."
                    : `Continue with ${checkedItems.length} selected`}
                </button>
              </div>
              {categoriesError && (
                <p className="text-xs text-red-500">Couldn&apos;t load material categories: {categoriesError.message}</p>
              )}
            </div>
          ) : mode === "configure" ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-gray-900">Review Materials</p>
                  <p className="text-xs text-gray-400">{treatmentType} · {treatmentTier}</p>
                </div>
                <button type="button" onClick={() => setMode("idle")} className="text-gray-300 hover:text-gray-500">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Selected Materials</p>
                <div className="mt-2 divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-100 bg-white">
                  {checkedItems.map((item) => (
                    <div key={item.item_code} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-800">{item.item_name}</p>
                        <p className="truncate text-[11px] text-gray-400">{itemMeta(item)}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-gray-50 px-2 py-0.5 text-[10px] font-bold text-gray-500">
                        {categoryTypeOf(item) ?? "Uncategorized"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {createError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Couldn&apos;t save: {createError.message}
                </div>
              )}

              <div className="mt-auto flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setMode("browse")}
                  className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 transition hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleSaveAll}
                  disabled={isCreating}
                  className="flex flex-2 items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60"
                >
                  {isCreating ? "Saving…" : `Save ${checkedItems.length} Material Rule${checkedItems.length === 1 ? "" : "s"}`}
                </button>
              </div>
            </div>
          ) : mode === "edit-group" && selectedGroupName ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-gray-900">Edit Treatment Group</p>
                <button type="button" onClick={() => setMode("idle")} className="text-gray-300 hover:text-gray-500">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Treatment Group</p>
                <p className="text-sm font-semibold text-gray-800">{treatmentNameForGroup(selectedGroupRules)}</p>
                <p className="text-xs text-gray-400">
                  {groupTierLabel(selectedGroupRules)}
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="edit-material-treatment-type" className="text-xs font-semibold text-gray-600">
                  Treatment Type <span className="text-red-500">*</span>
                </label>
                <select
                  id="edit-material-treatment-type"
                  value={treatmentType}
                  onChange={(e) => setTreatmentType(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Select treatment type...</option>
                  {TREATMENT_OPTIONS.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                {touched && !TREATMENT_OPTIONS.includes(treatmentType as (typeof TREATMENT_OPTIONS)[number]) && (
                  <p className="text-xs text-red-500">Choose one of BuildSmart&apos;s treatment types.</p>
                )}
                {groupEditDuplicateExists && (
                  <p className="text-xs text-red-500">
                    This treatment already has an active {treatmentTier} rule. Update or disable that existing one first.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-600">
                  Treatment Level <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {MATERIAL_TREATMENT_TIERS.map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => setTreatmentTier(tier)}
                      className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${
                        treatmentTier === tier
                          ? "border-primary bg-orange-50 text-primary"
                          : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      {tier}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <div className="relative">
                    <input
                      id="edit-material-warranty-years"
                      type="text"
                      inputMode="decimal"
                      value={warrantyYears}
                      onChange={(e) => {
                        const next = e.target.value.replace(/[^\d.]/g, "");
                        setWarrantyYears(next === "" ? "" : Number(next));
                      }}
                      placeholder=" "
                      className="peer w-full rounded-lg border border-gray-200 bg-gray-50 px-3 pb-2 pt-5 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
                    />
                    <label
                      htmlFor="edit-material-warranty-years"
                      className="pointer-events-none absolute left-3 top-1.5 text-[10px] font-semibold text-gray-500 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:font-medium peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-[10px] peer-focus:font-semibold peer-focus:text-primary"
                    >
                      Warranty Years <span className="text-red-500">*</span>
                    </label>
                  </div>
                  {touched && (warrantyYears === "" || Number(warrantyYears) <= 0) && <p className="text-xs text-red-500">Warranty years is required.</p>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="relative">
                    <input
                      id="edit-material-lifespan-years"
                      type="text"
                      inputMode="decimal"
                      value={lifespanYears}
                      onChange={(e) => {
                        const next = e.target.value.replace(/[^\d.]/g, "");
                        setLifespanYears(next === "" ? "" : Number(next));
                      }}
                      placeholder=" "
                      className="peer w-full rounded-lg border border-gray-200 bg-gray-50 px-3 pb-2 pt-5 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
                    />
                    <label
                      htmlFor="edit-material-lifespan-years"
                      className="pointer-events-none absolute left-3 top-1.5 text-[10px] font-semibold text-gray-500 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:font-medium peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-[10px] peer-focus:font-semibold peer-focus:text-primary"
                    >
                      Expected Lifespan Years <span className="text-red-500">*</span>
                    </label>
                  </div>
                  {touched && (lifespanYears === "" || Number(lifespanYears) <= 0) && <p className="text-xs text-red-500">Expected lifespan years is required.</p>}
                </div>
              </div>

              {editable.saveError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Couldn&apos;t save: {editable.saveError.message}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleSaveGroupEdit}
                  disabled={editable.isSaving || groupEditDuplicateExists}
                  className="w-fit rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60"
                >
                  {editable.isSaving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </div>
          ) : selectedGroupName ? (
            <div className="flex flex-col gap-4">
              {savedMessage && (
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  {editable.supersededNotice
                    ? "A new version of this rule was created. The previous version is preserved for existing quotations."
                    : "Company preferences updated successfully."}
                </div>
              )}
              <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-bold text-gray-900">{treatmentNameForGroup(selectedGroupRules)}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          selectedGroupRules.some((rule) => rule.is_active) ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-400"
                        }`}
                      >
                        {groupStatusLabel(selectedGroupRules)}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tierBadgeClass((selectedGroupRules[0]?.treatment_tier ?? "Practical") as MaterialTreatmentTier)}`}>
                        {groupTierLabel(selectedGroupRules)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">
                      {selectedGroupRules.length} material{selectedGroupRules.length === 1 ? "" : "s"}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      Warranty: {groupWarrantyLabel(selectedGroupRules)}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      Lifespan: {groupLifespanLabel(selectedGroupRules)}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      Effective Date: {groupEffectiveDateLabel(selectedGroupRules)}
                    </p>
                </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => startEditGroup(selectedGroupName)}
                      title="Edit"
                      aria-label="Edit treatment group"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:border-primary hover:text-primary"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={isDisablingGroup}
                      onClick={handleDisableGroup}
                      title="Disable"
                      aria-label="Disable treatment group"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:border-red-300 hover:text-red-600 disabled:opacity-50"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {disableError && (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    Couldn&apos;t disable: {disableError.message}
                  </div>
                )}
                <div
                  className={`mt-4 divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-100 bg-white ${
                    selectedGroupRules.length >= 5 ? "h-[15rem] overflow-y-auto" : "min-h-[15rem]"
                  }`}
                >
                  {selectedGroupRules
                    .slice()
                    .sort((a, b) => a.preferred_item_name.localeCompare(b.preferred_item_name))
                    .map((rule) => (
                      <div key={rule.rule_id} className="flex items-center justify-between gap-4 px-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-800">{rule.preferred_item_name}</p>
                          <p className="truncate text-xs text-gray-400">{rule.category}</p>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-gray-400">
              <p className="text-sm">Select a material rule to view it, or add materials from your catalog.</p>
            </div>
          )
        }
      />
    </div>
  );
}
