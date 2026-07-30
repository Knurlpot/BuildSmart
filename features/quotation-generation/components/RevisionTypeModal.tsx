"use client";

import { AlertTriangle, ArrowRight, Edit3, Layers, Settings2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface RevisionTypeModalProps {
  onClose: () => void;
  onStructural: () => void;
  onMinor: () => void;
}

// P2-D — "Needs revision?" -> "Type of revision?" from the activity diagram. Structural
// literally means "Return to segmentation" (the diagram's own label) — back to
// Blueprint/Quick review, discarding nothing but requiring re-confirmation since segments
// may change. Minor stays on this screen and opens MinorRevisionPanel instead.
export function RevisionTypeModal({ onClose, onStructural, onMinor }: RevisionTypeModalProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Validate &amp; Edit Quotation</DialogTitle>
          <DialogDescription>Choose the type of revision you need to make.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={onStructural}
            className="group flex flex-col rounded-2xl border-2 border-red-100 bg-red-50 p-5 text-left transition-all hover:border-red-300 hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 group-hover:bg-red-200">
                <Layers className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-red-600">Structural</p>
                <p className="text-sm font-bold text-gray-900">Major Revision</p>
              </div>
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-100/60 p-2.5 text-xs text-red-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>This returns you to segmentation — rooms/areas can be re-confirmed, excluded, or added.</p>
            </div>
            <p className="mt-3 text-xs text-gray-600">
              Use when the scope has fundamentally changed — rooms added or removed, floor corrections, or area
              reclassifications.
            </p>
            <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-red-600 transition-all group-hover:gap-2.5">
              Return to Segmentation <ArrowRight className="h-3.5 w-3.5" />
            </div>
          </button>

          <button
            type="button"
            onClick={onMinor}
            className="group flex flex-col rounded-2xl border-2 border-primary/20 bg-orange-50/40 p-5 text-left transition-all hover:border-primary/50 hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 group-hover:bg-primary/25">
                <Edit3 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Minor</p>
                <p className="text-sm font-bold text-gray-900">Minor Revision</p>
              </div>
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-primary/10 p-2.5 text-xs text-primary">
              <Settings2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>Fine-tune line items without restarting the process.</p>
            </div>
            <p className="mt-3 text-xs text-gray-600">
              Use when the scope is correct but you want to adjust quantities, unit prices, or which rate reference
              a line uses.
            </p>
            <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-primary transition-all group-hover:gap-2.5">
              Open Minor Revision <ArrowRight className="h-3.5 w-3.5" />
            </div>
          </button>
        </div>

        <p className="text-center text-[11px] text-gray-400">
          You can always return to this quotation after revisions are saved.
        </p>
      </DialogContent>
    </Dialog>
  );
}