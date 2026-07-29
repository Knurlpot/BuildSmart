import { Check, ChevronRight } from "lucide-react";

export interface WorkflowStep {
  number: number;
  label: string;
}

export interface WorkflowStepperProps {
  steps: WorkflowStep[];
  currentStep: number;
}

// Reusable horizontal workflow header band — e.g. "1 Client & Project › 2 Add Segments ›
// 3 Configure Segments". Purely presentational: takes `steps` + `currentStep`, renders,
// nothing else. Used by Quotation Generation now; any other multi-step workflow (Pricelist
// setup, etc.) can reuse it as-is rather than building a per-page copy.
//
// Older-user readability: the current step is visually dominant — solid primary fill,
// bold white text, its own shadow. Completed/upcoming steps stay legible (dark text on a
// light or white background) rather than low-contrast grey text sitting on a colored fill.
export default function WorkflowStepper({ steps, currentStep }: WorkflowStepperProps) {
  return (
    <div className="flex w-full flex-wrap items-center gap-x-1.5 gap-y-2 rounded-2xl border-2 border-primary/15 bg-orange-50/60 px-4 py-3">
      {steps.map((step, i) => {
        const isCurrent = step.number === currentStep;
        const isCompleted = step.number < currentStep;
        return (
          <div key={step.number} className="flex items-center gap-1.5">
            <div
              className={`flex items-center gap-2.5 rounded-xl px-4 py-2.5 transition ${
                isCurrent ? "bg-primary shadow-md" : isCompleted ? "border-2 border-gray-200 bg-white" : "bg-transparent"
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${
                  isCurrent
                    ? "bg-white text-primary"
                    : isCompleted
                      ? "bg-gray-800 text-white"
                      : "border-2 border-gray-300 text-gray-500"
                }`}
              >
                {isCompleted ? <Check className="h-4 w-4" /> : step.number}
              </span>
              <span
                className={`whitespace-nowrap ${
                  isCurrent ? "text-base font-extrabold text-white" : isCompleted ? "text-sm font-bold text-gray-700" : "text-sm font-semibold text-gray-500"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <ChevronRight className={`h-5 w-5 shrink-0 ${step.number < currentStep ? "text-gray-400" : "text-gray-300"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}