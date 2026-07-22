"use client";

import { Ruler, Upload } from "lucide-react";

interface InputMethodChoiceProps {
  onChoose: (method: "quick" | "blueprint") => void;
}

export function InputMethodChoice({ onChoose }: InputMethodChoiceProps) {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">How do you want to add areas?</h2>
        <p className="text-xs text-gray-500">Both paths end up in the same place — validated, configured segments.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onChoose("quick")}
          className="flex flex-col items-start gap-3 rounded-2xl border-2 border-gray-200 bg-white p-5 text-left transition hover:border-primary hover:bg-orange-50/20"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-primary">
            <Ruler className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">Quick Measurement</p>
            <p className="text-xs text-gray-500">Fast and simple — enter the areas you measured on-site.</p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => onChoose("blueprint")}
          className="flex flex-col items-start gap-3 rounded-2xl border-2 border-gray-200 bg-white p-5 text-left transition hover:border-primary hover:bg-orange-50/20"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-primary">
            <Upload className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">Upload Blueprint</p>
            <p className="text-xs text-gray-500">Extract and validate segments from a PDF, DWG, or DXF file.</p>
          </div>
        </button>
      </div>
    </div>
  );
}