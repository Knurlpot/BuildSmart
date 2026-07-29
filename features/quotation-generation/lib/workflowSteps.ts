// Path-aware step list for the QG workflow header (components/layout/Header.tsx's
// `workflow` prop, via useWorkflowHeader). The two input methods have genuinely different
// step counts — this reflects that honestly instead of pretending both are the same 3
// steps, while anchoring the start ("Client & Project") so only the MIDDLE segment changes
// length when the path is chosen.
//
// Part 1 / Part 2 split (Header Part A): only the ACTIVE part's steps render in the
// stepper. PART_2_STEPS is now actually wired (see buildWorkflowSteps below) once the
// wizard reaches "generating"/"results" — the header keeps Part 1's steps checked off and
// appends these, rather than replacing them, since the whole point is one continuous
// workflow. "finalized" gets NO steps at all — useWorkflowHeader(null) is called directly
// for that phase instead of through this function (see QuotationGenerationWizard.tsx),
// since the orange header ends there per the lifecycle rule.
import type { WorkflowStep } from "@/components/layout/WorkflowStepper";
import type { DraftSegment } from "./draftSegment";

export type InputMethod = "quick" | "blueprint" | null;
export type WizardPhase =
  | "client"
  | "method"
  | "quick"
  | "blueprint"
  | "configure"
  | "generating"
  | "results"
  | "finalized";

const CLIENT_STEP = "Client & Project";
const CONFIGURE_STEP = "Configure Segments";

export const PART_2_STEPS = ["Generate", "Review & Finalize"];

// The middle segment only — excludes the shared "Client & Project" prefix and the
// "Configure Segments" convergence point, matching the step counts shown on the input
// method choice cards ("2 steps" / "4 steps" — see InputMethodChoice.tsx).
export const QUICK_MEASUREMENT_STEPS = ["Measure"];
// Part C — unified to the correct two-step sequence: reviewing IS validating (there's no
// separate pass after it), so the old third "Validate/Edit" label was a distinct step for
// something that never actually happened as its own screen. Upload Blueprint marks complete
// the moment the upload actually produces segments (see hasBlueprintSegments below), not
// before.
export const UPLOAD_BLUEPRINT_STEPS = ["Upload Blueprint", "Review Segments"];
const NEUTRAL_STEPS = ["Add Segments"];

function middleLabelsFor(method: InputMethod): string[] {
  if (method === "quick") return QUICK_MEASUREMENT_STEPS;
  if (method === "blueprint") return UPLOAD_BLUEPRINT_STEPS;
  return NEUTRAL_STEPS;
}

// Part C bug fix — `segments` is shared wizard-wide state (Quick Measurement and Blueprint
// write to the same array). If a user adds a manual segment on the Quick path, backs out,
// and switches to Blueprint instead, `segments` is non-empty even though nothing has been
// uploaded yet — a plain `segments.length === 0` check would wrongly mark "Upload Blueprint"
// complete while the upload dropzone is still on screen. Only actual blueprint EXTRACTION
// output (source_method === 'Blueprint') means a file has really been scanned.
function hasBlueprintSegments(segments: DraftSegment[]): boolean {
  return segments.some((s) => s.source_method === "Blueprint");
}

export interface WorkflowStepsResult {
  steps: WorkflowStep[];
  currentStep: number;
}

export function buildWorkflowSteps(phase: WizardPhase, method: InputMethod, segments: DraftSegment[]): WorkflowStepsResult {
  const part1Labels = [CLIENT_STEP, ...middleLabelsFor(method), CONFIGURE_STEP];
  const configureIndex = part1Labels.length; // 1-based position of "Configure Segments"

  if (phase === "generating" || phase === "results") {
    const labels = [...part1Labels, ...PART_2_STEPS];
    const steps: WorkflowStep[] = labels.map((label, i) => ({ number: i + 1, label }));
    // "generating" -> "Generate" current; "results" -> "Review & Finalize" current. Both
    // sit past Configure Segments, which stays checked off throughout Part 2 — nothing
    // about reaching Generate un-does Part 1.
    const currentStep = phase === "generating" ? configureIndex + 1 : configureIndex + 2;
    return { steps, currentStep };
  }

  const steps: WorkflowStep[] = part1Labels.map((label, i) => ({ number: i + 1, label }));
  let currentStep: number;
  if (phase === "client") {
    currentStep = 1;
  } else if (phase === "method") {
    currentStep = 2; // the neutral "Add Segments" slot, before a path is chosen
  } else if (phase === "quick") {
    currentStep = 2; // "Measure"
  } else if (phase === "blueprint") {
    // Two steps only (Part C): "Upload Blueprint" is current until a scan has actually
    // produced segments, then "Review Segments" is current for the rest of this phase —
    // reviewing/confirming/excluding doesn't move the stepper again until the wizard
    // itself advances to "configure".
    currentStep = hasBlueprintSegments(segments) ? 3 : 2;
  } else {
    // "configure"
    currentStep = configureIndex;
  }

  return { steps, currentStep };
}
