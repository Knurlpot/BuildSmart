"use client";

import { useCallback, useState } from "react";
import { ChevronUp, Plus, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { RequireOnboardingStep } from "@/components/auth/RequireOnboardingStep";
import { MyClientsTab } from "@/features/clients/components/MyClientsTab";

function OpenProjectsClients() {
  const router = useRouter();
  const [clientCount, setClientCount] = useState(0);
  const [showClientImport, setShowClientImport] = useState(false);
  const [clientImportKey, setClientImportKey] = useState(0);

  const createNew = useCallback(() => router.push("/quotations/new"), [router]);
  const toggleClientImport = () => {
    if (!showClientImport) setClientImportKey((key) => key + 1);
    setShowClientImport((visible) => !visible);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900">My Clients</h1>
          <p className="text-sm text-gray-500">
            {clientCount} client{clientCount !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={createNew}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover)"
          >
            <Plus className="h-4 w-4" /> Create New
          </button>
          <button
            type="button"
            onClick={toggleClientImport}
            aria-expanded={showClientImport}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-sm transition ${
              showClientImport
                ? "border-primary bg-orange-50 text-primary"
                : "border-gray-200 bg-white text-gray-700 hover:border-primary hover:text-primary"
            }`}
          >
            <Upload className="h-4 w-4" />
            Import Clients
            {showClientImport && <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <MyClientsTab
        onClientCountChange={setClientCount}
        showImport={showClientImport}
        importKey={clientImportKey}
      />
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <RequireOnboardingStep minStep={2}>
      <OpenProjectsClients />
    </RequireOnboardingStep>
  );
}
