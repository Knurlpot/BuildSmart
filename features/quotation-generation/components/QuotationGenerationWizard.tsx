"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWorkflowHeader } from "@/providers/WorkflowHeaderProvider";
import { AmbientBackground } from "./AmbientBackground";
import { ClientAndProjectStep } from "./ClientAndProjectStep";
import { InputMethodChoice } from "./InputMethodChoice";
import { QuickMeasurementPanel } from "./QuickMeasurementPanel";
import { BlueprintUploadPanel } from "./BlueprintUploadPanel";
import { ConfigureSegmentsStep } from "./ConfigureSegmentsStep";
import { GeneratingQuotationAnimation } from "./GeneratingQuotationAnimation";
import { QuotationResultsStep } from "./QuotationResultsStep";
import { useDeleteDraftQuotation, useUpdateQuotationInputMethod } from "@/hooks/useQuotationGeneration";
import { apiClient } from "@/lib/api/client";
import { buildWorkflowSteps, type InputMethod, type WizardPhase } from "../lib/workflowSteps";
import type { Quotation, Client } from "@/types/entities";
import type { DraftSegment } from "../lib/draftSegment";
import type { BlueprintFloor } from "@/lib/dev/provisional/quotationGenerationTypes";
import type { ProjectSegment } from "@/types/entities/project-segment";

interface ResumeQuotationPayload extends Quotation {
  client: Client | null;
}

interface LocalQuotationDraft {
  quoteId: number;
  step: WizardPhase;
  method: InputMethod;
  segments: DraftSegment[];
  blueprintFloors: BlueprintFloor[] | null;
  originalBlueprintFloors: BlueprintFloor[] | null;
  blueprintFilePath: string | null;
  updatedAt: string;
}

const LOCAL_DRAFTS_KEY = "buildsmart_quotation_drafts_v1";

function readLocalQuotationDrafts(): Record<string, LocalQuotationDraft> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_DRAFTS_KEY) ?? "{}") as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, LocalQuotationDraft>)
      : {};
  } catch {
    return {};
  }
}

function readLocalQuotationDraft(quoteId: number): LocalQuotationDraft | null {
  return readLocalQuotationDrafts()[String(quoteId)] ?? null;
}

function writeLocalQuotationDraft(draft: LocalQuotationDraft) {
  if (typeof window === "undefined") return;
  const drafts = readLocalQuotationDrafts();
  drafts[String(draft.quoteId)] = draft;
  window.localStorage.setItem(LOCAL_DRAFTS_KEY, JSON.stringify(drafts));
}

function clearLocalQuotationDraft(quoteId: number) {
  if (typeof window === "undefined") return;
  const drafts = readLocalQuotationDrafts();
  delete drafts[String(quoteId)];
  window.localStorage.setItem(LOCAL_DRAFTS_KEY, JSON.stringify(drafts));
}

function parsePolygon(value?: string | null): [number, number][] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return null;
    const points = parsed.filter(
      (point): point is [number, number] =>
        Array.isArray(point) &&
        point.length === 2 &&
        typeof point[0] === "number" &&
        typeof point[1] === "number"
    );
    return points.length >= 3 ? points : null;
  } catch {
    return null;
  }
}

function draftFromSavedSegment(segment: ProjectSegment): DraftSegment {
  const polygon = parsePolygon(segment.polygon_coords);
  return {
    draft_id: `seg-${segment.segment_id}`,
    segment_name: segment.segment_name,
    floor_level: segment.floor_level,
    source_method: segment.source_method === "Blueprint" ? "Blueprint" : "Manual",
    entry_mode: "total_sqm",
    length: null,
    width: null,
    overall_length: null,
    overall_width: null,
    notch_length: null,
    notch_width: null,
    area_sqm: segment.area_sqm,
    polygon_coords: polygon,
    polygon_groups: polygon ? [polygon] : null,
    confidence_score: segment.confidence_score ?? null,
    geometry_flagged: false,
    geometry_warnings: [],
    boundary_estimated: false,
    confirmed: true,
    included_in_quote: segment.included_in_quote,
    treatment_type: segment.scope_of_work === "Not specified" ? null : segment.scope_of_work,
    is_rush: false,
    condition_tags: [],
    site_notes: segment.notes ?? "",
  };
}

// Part 1: client/project through validated + configured segments. Part 2 (FIX 5 / P2-A–E):
// Generate's loading animation, Practical/Premium results, revision, and finalize — a
// mock/presentational shell (lib/dev/provisional/quotationBreakdownFixtures.ts), since the
// schema has none of the columns a real derivation would need yet. See that file and
// quotationBreakdownTypes.ts for the full list of what's provisional.
export function QuotationGenerationWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resumeQuoteId = searchParams.get("resumeQuoteId");
  const { updateInputMethod } = useUpdateQuotationInputMethod();
  const { deleteDraftQuotation } = useDeleteDraftQuotation();

  const [step, setStep] = useState<WizardPhase>("client");
  const [method, setMethod] = useState<InputMethod>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [segments, setSegments] = useState<DraftSegment[]>([]);
  // P2 Part E — lifted out of BlueprintUploadPanel so a Structural revision (which returns
  // here by changing `step` back to "blueprint", unmounting/remounting that component)
  // shows the SAME already-scanned segments instead of forcing a new upload. See
  // BlueprintUploadPanel.tsx's prop doc for why local state there couldn't survive this.
  const [blueprintFloors, setBlueprintFloors] = useState<BlueprintFloor[] | null>(null);
  const [blueprintFilePath, setBlueprintFilePath] = useState<string | null>(null);
  const [originalBlueprintFloors, setOriginalBlueprintFloors] = useState<BlueprintFloor[] | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [isResuming, setIsResuming] = useState(() => Boolean(resumeQuoteId));

  useEffect(() => {
    const raw = resumeQuoteId;
    const quoteId = raw ? Number(raw) : NaN;
    if (!Number.isInteger(quoteId)) return;

    let cancelled = false;
    Promise.all([
      apiClient<ResumeQuotationPayload>(`/api/quotations/${quoteId}`, { credentials: "include" }),
      apiClient<{ segments: ProjectSegment[] }>(`/api/quotations/${quoteId}/segments`, { credentials: "include" }),
    ])
      .then(([resumeQuotation, savedSegments]) => {
        if (cancelled) return;
        const localDraft = readLocalQuotationDraft(quoteId);
        setQuotation(resumeQuotation);
        setClient(resumeQuotation.client);
        const savedDrafts = savedSegments.segments.map(draftFromSavedSegment);
        const drafts = localDraft?.segments?.length ? localDraft.segments : savedDrafts;
        setSegments(drafts);
        const nextMethod = localDraft?.method ?? (resumeQuotation.input_method === "Blueprint" ? "blueprint" : "quick");
        setMethod(nextMethod);
        setBlueprintFloors(localDraft?.blueprintFloors ?? null);
        setOriginalBlueprintFloors(localDraft?.originalBlueprintFloors ?? null);
        setBlueprintFilePath(localDraft?.blueprintFilePath ?? null);
        setStep(
          localDraft?.step && localDraft.step !== "client" && localDraft.step !== "method" && localDraft.step !== "finalized"
            ? localDraft.step
            : drafts.length > 0
              ? "configure"
              : nextMethod === "blueprint"
                ? "blueprint"
                : "quick"
        );
      })
      .catch((error) => {
        if (!cancelled) setResumeError(error instanceof Error ? error.message : "Could not resume this quotation.");
      })
      .finally(() => {
        if (!cancelled) setIsResuming(false);
      });

    return () => {
      cancelled = true;
    };
  }, [resumeQuoteId]);

  useEffect(() => {
    if (!quotation || step === "client" || step === "method" || step === "finalized") return;
    writeLocalQuotationDraft({
      quoteId: quotation.quote_id,
      step,
      method,
      segments,
      blueprintFloors,
      originalBlueprintFloors,
      blueprintFilePath,
      updatedAt: new Date().toISOString(),
    });
  }, [blueprintFilePath, blueprintFloors, method, originalBlueprintFloors, quotation, segments, step]);

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
      // Choosing Upload Blueprint from the method picker means "start that path now".
      // If the user backed out of a previous scan, clear the lifted scan state so the
      // upload dropzone appears again. Configure-back and Structural Revision still
      // preserve scans because they jump straight to the blueprint step.
      setBlueprintFloors(null);
      setOriginalBlueprintFloors(null);
      setSegments((current) => current.filter((segment) => segment.source_method !== "Blueprint"));
      // Best-effort correction — this quotation was created with input_method: 'Manual' by
      // default (see ClientAndProjectStep); the local step transition below is what
      // actually matters for the wizard, so a failed PATCH here doesn't block progress.
      await updateInputMethod(quotation.quote_id, "Blueprint").catch(() => {});
    }
    setMethod(chosen);
    setStep(chosen);
  };

  // Part H — a single linear back-chain: Configure → (Quick or Blueprint, whichever this
  // quotation actually used) → the method-choice overlay. Once the user abandons the
  // method-choice overlay, the server-side Draft quotation is discarded too, so cancelled
  // project attempts never remain visible as real projects.
  const resetDraftState = () => {
    setMethod(null);
    setQuotation(null);
    setSegments([]);
    setBlueprintFloors(null);
    setOriginalBlueprintFloors(null);
  };

  const discardDraftQuotation = async () => {
    const quoteId = quotation?.quote_id;
    if (quoteId) {
      clearLocalQuotationDraft(quoteId);
      await deleteDraftQuotation(quoteId).catch(() => {});
    }
    resetDraftState();
  };

  const handleBackToMethod = () => setStep("method");
  const handleBackToClient = async () => {
    await discardDraftQuotation();
    setStep("client");
  };
  const handleExitWizard = async () => {
    await discardDraftQuotation();
    router.push("/dashboard");
  };

  let body: React.ReactNode;
  if (isResuming) {
    body = <p className="rounded-2xl border border-gray-100 bg-white p-5 text-sm text-gray-500 shadow-sm">Loading unfinished quotation...</p>;
  } else if (resumeError) {
    body = <p className="rounded-2xl border border-red-100 bg-red-50 p-5 text-sm text-red-700">{resumeError}</p>;
  } else if (step === "client") {
    body = <ClientAndProjectStep onContinue={handleClientContinue} onExit={handleExitWizard} />;
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
        blueprintFilePath={blueprintFilePath}
        onBlueprintFilePathChange={setBlueprintFilePath}
      />
    );
  } else if (step === "configure" && quotation) {
    body = (
      <ConfigureSegmentsStep
        quoteId={quotation.quote_id}
        segments={segments}
        onChange={setSegments}
        onSaved={(count) => {
          void count;
          // FIX 5 — Configure -> Generate, not straight to a terminal screen. The loading
          // overlay plays for its own fixed duration (see GeneratingQuotationAnimation),
          // then reveals the Practical/Premium results (P2-A).
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
        onSaveDraft={() => router.push("/projects")}
        onFinalize={() => {
          clearLocalQuotationDraft(quotation.quote_id);
          router.push("/projects");
        }}
      />
    );
  } else {
    // Unreachable in practice: every branch above that needs `quotation` is only ever
    // entered right after ClientAndProjectStep sets it. Kept as an honest fallback rather
    // than a silent blank screen if that invariant is ever broken by a future edit.
    body = <p className="text-sm text-gray-400">Something went wrong. Start the quotation again.</p>;
  }

  return (
    <div className="relative -m-6 min-h-full p-6">
      {/* Ambient backdrop for the whole workflow — dimmed to near-nothing during blueprint
          review specifically, so it never competes with the polygon overlay (Part B). */}
      <AmbientBackground dimmed={step === "blueprint"} />
      <div className="relative flex flex-col gap-5">
        {step !== "results" && (
          <div>
            <h1 className="text-lg font-extrabold tracking-tight text-gray-900">New Quotation</h1>
            {client && quotation ? (
              <p className="text-sm text-gray-500">
                Quoting for <span className="font-semibold text-gray-700">{client.client_name}</span>: {quotation.project_name}
              </p>
            ) : (
              <p className="text-sm text-gray-500">Select a client and the basics of the project.</p>
            )}
          </div>
        )}
        {body}
      </div>
    </div>
  );
}
