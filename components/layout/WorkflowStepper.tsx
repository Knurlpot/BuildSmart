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

// 
const NOTCH = 10;

const MAX_VISIBLE_STEPS = 5;

interface WindowedSteps {
  hiddenCompletedCount: number;
  visible: WorkflowStep[];
}

function windowSteps(steps: WorkflowStep[], currentStep: number): WindowedSteps {
  const completed = steps.filter((s) => s.number < currentStep);
  const currentAndUpcoming = steps.filter((s) => s.number >= currentStep);


  const visibleCompletedCount = Math.max(0, MAX_VISIBLE_STEPS - currentAndUpcoming.length);
  const hiddenCompletedCount = Math.max(0, completed.length - visibleCompletedCount);
  const visibleCompleted = visibleCompletedCount > 0 ? completed.slice(-visibleCompletedCount) : [];
  return { hiddenCompletedCount, visible: [...visibleCompleted, ...currentAndUpcoming] };
}


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
        const isFirst = i === 0;

        //
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