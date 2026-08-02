"use client";

import { useEffect, useState } from "react";
import {
  ClipboardList,
  ListChecks,
  Percent,
  Ruler,
  Truck,
  Users,
  Wrench,
} from "lucide-react";
import { ScopeTemplatesForm } from "./ScopeTemplatesForm";
import { MaterialRulesForm } from "./MaterialRulesForm";
import { SupplierRulesPlaceholder } from "./SupplierRulesPlaceholder";
import { LaborRulesForm } from "./LaborRulesForm";
import { PricingStrategyForm } from "./PricingStrategyForm";
import { UnitRulesForm } from "./UnitRulesForm";
import { ManageExistingRulesTab } from "./ManageExistingRulesTab";
import { RULE_KIND_TAB, type ExistingRuleSummary } from "@/lib/dev/provisional/companyRulesTypes";
import {
  useScopeTemplates,
  useMaterialRules,
  useLaborRules,
  usePricingStrategies,
  useUnitRules,
} from "@/lib/dev/provisional/useCompanyRulesProvisional";
import { useAuth } from "@/providers/AuthProvider";
import { advanceOnboardingStep, hasCompletedCompanyRulesStep } from "@/lib/onboarding";

const TABS = [
  { id: "scope-templates", label: "Scope Templates", icon: ClipboardList },
  { id: "material-rules", label: "Material Rules", icon: ListChecks },
  { id: "supplier-rules", label: "Supplier Rules", icon: Truck },
  { id: "labor-rules", label: "Labor Rules", icon: Users },
  { id: "pricing-strategy", label: "Pricing Strategy", icon: Percent },
  { id: "unit-rules", label: "Unit Rules", icon: Ruler },
  { id: "manage-existing", label: "Manage Existing Rules", icon: Wrench },
] as const;

type TabId = (typeof TABS)[number]["id"];

const RULE_KIND_TO_TAB: Record<string, TabId> = {
  "scope-templates": "scope-templates",
  "material-rules": "material-rules",
  "labor-rules": "labor-rules",
  "pricing-strategy": "pricing-strategy",
  "unit-rules": "unit-rules",
};

export default function CompanyRulesShell() {
  const [activeTab, setActiveTab] = useState<TabId>("scope-templates");
  const [completedTabs, setCompletedTabs] = useState<Set<TabId>>(new Set());
  // "Manage Existing Rules" rows jump to the rule's owning tab with that rule
  // pre-selected, instead of dumping the user on the tab with no idea what to look for.
  const [focusRuleId, setFocusRuleId] = useState<string | null>(null);

  const openExistingRule = (rule: ExistingRuleSummary) => {
    setActiveTab(RULE_KIND_TAB[rule.rule_kind] as TabId);
    setFocusRuleId(rule.rule_id);
  };

  // "needs configuration" dots, driven by the same real fetched lists each form already
  // uses (not a hardcoded list of "which tabs matter"). Supplier Rules is excluded (still
  // a deferred placeholder — there's no save flow yet, so a dot there could never clear)
  // and so is Manage Existing Rules (a management/utility tab, not a "configure this" one).
  const { currentUser, updateOnboardingStep } = useAuth();
  const scopeTemplates = useScopeTemplates();
  const material = useMaterialRules();
  const labor = useLaborRules();
  const pricing = usePricingStrategies();
  const units = useUnitRules();
  const templates = scopeTemplates.templates;
  const materialRules = material.rules;
  const laborRules = labor.rules;
  const strategies = pricing.strategies;
  const unitRules = units.rules;
  const refetchScopeTemplates = scopeTemplates.refetch;
  const refetchMaterialRules = material.refetch;
  const refetchLaborRules = labor.refetch;
  const refetchPricingStrategies = pricing.refetch;
  const refetchUnitRules = units.refetch;

  const needsAttention: Partial<Record<TabId, boolean>> = {
    "scope-templates": templates.length === 0 && !completedTabs.has("scope-templates"),
    "material-rules": materialRules.length === 0 && !completedTabs.has("material-rules"),
    "labor-rules": laborRules.length === 0 && !completedTabs.has("labor-rules"),
    "pricing-strategy": strategies.length === 0 && !completedTabs.has("pricing-strategy"),
    "unit-rules": unitRules.length === 0 && !completedTabs.has("unit-rules"),
  };

  // Step 1 -> 2 onboarding gate. This intentionally matches the tabs that show orange
  // setup dots: once all dotted tabs have at least one saved rule/configuration, the
  // sidebar unlocks Quotation Generation, Open Projects, Price Trends, and Benchmark Suppliers.
  const rulesConfigured = hasCompletedCompanyRulesStep({
    scopeTemplateCount: templates.length,
    materialRuleCount: materialRules.length,
    laborRuleCount: laborRules.length,
    pricingStrategyCount: strategies.length,
    unitRuleCount: unitRules.length,
  }) || (
    completedTabs.has("scope-templates") &&
    completedTabs.has("material-rules") &&
    completedTabs.has("labor-rules") &&
    completedTabs.has("pricing-strategy") &&
    completedTabs.has("unit-rules")
  );

  useEffect(() => {
    const handleRulesChanged = (event: Event) => {
      const kind = event instanceof CustomEvent ? event.detail?.kind : null;
      const tab = typeof kind === "string" ? RULE_KIND_TO_TAB[kind] : null;
      if (tab) {
        setCompletedTabs((current) => new Set(current).add(tab));
      }
      refetchScopeTemplates();
      refetchMaterialRules();
      refetchLaborRules();
      refetchPricingStrategies();
      refetchUnitRules();
    };

    window.addEventListener("buildsmart:company-rules-changed", handleRulesChanged);
    return () => window.removeEventListener("buildsmart:company-rules-changed", handleRulesChanged);
  }, [refetchScopeTemplates, refetchMaterialRules, refetchLaborRules, refetchPricingStrategies, refetchUnitRules]);

  useEffect(() => {
    if (!currentUser) return;

    if (rulesConfigured) {
      advanceOnboardingStep(currentUser.onboardingStep, 2, updateOnboardingStep);
    } else if (currentUser.onboardingStep > 1) {
      updateOnboardingStep(1);
    }
    // updateOnboardingStep is recreated every AuthProvider render; advanceOnboardingStep
    // no-ops once past the target step, so omitting it here can't miss or double-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, rulesConfigured]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-gray-200">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-semibold transition-colors ${
                active ? "text-primary" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              {needsAttention[tab.id] && (
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-label="Needs configuration" />
              )}
              {active && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />}
            </button>
          );
        })}
      </div>

      {activeTab === "scope-templates" && (
        <ScopeTemplatesForm focusRuleId={focusRuleId} onFocusHandled={() => setFocusRuleId(null)} />
      )}
      {activeTab === "material-rules" && (
        <MaterialRulesForm focusRuleId={focusRuleId} onFocusHandled={() => setFocusRuleId(null)} />
      )}
      {activeTab === "supplier-rules" && <SupplierRulesPlaceholder />}
      {activeTab === "labor-rules" && (
        <LaborRulesForm focusRuleId={focusRuleId} onFocusHandled={() => setFocusRuleId(null)} />
      )}
      {activeTab === "pricing-strategy" && (
        <PricingStrategyForm focusRuleId={focusRuleId} onFocusHandled={() => setFocusRuleId(null)} />
      )}
      {activeTab === "unit-rules" && (
        <UnitRulesForm focusRuleId={focusRuleId} onFocusHandled={() => setFocusRuleId(null)} />
      )}
      {activeTab === "manage-existing" && <ManageExistingRulesTab onOpenRule={openExistingRule} />}
    </div>
  );
}
