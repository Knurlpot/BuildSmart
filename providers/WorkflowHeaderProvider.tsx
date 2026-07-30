"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface WorkflowHeaderStep {
  number: number;
  label: string;
}

// What a major multi-step workflow (Quotation Generation now, Pricelist setup later)
// registers with the global Header so it can render its inverted "workflow mode" chrome.
// This is NOT tied to specific step numbers — a workflow stays registered for its entire
// lifecycle (see useWorkflowHeader below) and only clears when the owning component
// unmounts (i.e. the user navigates away, having saved or cancelled), regardless of how
// many steps get added later (e.g. Part 2's Generate/Finalize tail).
export interface WorkflowHeaderState {
  label: string;
  steps: WorkflowHeaderStep[];
  currentStep: number;
}

type Setter = (workflow: WorkflowHeaderState | null) => void;

// Split into two contexts DELIBERATELY — not just for micro-optimization. A workflow (the
// QG wizard) both WRITES to this state (useWorkflowHeader) and, transitively, would
// subscribe to it if there were only one combined context — since useState's setter is
// stable but the current `workflow` VALUE changes every time it's called, a producer that
// reads the same context it writes to re-renders itself every time it writes, which
// re-triggers its own effect, which writes again: an infinite loop. Splitting means
// useWorkflowHeader only ever subscribes to the stable setter (never re-renders when the
// value changes), while Header/AppShell subscribe to the value (and SHOULD re-render when
// it changes, since that's what makes the header repaint).
const WorkflowHeaderValueContext = createContext<WorkflowHeaderState | null>(null);
const WorkflowHeaderSetterContext = createContext<Setter | null>(null);

// Wraps the app shell (AppShell.tsx) so the layout-level Header and a deeply-nested
// workflow (e.g. the QG wizard, several component-levels below any given page) can share
// this state without prop-drilling through every page in between.
export function WorkflowHeaderProvider({ children }: { children: ReactNode }) {
  const [workflow, setWorkflow] = useState<WorkflowHeaderState | null>(null);
  return (
    <WorkflowHeaderSetterContext.Provider value={setWorkflow}>
      <WorkflowHeaderValueContext.Provider value={workflow}>{children}</WorkflowHeaderValueContext.Provider>
    </WorkflowHeaderSetterContext.Provider>
  );
}

/** For Header/AppShell — the CURRENT registered workflow (or null). Re-renders when it
 * changes; that's the point, since it drives what the header paints. */
export function useWorkflowHeaderValue(): WorkflowHeaderState | null {
  return useContext(WorkflowHeaderValueContext);
}

function useWorkflowHeaderSetter(): Setter {
  const setWorkflow = useContext(WorkflowHeaderSetterContext);
  if (!setWorkflow) throw new Error("useWorkflowHeader must be used within a WorkflowHeaderProvider");
  return setWorkflow;
}

// A workflow (e.g. QuotationGenerationWizard) calls this with its current path-aware steps
// on every render. Registration lasts exactly as long as the calling component is mounted —
// the cleanup clears it on unmount, which is what actually reverts the header to its normal
// white state once the user navigates away (save-and-leave, cancel, or discard all end up
// here the same way: the wizard unmounts). Pass `null` to explicitly show no workflow chrome
// while still mounted, if a workflow ever needs that.
export function useWorkflowHeader(workflow: WorkflowHeaderState | null): void {
  const setWorkflow = useWorkflowHeaderSetter();
  useEffect(() => {
    setWorkflow(workflow);
    return () => setWorkflow(null);
    // `workflow` is a fresh object every render by design (steps/currentStep are derived
    // from wizard state, not memoized) — re-registering on every render is intentional and
    // cheap here, not something to work around. setWorkflow itself never changes identity
    // (useState guarantee), so this effect never causes the caller to re-render itself.
  }, [workflow, setWorkflow]);
}