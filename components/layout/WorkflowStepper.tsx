import type { CSSProperties } from "react";
import { Check, ChevronLeft } from "lucide-react";

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

// Part A — the window: at most this many chevrons render at once. QG's Blueprint path is
// 6 steps end to end (Client & Project → Upload Blueprint → Review Segments → Configure
// Segments → Generate → Review & Finalize) — rendered flat, that's wide enough to collide
// with the username on the right at real viewport widths. Only completed steps are ever
// dropped to make room; the current step and everything upcoming always stays visible.
const MAX_VISIBLE_STEPS = 5;

interface WindowedSteps {
  hiddenCompletedCount: number;
  visible: WorkflowStep[];
}

function windowSteps(steps: WorkflowStep[], currentStep: number): WindowedSteps {
  const completed = steps.filter((s) => s.number < currentStep);
  const currentAndUpcoming = steps.filter((s) => s.number >= currentStep);
  // Current + upcoming are NEVER trimmed — only completed steps make way, and only as many
  // as it takes to fit the window. If current+upcoming alone already exceeds the window
  // (only possible at the very first step of a 6-step path, nothing completed yet to drop),
  // everything just renders — the window is a target, not a hard cap on what must stay visible.
  const visibleCompletedCount = Math.max(0, MAX_VISIBLE_STEPS - currentAndUpcoming.length);
  const hiddenCompletedCount = Math.max(0, completed.length - visibleCompletedCount);
  const visibleCompleted = visibleCompletedCount > 0 ? completed.slice(-visibleCompletedCount) : [];
  return { hiddenCompletedCount, visible: [...visibleCompleted, ...currentAndUpcoming] };
}

// Reusable step sequence rendered as right-pointing chevron/arrow boxes (Part A — copies
// the Replit prototype's pointed-step look), e.g. "[1 Client & Project>[2 Add Segments>
// [3 Configure Segments>". Lives INSIDE the global Header's inverted orange workflow band
// (see Header.tsx's `workflow` prop), not as a standalone card — renders directly on that
// orange background, so its own colors are white-on-orange throughout.
//
// Windowed to ~5 chevrons (see MAX_VISIBLE_STEPS) rather than rendering every step flat —
// a 6-step path used to overflow past the header's available width and visually collide
// with the username on the right. `overflow-hidden` on the row is a defensive backstop: at
// very narrow viewports even the windowed set can outgrow the space, and clipping is far
// safer than letting content paint over the profile widget.
//
// Older-user readability: the current step is unmistakable — solid WHITE fill with bold
// orange text (the one saturated-color-on-white combination in the whole bar). Completed
// steps stay legible at white-on-translucent-white; upcoming steps are reduced-opacity
// white — never low-contrast grey sitting directly on the orange fill.
export default function WorkflowStepper({ steps, currentStep }: WorkflowStepperProps) {
  const { hiddenCompletedCount, visible } = windowSteps(steps, currentStep);

  return (
    <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
      {hiddenCompletedCount > 0 && (
        <span
          title={`${hiddenCompletedCount} earlier step${hiddenCompletedCount === 1 ? "" : "s"} completed`}
          className="flex shrink-0 items-center gap-0.5 rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold text-white/60"
        >
          <ChevronLeft className="h-3 w-3" />
          {hiddenCompletedCount} done
        </span>
      )}
      {visible.map((step, i) => {
        const isCurrent = step.number === currentStep;
        const isCompleted = step.number < currentStep;
        // "First" here means first of the VISIBLE strip, not first of the whole workflow —
        // once earlier steps are windowed out, the collapsed chip above takes their place
        // as a separate, unchained pill rather than trying to interlock the clip-path chain
        // with it.
        const isFirst = i === 0;

        // Every step gets a right-pointing tip — including the LAST one. It used to skip
        // the clip-path entirely (a plain flat rectangle), which visually chopped off the
        // previous step's point where the two overlapped instead of interlocking with it;
        // ending on a flat edge also read as a dead stop rather than a workflow that
        // continues into Part 2. Only the FIRST visible step differs (no left notch to
        // interlock with, since nothing precedes it in the chevron chain).
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
