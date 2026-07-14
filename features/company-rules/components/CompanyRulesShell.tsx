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
import type { CategoryType } from "@/types/entities/category";

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

export interface ScopeWizardState {
  step: 2 | 3;
  scopeRuleId: string;
  templateName: string;
  categories: CategoryType[];
}

export default function CompanyRulesShell() {
  const [activeTab, setActiveTab] = useState<TabId>("scope-templates");
  const [focusRuleId, setFocusRuleId] = useState<string | null>(null);
  const [wizard, setWizard] = useState<ScopeWizardState | null>(null);

  const openExistingRule = (rule: ExistingRuleSummary) => {
    setActiveTab(RULE_KIND_TAB[rule.rule_kind] as TabId);
    setFocusRuleId(rule.rule_id);
  };

  const startWizardAfterScopeSave = (scopeRuleId: string, templateName: string, categories: CategoryType[]) => {
    setWizard({ step: 2, scopeRuleId, templateName, categories });
    setActiveTab("material-rules");
  };

  const advanceWizardToUnitRules = () => {
    setWizard((w) => (w ? { ...w, step: 3 } : null));
    setActiveTab("unit-rules");
  };

  const finishWizard = () => setWizard(null);
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
        <ScopeTemplatesForm
          focusRuleId={focusRuleId}
          onFocusHandled={() => setFocusRuleId(null)}
          onCreated={startWizardAfterScopeSave}
        />
      )}
      {activeTab === "material-rules" && (
        <MaterialRulesForm
          wizard={wizard && wizard.step === 2 ? wizard : null}
          onWizardAdvance={advanceWizardToUnitRules}
        />
      )}
      {activeTab === "supplier-rules" && <SupplierRulesPlaceholder />}
      {activeTab === "labor-rules" && (
        <LaborRulesForm focusRuleId={focusRuleId} onFocusHandled={() => setFocusRuleId(null)} />
      )}
      {activeTab === "pricing-strategy" && (
        <PricingStrategyForm focusRuleId={focusRuleId} onFocusHandled={() => setFocusRuleId(null)} />
      )}
      {activeTab === "unit-rules" && (
        <UnitRulesForm
          focusRuleId={focusRuleId}
          onFocusHandled={() => setFocusRuleId(null)}
          wizard={wizard && wizard.step === 3 ? wizard : null}
          onWizardFinish={finishWizard}
        />
      )}
      {activeTab === "manage-existing" && <ManageExistingRulesTab onOpenRule={openExistingRule} />}
    </div>
  );
}