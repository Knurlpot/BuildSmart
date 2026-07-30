import type { WorkflowHeaderStep } from "@/providers/WorkflowHeaderProvider";
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

interface BuiltWorkflowSteps {
  steps: WorkflowHeaderStep[];
  currentStep: number;
}

const QUICK_STEPS: WorkflowHeaderStep[] = [
  { number: 1, label: "Client & Project" },
  { number: 2, label: "Input Method" },
  { number: 3, label: "Quick Measure" },
  { number: 4, label: "Configure" },
  { number: 5, label: "Generate" },
  { number: 6, label: "Finalize" },
];

const BLUEPRINT_STEPS: WorkflowHeaderStep[] = [
  { number: 1, label: "Client & Project" },
  { number: 2, label: "Input Method" },
  { number: 3, label: "Upload Blueprint" },
  { number: 4, label: "Configure" },
  { number: 5, label: "Generate" },
  { number: 6, label: "Finalize" },
];

function phaseNumber(phase: WizardPhase, method: InputMethod): number {
  if (phase === "client") return 1;
  if (phase === "method") return 2;
  if (phase === "quick" || phase === "blueprint") return 3;
  if (phase === "configure") return 4;
  if (phase === "generating") return 5;
  if (phase === "results" || phase === "finalized") return 6;
  return method === "blueprint" ? 3 : 1;
}

export function buildWorkflowSteps(
  phase: WizardPhase,
  method: InputMethod,
  segments: DraftSegment[]
): BuiltWorkflowSteps {
  void segments;
  const steps = method === "blueprint" || phase === "blueprint" ? BLUEPRINT_STEPS : QUICK_STEPS;
  return {
    steps,
    currentStep: phaseNumber(phase, method),
  };
}
