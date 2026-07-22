"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2 } from "lucide-react";
import { ClientAndProjectStep } from "./ClientAndProjectStep";
import { InputMethodChoice } from "./InputMethodChoice";
import { QuickMeasurementPanel } from "./QuickMeasurementPanel";
import { BlueprintUploadPanel } from "./BlueprintUploadPanel";
import { ConfigureSegmentsStep } from "./ConfigureSegmentsStep";
import { useUpdateQuotationInputMethod } from "@/hooks/useQuotationGeneration";
import type { Quotation } from "@/types/entities";
import type { Client } from "@/lib/dev/provisional/quotationGenerationTypes";
import type { DraftSegment } from "../lib/draftSegment";

type WizardStep = "client" | "method" | "quick" | "blueprint" | "configure" | "done";

function displayStepNumber(step: WizardStep): 1 | 2 | 3 {
  if (step === "client") return 1;
  if (step === "configure" || step === "done") return 3;
  return 2; // method, quick, blueprint all fall under "Add Segments"
}

const STEP_LABELS = ["Client & Project", "Add Segments", "Configure Segments"] as const;

function Stepper({ step }: { step: WizardStep }) {
  const current = displayStepNumber(step);
  return (
    <div className="flex items-center gap-2">
      {STEP_LABELS.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        return (
          <div key={label} className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition ${
                  n < current
                    ? "bg-primary text-primary-foreground"
                    : n === current
                      ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                      : "bg-gray-100 text-gray-400"
                }`}
              >
                {n < current ? <Check className="h-3.5 w-3.5" /> : n}
              </div>
              <span className={`whitespace-nowrap text-[10px] font-semibold ${n === current ? "text-primary" : "text-gray-400"}`}>
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div className={`mb-3 h-0.5 w-10 rounded transition ${n < current ? "bg-primary" : "bg-gray-100"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Part 1 of 2: start a quotation, get to validated + configured segments. Pricing,
// derivation, and the Practical/Premium breakdown are Part 2 — not built here (see the
// "done" terminal state below).
export function QuotationGenerationWizard() {
  const router = useRouter();
  const { updateInputMethod } = useUpdateQuotationInputMethod();

  const [step, setStep] = useState<WizardStep>("client");
  const [client, setClient] = useState<Client | null>(null);
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [segments, setSegments] = useState<DraftSegment[]>([]);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  const handleClientContinue = (createdQuotation: Quotation, selectedClient: Client) => {
    setQuotation(createdQuotation);
    setClient(selectedClient);
    setStep("method");
  };

  const handleChooseMethod = async (method: "quick" | "blueprint") => {
    if (method === "blueprint" && quotation) {
      // Best-effort correction — this quotation was created with input_method: 'Manual' by
      // default (see ClientAndProjectStep); the local step transition below is what
      // actually matters for the wizard, so a failed PATCH here doesn't block progress.
      await updateInputMethod(quotation.quote_id, "Blueprint").catch(() => {});
    }
    setStep(method);
  };

  let body: React.ReactNode;
  if (step === "client") {
    body = <ClientAndProjectStep onContinue={handleClientContinue} />;
  } else if (step === "method") {
    body = <InputMethodChoice onChoose={handleChooseMethod} />;
  } else if (step === "quick") {
    body = <QuickMeasurementPanel segments={segments} onChange={setSegments} onContinue={() => setStep("configure")} />;
  } else if (step === "blueprint" && quotation) {
    body = (
      <BlueprintUploadPanel
        quoteId={quotation.quote_id}
        segments={segments}
        onChange={setSegments}
        onConfirm={() => setStep("configure")}
      />
    );
  } else if (step === "configure" && quotation) {
    body = (
      <ConfigureSegmentsStep
        quoteId={quotation.quote_id}
        segments={segments}
        onChange={setSegments}
        onSaved={(count) => {
          setSavedCount(count);
          setStep("done");
        }}
      />
    );
  } else if (step === "done" && quotation) {
    body = (
      <div className="flex max-w-xl flex-col items-center gap-4 rounded-2xl border border-green-200 bg-green-50/50 p-8 text-center">
        <CheckCircle2 className="h-10 w-10 text-green-500" />
        <div>
          <h2 className="text-lg font-bold text-gray-900">Segments saved</h2>
          <p className="mt-1 text-sm text-gray-600">
            {savedCount} segment{savedCount === 1 ? "" : "s"} saved for {quotation.project_name}. Pricing and the
            Practical/Premium quotation breakdown continue in the next step (not yet built).
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push(`/quotations/${quotation.quote_id}`)}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover)"
        >
          View Quotation
        </button>
      </div>
    );
  } else {
    // Unreachable in practice: every branch above that needs `quotation` is only ever
    // entered right after ClientAndProjectStep sets it. Kept as an honest fallback rather
    // than a silent blank screen if that invariant is ever broken by a future edit.
    body = <p className="text-sm text-gray-400">Something went wrong with this quotation — start again.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-gray-900">New Quotation</h1>
          {client && quotation ? (
            <p className="text-sm text-gray-500">
              Quoting for <span className="font-semibold text-gray-700">{client.client_name}</span> —{" "}
              {quotation.project_name}
            </p>
          ) : (
            <p className="text-sm text-gray-500">Select a client and the basics of the project.</p>
          )}
        </div>
        <Stepper step={step} />
      </div>
      {body}
    </div>
  );
}