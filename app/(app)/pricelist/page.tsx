"use client";

import { useEffect, useState } from "react";
import { Database, LibraryBig, Upload } from "lucide-react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { AiNormalizationPanel, PriceCatalogTab, PublishedSourceTab } from "@/features/pricelist/components";
import { usePricelistCatalog } from "@/hooks/usePricelistCatalog";
import { usePricelistPublishedSource } from "@/hooks/usePricelistPublishedSource";
import { useAuth } from "@/providers/AuthProvider";
import { advanceOnboardingStep, hasCompletedPricelistStep } from "@/lib/onboarding";

// 
const TABS = [
  { id: "upload", label: "Upload Pricelist", icon: Upload },
  { id: "published", label: "Published Sources", icon: Database },
  { id: "catalog", label: "Price Catalog", icon: LibraryBig },
] as const;

type TabId = (typeof TABS)[number]["id"];

function asCompanyId(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

export default function PricelistPage() {
  const [activeTab, setActiveTab] = useState<TabId>("upload");
  const [uploadCompleted, setUploadCompleted] = useState(false);
  const goToCatalog = () => setActiveTab("catalog");

  const { currentUser, updateOnboardingStep } = useAuth();
  const companyId = asCompanyId(currentUser?.companyId);
  const supplierCatalog = usePricelistCatalog();
  const { dpwhCatalog } = usePricelistPublishedSource();


  useEffect(() => {
    supplierCatalog.load();
    dpwhCatalog.load();
    // .load() setters are recreated every render (not stable) — this must run once on
    // mount only, not on every render they'd otherwise trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  //
  const pricelistDone = hasCompletedPricelistStep({
    uploadCatalogCount: supplierCatalog.records.length,
    dpwhCatalogCount: dpwhCatalog.records.length,
  }) || uploadCompleted;

  useEffect(() => {
    if (currentUser && pricelistDone) {
      advanceOnboardingStep(currentUser.onboardingStep, 1, updateOnboardingStep);
    }
    // updateOnboardingStep is recreated every AuthProvider render; advanceOnboardingStep
    // no-ops once past the target step, so omitting it here can't miss or double-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, pricelistDone]);

  const needsAttention: Partial<Record<TabId, boolean>> = {
    upload: !pricelistDone,
  };

  return (
    <RequireAuth>
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

        {activeTab === "upload" && (
          <AiNormalizationPanel
            companyId={companyId}
            defaultSupplierMode={currentUser?.onboardingStep === 0 ? "new" : "existing"}
            onCatalogChanged={() => {
              setUploadCompleted(true);
              supplierCatalog.refetch();
              goToCatalog();
            }}
          />
        )}
        {activeTab === "published" && <PublishedSourceTab onViewCatalog={goToCatalog} />}
        {activeTab === "catalog" && <PriceCatalogTab />}
      </div>
    </RequireAuth>
  );
}
