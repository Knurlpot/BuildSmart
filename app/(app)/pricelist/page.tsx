"use client";

import { useEffect, useState } from "react";
import { Database, ListOrdered, LibraryBig, TrendingUp, Upload } from "lucide-react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { PriceTrendsPanel } from "@/components/market-intelligence/PriceTrendsPanel";
import { PriceCatalogTab, PublishedSourceTab, SourcePriorityTab, UploadPricelistTab } from "@/features/pricelist/components";
import { usePricelistCatalog } from "@/hooks/usePricelistCatalog";
import { usePricelistPublishedSource } from "@/hooks/usePricelistPublishedSource";
import { useAuth } from "@/providers/AuthProvider";
import { advanceOnboardingStep, hasCompletedPricelistStep } from "@/lib/onboarding";

const TABS = [
  { id: "upload", label: "Upload Pricelist", icon: Upload },
  { id: "published", label: "Published Sources", icon: Database },
  { id: "priority", label: "Source Priority", icon: ListOrdered },
  { id: "trends", label: "Price Trends", icon: TrendingUp },
  { id: "catalog", label: "Price Catalog", icon: LibraryBig },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function PricelistPage() {
  const [activeTab, setActiveTab] = useState<TabId>("upload");
  const goToCatalog = () => setActiveTab("catalog");

  const { currentUser, updateOnboardingStep } = useAuth();
  const supplierCatalog = usePricelistCatalog();
  const { dpwhCatalog } = usePricelistPublishedSource();

  // Both catalogs are lazy-by-default elsewhere (only fetched once their own tab is
  // visited) — loaded eagerly here so Part D's gate and Part E's tab indicators reflect
  // real state as soon as this page mounts, not just after the user happens to open
  // those specific tabs.
  useEffect(() => {
    supplierCatalog.load();
    dpwhCatalog.load();
    // .load() setters are recreated every render (not stable) — this must run once on
    // mount only, not on every render they'd otherwise trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Part D — Step 0 -> 1 gate: real catalog state, not a session flag (see
  // lib/onboarding.ts). Also drives Part E's "needs configuration" dots below.
  const pricelistDone = hasCompletedPricelistStep({
    uploadCatalogCount: supplierCatalog.records.length,
    dpwhCatalogCount: dpwhCatalog.records.length,
  });

  useEffect(() => {
    if (currentUser && pricelistDone) {
      advanceOnboardingStep(currentUser.onboardingStep, 1, updateOnboardingStep);
    }
    // updateOnboardingStep is recreated every AuthProvider render; advanceOnboardingStep
    // no-ops once past the target step, so omitting it here can't miss or double-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, pricelistDone]);

  // Part E — calm "needs configuration" dot: shown on the two tabs that can actually
  // satisfy the Part D gate, cleared the moment either one has real data.
  const needsAttention: Partial<Record<TabId, boolean>> = {
    upload: !pricelistDone,
    published: !pricelistDone,
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

        {activeTab === "upload" && <UploadPricelistTab onViewCatalog={goToCatalog} />}
        {activeTab === "published" && <PublishedSourceTab onViewCatalog={goToCatalog} />}
        {activeTab === "priority" && <SourcePriorityTab />}
        {activeTab === "trends" && <PriceTrendsPanel compact />}
        {activeTab === "catalog" && <PriceCatalogTab />}
      </div>
    </RequireAuth>
  );
}
