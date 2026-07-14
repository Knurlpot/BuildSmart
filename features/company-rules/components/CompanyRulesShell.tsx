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

// Mirrors the CPRM activity diagram's "Rule Action?" fork: six Configure-X branches plus
// the separate Manage Existing Rules branch. Supplier Rules is schema-backed
// (supplier_discount_rule) but deliberately deferred this pass — see
// SupplierRulesPlaceholder.tsx. The other five have no confirmed schema yet; their forms
// are presentation-only against PROVISIONAL local shapes (lib/dev/provisional/).
//
// v6 Correction 2: there is no guided wizard here anymore. Scope Templates is an
// optional, advisory feature (client: "no packages as no two areas are the same") — saving
// one does not drive, gate, or pre-populate Material/Unit Rules. Each tab is fully
// independent; the only cross-tab behavior left is Manage Existing Rules jumping to a
// rule's owning tab, which is a navigation convenience, not a forced flow.
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

export default function CompanyRulesShell() {
  const [activeTab, setActiveTab] = useState<TabId>("scope-templates");
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
  const { templates } = useScopeTemplates();
  const { rules: materialRules } = useMaterialRules();
  const { rules: laborRules } = useLaborRules();
  const { strategies } = usePricingStrategies();
  const { rules: unitRules } = useUnitRules();

  const needsAttention: Partial<Record<TabId, boolean>> = {
    "scope-templates": templates.length === 0,
    "material-rules": materialRules.length === 0,
    "labor-rules": laborRules.length === 0,
    "pricing-strategy": strategies.length === 0,
    "unit-rules": unitRules.length === 0,
  };

  // Step 1 -> 2 onboarding gate (see lib/onboarding.ts's hasCompletedCompanyRulesStep for
  // the flagged decision this reads). Correction 2: deliberately does NOT factor in
  // scopeTemplateCount — a specialty contractor may never create one, and Scope Templates
  // must not gate anything.
  const rulesConfigured = hasCompletedCompanyRulesStep({
    scopeTemplateCount: templates.length,
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
