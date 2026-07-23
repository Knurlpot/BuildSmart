"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

// Generic over the field union so this same component serves two different
// mapping vocabularies: the manual upload wizard's ~20 item/supplier fields
// (usePricelistUpload's SystemField) and the AI Normalization panel's 3-field
// raw_name/raw_unit/raw_price recovery flow (usePricelistNormalization).
export interface DetectedColumn<F extends string = string> {
  raw_column: string;
  mapped_field: F | null;
  /** Which uploaded file(s) this raw column was seen in — for display only. */
  source_files: string[];
}

export interface MappingSection<F extends string> {
  title: string;
  requiredFields: F[];
  optionalFields: F[];
  emptyHint?: string;
}

interface ColumnMappingStepProps<F extends string> {
  title?: string;
  description: string;
  columns: DetectedColumn<F>[];
  sections: MappingSection<F>[];
  fieldLabels: Record<F, string>;
  onUpdateMapping: (rawColumn: string, mappedField: F | null) => void;
  onBack: () => void;
  onContinue: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
}

function FieldRow<F extends string>({
  field,
  required,
  columns,
  fieldLabels,
  onUpdateMapping,
}: {
  field: F;
  required: boolean;
  columns: DetectedColumn<F>[];
  fieldLabels: Record<F, string>;
  onUpdateMapping: (rawColumn: string, mappedField: F | null) => void;
}) {
  // A field may be mapped from at most one detected column — find which one (if any).
  const mappedColumn = columns.find((c) => c.mapped_field === field);

  const handleChange = (rawColumn: string) => {
    // Clear this field off whatever column previously held it, then assign it to the new one.
    if (mappedColumn && mappedColumn.raw_column !== rawColumn) {
      onUpdateMapping(mappedColumn.raw_column, null);
    }
    if (rawColumn === "") return;
    onUpdateMapping(rawColumn, field);
  };

  return (
    <div className="flex items-center gap-4 px-4 py-2.5">
      <span className="flex w-44 shrink-0 items-center gap-1.5 text-sm font-semibold text-gray-700">
        {fieldLabels[field]}
        {required ? (
          <span className="text-red-500">*</span>
        ) : (
          <span className="text-[10px] font-medium text-gray-400">(optional)</span>
        )}
      </span>
      <select
        value={mappedColumn?.raw_column ?? ""}
        onChange={(e) => handleChange(e.target.value)}
        className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
      >
        <option value="">— Skip this column —</option>
        {columns.map((c) => (
          <option key={c.raw_column} value={c.raw_column} disabled={c.mapped_field !== null && c.mapped_field !== field}>
            {c.raw_column}
            {c.mapped_field !== null && c.mapped_field !== field ? ` (used for ${fieldLabels[c.mapped_field]})` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

function Section<F extends string>({
  section,
  columns,
  fieldLabels,
  onUpdateMapping,
}: {
  section: MappingSection<F>;
  columns: DetectedColumn<F>[];
  fieldLabels: Record<F, string>;
  onUpdateMapping: (rawColumn: string, mappedField: F | null) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400">{section.title}</p>
      </div>
      {columns.length === 0 && section.emptyHint ? (
        <p className="px-4 py-6 text-center text-xs text-gray-400">{section.emptyHint}</p>
      ) : (
        <div className="flex flex-col divide-y divide-gray-100">
          {section.requiredFields.map((f) => (
            <FieldRow key={f} field={f} required columns={columns} fieldLabels={fieldLabels} onUpdateMapping={onUpdateMapping} />
          ))}
          {section.optionalFields.map((f) => (
            <FieldRow key={f} field={f} required={false} columns={columns} fieldLabels={fieldLabels} onUpdateMapping={onUpdateMapping} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ColumnMappingStep<F extends string>({
  title = "Review & Detect",
  description,
  columns,
  sections,
  fieldLabels,
  onUpdateMapping,
  onBack,
  onContinue,
  continueLabel = "Map & Confirm",
  continueDisabled = false,
}: ColumnMappingStepProps<F>) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <button
            type="button"
            onClick={onContinue}
            disabled={continueDisabled}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition hover:bg-(--primary-hover) disabled:cursor-not-allowed disabled:opacity-50"
          >
            {continueLabel} <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex max-h-140 flex-col gap-5 overflow-y-auto pr-1">
        {sections.map((section) => (
          <Section key={section.title} section={section} columns={columns} fieldLabels={fieldLabels} onUpdateMapping={onUpdateMapping} />
        ))}
      </div>
    </div>
  );
}
