"use client";

import { Ruler, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface InputMethodChoiceProps {
  onChoose: (method: "quick" | "blueprint") => void;
  onBack: () => void;
}

// Part B — an OVERLAY wizard step, not a separate page/route: Client & Project stays the
// page underneath (dimmed/blurred via the Dialog's own overlay), this is a smaller panel
// on top of it. Closing it (X, Escape, clicking outside, or the explicit Back link below)
// all go through the same onBack — there's no separate "cancel" meaning here, just "go
// back to Client & Project," matching Part H's back-navigation audit.
export function InputMethodChoice({ onChoose, onBack }: InputMethodChoiceProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && onBack()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>How do you want to add areas?</DialogTitle>
          <DialogDescription>Both paths produce validated, configured segments.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onChoose("quick")}
            className="flex flex-col items-start gap-3 rounded-2xl border-2 border-gray-200 bg-white p-5 text-left transition hover:border-primary hover:bg-orange-50/20"
          >
            <div className="flex w-full items-start justify-between gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-primary">
                <Ruler className="h-5 w-5" />
              </div>
              {/* Path-aware step count, known BEFORE committing (matches
                  features/quotation-generation/lib/workflowSteps.ts's
                  QUICK_MEASUREMENT_STEPS length) — so the shorter/longer path isn't a
                  surprise mid-flow. */}
              <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                2 steps
              </span>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Quick Measurement</p>
              <p className="text-xs text-gray-500">
                Enter areas you already measured on-site.
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => onChoose("blueprint")}
            className="flex flex-col items-start gap-3 rounded-2xl border-2 border-gray-200 bg-white p-5 text-left transition hover:border-primary hover:bg-orange-50/20"
          >
            <div className="flex w-full items-start justify-between gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-primary">
                <Upload className="h-5 w-5" />
              </div>
              {/* Part C — matches UPLOAD_BLUEPRINT_STEPS.length in workflowSteps.ts (Upload
                  Blueprint, Review Segments) + Configure Segments. */}
              <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                3 steps
              </span>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Upload Blueprint</p>
              <p className="text-xs text-gray-500">
                Upload a file, then review and validate the areas we detect for you.
              </p>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
