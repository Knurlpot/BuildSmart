import type { CSSProperties } from "react";
import { Check } from "lucide-react";

export interface WorkflowStep {
  number: number;
  label: string;
}

export interface WorkflowStepperProps {
  steps: WorkflowStep[];
  currentStep: number;
}

// Notch depth (px) of the chevron point — kept in sync between the clip-path and the
// negative margin that overlaps each step into the previous one's notch, so the strip
// reads as one continuous arrow rather than separate floating pieces.
const NOTCH = 10;

// Reusable step sequence rendered as right-pointing chevron/arrow boxes (Part A — copies
// the Replit prototype's pointed-step look), e.g. "[1 Client & Project>[2 Add Segments>
// [3 Configure Segments>". Lives INSIDE the global Header's inverted orange workflow band
// (see Header.tsx's `workflow` prop), not as a standalone card — renders directly on that
// orange background, so its own colors are white-on-orange throughout.
//
// Only the ACTIVE part's steps are ever passed in (see features/quotation-generation/lib/
// workflowSteps.ts) — this component has no scrolling behavior because it's never asked to
// render more steps than comfortably fit.
//
// Older-user readability: the current step is unmistakable — solid WHITE fill with bold
// orange text (the one saturated-color-on-white combination in the whole bar). Completed
// steps stay legible at white-on-translucent-white; upcoming steps are reduced-opacity
// white — never low-contrast grey sitting directly on the orange fill.
export default function WorkflowStepper({ steps, currentStep }: WorkflowStepperProps) {
  return (
    <div className="flex min-w-0 items-center">
      {steps.map((step, i) => {
        const isCurrent = step.number === currentStep;
        const isCompleted = step.number < currentStep;
        const isFirst = i === 0;

        // Every step gets a right-pointing tip — including the LAST one. It used to skip
        // the clip-path entirely (a plain flat rectangle), which visually chopped off the
        // previous step's point where the two overlapped instead of interlocking with it;
        // ending on a flat edge also read as a dead stop rather than a workflow that
        // continues into Part 2. Only the FIRST step differs (no left notch to interlock
        // with, since nothing precedes it).
        const clipPath = isFirst
          ? `polygon(0% 0%, calc(100% - ${NOTCH}px) 0%, 100% 50%, calc(100% - ${NOTCH}px) 100%, 0% 100%)`
          : `polygon(0% 0%, calc(100% - ${NOTCH}px) 0%, 100% 50%, calc(100% - ${NOTCH}px) 100%, 0% 100%, ${NOTCH}px 50%)`;

        const style: CSSProperties = {
          clipPath,
          marginLeft: isFirst ? 0 : -NOTCH,
          zIndex: isCurrent ? 10 : isCompleted ? 5 : 1,
          paddingRight: 10 + NOTCH,
          paddingLeft: isFirst ? 10 : 10 + NOTCH,
        };

        return (
          <div
            key={step.number}
            style={style}
            className={`relative flex shrink-0 items-center gap-1.5 py-1.5 transition ${
              isCurrent ? "bg-white shadow-md" : isCompleted ? "bg-white/25" : "bg-white/10"
            }`}
          >
            <span
              className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full text-[9px] font-extrabold ${
                isCurrent
                  ? "bg-primary text-white"
                  : isCompleted
                    ? "bg-white text-primary"
                    : "border border-white/40 text-white/70"
              }`}
            >
              {isCompleted ? <Check className="h-2.5 w-2.5" /> : step.number}
            </span>
            <span
              className={`whitespace-nowrap text-[11px] ${
                isCurrent ? "font-extrabold text-primary" : isCompleted ? "font-bold text-white" : "font-semibold text-white/60"
              }`}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
