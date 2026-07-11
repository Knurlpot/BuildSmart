"use client";

import { useState } from "react";
import { Database, ListOrdered, LibraryBig, TrendingUp, Upload } from "lucide-react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { PriceTrendsPanel } from "@/components/market-intelligence/PriceTrendsPanel";
import { PriceCatalogTab, PublishedSourceTab, SourcePriorityTab, UploadPricelistTab } from "@/features/pricelist/components";

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
