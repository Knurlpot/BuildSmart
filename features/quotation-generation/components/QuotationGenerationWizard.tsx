"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { useWorkflowHeader } from "@/providers/WorkflowHeaderProvider";
import { AmbientBackground } from "./AmbientBackground";
import { ClientAndProjectStep } from "./ClientAndProjectStep";
import { InputMethodChoice } from "./InputMethodChoice";
import { QuickMeasurementPanel } from "./QuickMeasurementPanel";
import { BlueprintUploadPanel } from "./BlueprintUploadPanel";
import { ConfigureSegmentsStep } from "./ConfigureSegmentsStep";
import { GeneratingQuotationAnimation } from "./GeneratingQuotationAnimation";
import { QuotationResultsStep } from "./QuotationResultsStep";
import { useUpdateQuotationInputMethod } from "@/hooks/useQuotationGeneration";
import { buildWorkflowSteps, type InputMethod, type WizardPhase } from "../lib/workflowSteps";
import type { Quotation, Client } from "@/types/entities";
import type { DraftSegment } from "../lib/draftSegment";
import type { BlueprintFloor } from "@/lib/dev/provisional/quotationGenerationTypes";

// Part 1: client/project through validated + configured segments. Part 2 (FIX 5 / P2-A–E):
// Generate's loading animation, Economic/Premium results, revision, and finalize — a
// mock/presentational shell (lib/dev/provisional/quotationBreakdownFixtures.ts), since the
// schema has none of the columns a real derivation would need yet. See that file and
// quotationBreakdownTypes.ts for the full list of what's provisional.
export function QuotationGenerationWizard() {
  const router = useRouter();
  const { updateInputMethod } = useUpdateQuotationInputMethod();

  const [step, setStep] = useState<WizardPhase>("client");
  const [method, setMethod] = useState<InputMethod>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [segments, setSegments] = useState<DraftSegment[]>([]);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  // P2 Part E — lifted out of BlueprintUploadPanel so a Structural revision (which returns
  // here by changing `step` back to "blueprint", unmounting/remounting that component)
  // shows the SAME already-scanned segments instead of forcing a new upload. See
  // BlueprintUploadPanel.tsx's prop doc for why local state there couldn't survive this.
  const [blueprintFloors, setBlueprintFloors] = useState<BlueprintFloor[] | null>(null);
  const [originalBlueprintFloors, setOriginalBlueprintFloors] = useState<BlueprintFloor[] | null>(null);

  // Registers the path-aware step sequence on the GLOBAL header (components/layout/
  // Header.tsx's `workflow` prop) for as long as this wizard stays mounted — see
  // providers/WorkflowHeaderProvider.tsx. No in-page stepper anymore; this is the only
  // place the wizard's step state gets rendered. "finalized" passes null instead of
  // building steps — that's the lifecycle rule (P2-E): the orange header ends there, not
  // on unmount, since the user is still on this same mounted component looking at a
  // saved-quote confirmation.
  useWorkflowHeader(
    step === "finalized"
      ? null
      : {
          label: "Quotation Generation",
          ...buildWorkflowSteps(step, method, segments),
        }
  );

  const handleClientContinue = (createdQuotation: Quotation, selectedClient: Client) => {
    setQuotation(createdQuotation);
    setClient(selectedClient);
    setStep("method");
  };

  const handleChooseMethod = async (chosen: "quick" | "blueprint") => {
    if (chosen === "blueprint" && quotation) {
      // Best-effort correction — this quotation was created with input_method: 'Manual' by
      // default (see ClientAndProjectStep); the local step transition below is what
      // actually matters for the wizard, so a failed PATCH here doesn't block progress.
      await updateInputMethod(quotation.quote_id, "Blueprint").catch(() => {});
    }
    setMethod(chosen);
    setStep(chosen);
  };

  // Part H — a single linear back-chain: Configure → (Quick or Blueprint, whichever this
  // quotation actually used) → the method-choice overlay → Client & Project. Going back
  // never discards `segments`/`quotation`/`client` — only `step` (and `method`, once back
  // at the choice overlay) moves.
  const handleBackToMethod = () => setStep("method");
  const handleBackToClient = () => {
    setMethod(null);
    setStep("client");
  };

  let body: React.ReactNode;
  if (step === "client") {
    body = <ClientAndProjectStep onContinue={handleClientContinue} />;
  } else if (step === "method") {
    body = <InputMethodChoice onChoose={handleChooseMethod} onBack={handleBackToClient} />;
  } else if (step === "quick") {
    body = (
      <QuickMeasurementPanel
        segments={segments}
        onChange={setSegments}
        onContinue={() => setStep("configure")}
        onBack={handleBackToMethod}
      />
    );
  } else if (step === "blueprint" && quotation) {
    body = (
      <BlueprintUploadPanel
        quoteId={quotation.quote_id}
        projectName={quotation.project_name}
        segments={segments}
        onChange={setSegments}
        onConfirm={() => setStep("configure")}
        onBack={handleBackToMethod}
        floors={blueprintFloors}
        onFloorsChange={setBlueprintFloors}
        originalFloors={originalBlueprintFloors}
        onOriginalFloorsChange={setOriginalBlueprintFloors}
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
          // FIX 5 — Configure -> Generate, not straight to a terminal screen. The loading
          // overlay plays for its own fixed duration (see GeneratingQuotationAnimation),
          // then reveals the Economic/Premium results (P2-A).
          setStep("generating");
        }}
        onBack={() => setStep(method ?? "method")}
      />
    );
  } else if (step === "generating") {
    body = (
      <div className="flex justify-center">
        <div className="w-full max-w-xl">
          <GeneratingQuotationAnimation onComplete={() => setStep("results")} />
        </div>
      </div>
    );
  } else if (step === "results" && quotation && client) {
    body = (
      <QuotationResultsStep
        client={client}
        quotation={quotation}
        segments={segments}
        // Task 7, Part B — Segment Breakdown's split-view blueprint preview needs the SAME
        // floors this quote was scanned from (null for Quick Measurement/Manual, where the
        // breakdown gracefully falls back to a segment list instead).
        blueprintFloors={blueprintFloors}
        // Activity diagram's "Structural revision -> Return to segmentation" — back to
        // whichever path this quotation actually used, segments intact (nothing here
        // clears them; the user re-reviews/re-confirms from where they left off).
        onStructuralRevision={() => setStep(method ?? "method")}
        onFinalize={() => setStep("finalized")}
      />
    );
  } else if (step === "finalized" && quotation) {
    body = (
      <div className="flex max-w-xl flex-col items-center gap-4 rounded-2xl border border-green-200 bg-green-50/50 p-8 text-center">
        <CheckCircle2 className="h-10 w-10 text-green-500" />
        <div>
          <h2 className="text-lg font-bold text-gray-900">Quotation finalized</h2>
          <p className="mt-1 text-sm text-gray-600">
            {savedCount} segment{savedCount === 1 ? "" : "s"} saved for {quotation.project_name}. Economic and
            Premium are saved as a linked pair for this project (mock — see the summary for exactly which
            tier-linkage fields this depends on).
            {client?.client_type === "New" && " This client stays 'New' until a later quotation actually references them again."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(`/quotations/${quotation.quote_id}`)}
            className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-bold text-gray-600 transition hover:bg-gray-50"
          >
            View Quotation
          </button>
          <button
            type="button"
            onClick={() => router.push("/projects")}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover)"
          >
            Go to Open Projects
          </button>
        </div>
      </div>
    );
  } else {
    // Unreachable in practice: every branch above that needs `quotation` is only ever
    // entered right after ClientAndProjectStep sets it. Kept as an honest fallback rather
    // than a silent blank screen if that invariant is ever broken by a future edit.
    body = <p className="text-sm text-gray-400">Something went wrong with this quotation — start again.</p>;
  }

  return (
    <div className="relative -m-6 min-h-full p-6">
      {/* Ambient backdrop for the whole workflow — dimmed to near-nothing during blueprint
          review specifically, so it never competes with the polygon overlay (Part B). */}
      <AmbientBackground dimmed={step === "blueprint"} />
      <div className="relative flex flex-col gap-5">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight text-gray-900">New Quotation</h1>
          {client && quotation ? (
            <p className="text-sm text-gray-500">
              Quoting for <span className="font-semibold text-gray-700">{client.client_name}</span> — {quotation.project_name}
            </p>
          ) : (
            <p className="text-sm text-gray-500">Select a client and the basics of the project.</p>
          )}
        </div>
        {body}
      </div>
    </div>
  );
}
