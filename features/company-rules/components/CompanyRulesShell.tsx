"use client";

import { useEffect, useState } from "react";
import {
  ListFilter,
  Package,
  Percent,
  Ruler,
  Truck,
  Users,
} from "lucide-react";
import { MaterialRulesForm } from "./MaterialRulesForm";
import { SupplierRulesForm } from "./SupplierRulesForm";
import { LaborRulesForm } from "./LaborRulesForm";
import { PricingStrategyForm } from "./PricingStrategyForm";
import { UnitRulesForm } from "./UnitRulesForm";
import { ManageExistingRulesTab } from "./ManageExistingRulesTab";
import { RULE_KIND_TAB, type ExistingRuleSummary } from "@/lib/dev/provisional/companyRulesTypes";
import {
  useMaterialRules,
  useLaborRules,
  usePricingStrategies,
  useSupplierRules,
  useUnitRules,
} from "@/lib/dev/provisional/useCompanyRulesProvisional";
import { useAuth } from "@/providers/AuthProvider";
import { advanceOnboardingStep, hasCompletedCompanyRulesStep } from "@/lib/onboarding";

// 
const TABS = [
  { id: "material-rules", label: "Material Rules", icon: Package },
  { id: "supplier-rules", label: "Supplier Rules", icon: Truck },
  { id: "labor-rules", label: "Labor Rules", icon: Users },
  { id: "unit-rules", label: "Unit Rules", icon: Ruler },
  { id: "pricing-strategy", label: "Pricing Strategy", icon: Percent },
  { id: "manage-existing", label: "Manage Existing Rules", icon: ListFilter },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function CompanyRulesShell() {
  const [activeTab, setActiveTab] = useState<TabId>("material-rules");
  // "Manage Existing Rules" rows jump to the rule's owning tab with that rule
  // pre-selected, instead of dumping the user on the tab with no idea what to look for.
  const [focusRuleId, setFocusRuleId] = useState<string | null>(null);

  const openExistingRule = (rule: ExistingRuleSummary) => {
    setActiveTab(RULE_KIND_TAB[rule.rule_kind] as TabId);
    setFocusRuleId(rule.rule_id);
  };

  // 
  const { currentUser, updateOnboardingStep } = useAuth();
  const { rules: materialRules, refetch: refetchMaterialRules } = useMaterialRules();
  const { rules: laborRules, refetch: refetchLaborRules } = useLaborRules();
  const { strategies, refetch: refetchPricingStrategies } = usePricingStrategies();
  const { rules: unitRules, refetch: refetchUnitRules } = useUnitRules();
  const { rules: supplierRules, refetch: refetchSupplierRules } = useSupplierRules();
  const needsAttention: Partial<Record<TabId, boolean>> = {
    "material-rules": materialRules.length === 0,
    "supplier-rules": supplierRules.length === 0,
    "labor-rules": laborRules.length === 0,
    "pricing-strategy": strategies.length === 0,
    "unit-rules": unitRules.length === 0,
  };

  // Step 1 -> 2 onboarding gate: Material Rules are required because they define the
  // treatment-to-material mapping used by quotation and labor rules.
  const rulesConfigured = hasCompletedCompanyRulesStep({
    materialRuleCount: materialRules.length,
    laborRuleCount: laborRules.length,
    pricingStrategyCount: strategies.length,
    unitRuleCount: unitRules.length,
  });

  useEffect(() => {
    if (currentUser && rulesConfigured) {
      advanceOnboardingStep(currentUser.onboardingStep, 2, updateOnboardingStep);
    }
    // updateOnboardingStep is recreated every AuthProvider render; advanceOnboardingStep
    // no-ops once past the target step, so omitting it here can't miss or double-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, rulesConfigured]);

  useEffect(() => {
    const refetchByKind: Record<string, () => void> = {
      "material-rules": refetchMaterialRules,
      "supplier-rules": refetchSupplierRules,
      "labor-rules": refetchLaborRules,
      "pricing-strategy": refetchPricingStrategies,
      "unit-rules": refetchUnitRules,
    };

    const handleRulesChanged = (event: Event) => {
      const kind = event instanceof CustomEvent && typeof event.detail?.kind === "string" ? event.detail.kind : "";
      refetchByKind[kind]?.();
    };

    window.addEventListener("buildsmart:company-rules-changed", handleRulesChanged);
    return () => window.removeEventListener("buildsmart:company-rules-changed", handleRulesChanged);
  }, [
    refetchMaterialRules,
    refetchSupplierRules,
    refetchLaborRules,
    refetchPricingStrategies,
    refetchUnitRules,
  ]);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <nav
        aria-label="Preferences and rules sections"
        className="flex min-w-0 shrink-0 gap-0.5 overflow-x-auto border-b border-gray-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-current={active ? "page" : undefined}
              className={`relative flex shrink-0 items-center justify-center gap-2 whitespace-nowrap px-3 py-3 text-left text-sm font-semibold transition-colors ${
                active ? "text-primary" : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{tab.label}</span>
              {needsAttention[tab.id] && (
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-label="Needs configuration" />
              )}
              {active && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary" />}
            </button>
          );
        })}
      </nav>

      <div className="min-w-0">
        {activeTab === "material-rules" && (
          <MaterialRulesForm focusRuleId={focusRuleId} onFocusHandled={() => setFocusRuleId(null)} />
        )}
        {activeTab === "supplier-rules" && (
          <SupplierRulesForm focusRuleId={focusRuleId} onFocusHandled={() => setFocusRuleId(null)} />
        )}
        {activeTab === "labor-rules" && (
          <LaborRulesForm focusRuleId={focusRuleId} onFocusHandled={() => setFocusRuleId(null)} />
        )}
        {activeTab === "pricing-strategy" && (
          <PricingStrategyForm focusRuleId={focusRuleId} onFocusHandled={() => setFocusRuleId(null)} />
        )}
        {activeTab === "unit-rules" && (
          <UnitRulesForm focusRuleId={focusRuleId} onFocusHandled={() => setFocusRuleId(null)} />
        )}
        {activeTab === "manage-existing" && <ManageExistingRulesTab onViewRule={openExistingRule} />}
      </div>
    </div>
  );
}
