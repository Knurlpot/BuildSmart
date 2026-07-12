"use client";

import { useState } from "react";
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

// Mirrors the CPRM activity diagram's "Rule Action?" fork: six Configure-X branches plus
// the separate Manage Existing Rules branch. Supplier Rules is schema-backed
// (supplier_discount_rule) but deliberately deferred this pass — see
// SupplierRulesPlaceholder.tsx. The other five have no confirmed schema yet; their forms
// are presentation-only against PROVISIONAL local shapes (lib/dev/provisional/).
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
              {active && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />}
            </button>
          );
        })}
      </div>

      {activeTab === "scope-templates" && <ScopeTemplatesForm />}
      {activeTab === "material-rules" && <MaterialRulesForm />}
      {activeTab === "supplier-rules" && <SupplierRulesPlaceholder />}
      {activeTab === "labor-rules" && <LaborRulesForm />}
      {activeTab === "pricing-strategy" && <PricingStrategyForm />}
      {activeTab === "unit-rules" && <UnitRulesForm />}
      {activeTab === "manage-existing" && <ManageExistingRulesTab />}
    </div>
  );
}
