"use client";

import { useState, type ComponentType } from "react";
import { Check, RectangleHorizontal, Ruler, Shapes, Square, X } from "lucide-react";
import {
  computeAreaFromDimensions,
  computeAreaFromLShape,
  SEGMENT_ENTRY_MODE_LABEL,
  type DraftSegment,
  type SegmentEntryMode,
} from "../lib/draftSegment";

// Part D — darker, larger, higher-contrast than the shared SegmentEditorList's compact
// styling (that one stays as-is for blueprint validation's denser review table). This
// screen is a different audience/context: an estimator on a laptop in a site office,
// typically 40-60, not design-savvy — labels are dark, inputs are big.
const qLabelCls = "text-sm font-bold text-gray-800";
const qHintCls = "text-sm font-normal normal-case text-gray-500";
const qInputCls =
  "w-full rounded-xl border-2 border-gray-300 bg-white px-4 py-3 text-lg font-semibold text-gray-900 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15";
const qTextInputCls =
  "w-full rounded-xl border-2 border-gray-300 bg-white px-4 py-3 text-base font-medium text-gray-900 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15";

const MODES: { mode: SegmentEntryMode; icon: ComponentType<{ className?: string }> }[] = [
  { mode: "total_sqm", icon: Square },
  { mode: "dimensions", icon: RectangleHorizontal },
  { mode: "l_shape", icon: Shapes },
  { mode: "running_meter", icon: Ruler },
];

interface QuickSegmentEditorProps {
  draft: DraftSegment;
  onSave: (next: DraftSegment) => void;
  onCancel: () => void;
}

// Part B — one mode, one set of fields, at a time. Starts on Total sqm (the common case for
// a single validated area) with everything else tucked behind "Measure it differently";
// choosing another mode SWAPS the visible fields rather than stacking a second panel next
// to the first. Never four live input panels at once (see the task's guardrail).
export function QuickSegmentEditor({ draft, onSave, onCancel }: QuickSegmentEditorProps) {
  const [name, setName] = useState(draft.segment_name);
  const [floor, setFloor] = useState(draft.floor_level);
  const [entryMode, setEntryMode] = useState<SegmentEntryMode>(draft.entry_mode);
  // A segment already saved in a non-default mode shows its fields right away — no reason
  // to re-hide them behind the "measure differently" affordance when editing it back.
  const [modeChooserOpen, setModeChooserOpen] = useState(draft.entry_mode !== "total_sqm");
  const [touched, setTouched] = useState(false);

  const [totalSqm, setTotalSqm] = useState<number | "">(
    draft.entry_mode === "total_sqm" && draft.area_sqm > 0 ? draft.area_sqm : ""
  );
  const [length, setLength] = useState<number | "">(draft.length ?? "");
  const [width, setWidth] = useState<number | "">(draft.width ?? "");
  const [overallLength, setOverallLength] = useState<number | "">(draft.overall_length ?? "");
  const [overallWidth, setOverallWidth] = useState<number | "">(draft.overall_width ?? "");
  const [notchLength, setNotchLength] = useState<number | "">(draft.notch_length ?? "");
  const [notchWidth, setNotchWidth] = useState<number | "">(draft.notch_width ?? "");
  const [runningLength, setRunningLength] = useState<number | "">(
    draft.entry_mode === "running_meter" && draft.length ? draft.length : ""
  );

  const nameValid = name.trim().length > 0;

  const dimsValid = length !== "" && width !== "" && Number(length) > 0 && Number(width) > 0;
  const lShapeValid = overallLength !== "" && overallWidth !== "" && Number(overallLength) > 0 && Number(overallWidth) > 0;
  const runningValid = runningLength !== "" && Number(runningLength) > 0;
  const totalValid = totalSqm !== "" && Number(totalSqm) > 0;

  const areaValid =
    entryMode === "total_sqm"
      ? totalValid
      : entryMode === "dimensions"
        ? dimsValid
        : entryMode === "l_shape"
          ? lShapeValid
          : runningValid;

  const formValid = nameValid && areaValid;

  const computedArea =
    entryMode === "dimensions"
      ? dimsValid
        ? computeAreaFromDimensions(Number(length), Number(width))
        : null
      : entryMode === "l_shape"
        ? lShapeValid
          ? computeAreaFromLShape(Number(overallLength), Number(overallWidth), Number(notchLength) || 0, Number(notchWidth) || 0)
          : null
        : entryMode === "running_meter"
          ? runningValid
            ? Math.round(Number(runningLength) * 100) / 100
            : null
          : totalValid
            ? Number(totalSqm)
            : null;

  const handleSave = () => {
    setTouched(true);
    if (!formValid) return;
    const area = computedArea ?? 0;
    onSave({
      ...draft,
      segment_name: name.trim(),
      floor_level: floor,
      entry_mode: entryMode,
      length: entryMode === "dimensions" ? Number(length) : entryMode === "running_meter" ? Number(runningLength) : null,
      width: entryMode === "dimensions" ? Number(width) : null,
      overall_length: entryMode === "l_shape" ? Number(overallLength) : null,
      overall_width: entryMode === "l_shape" ? Number(overallWidth) : null,
      notch_length: entryMode === "l_shape" ? Number(notchLength) || 0 : null,
      notch_width: entryMode === "l_shape" ? Number(notchWidth) || 0 : null,
      area_sqm: area,
    });
  };

  return (
    <div className="flex flex-col gap-4 rounded-2xl border-2 border-gray-200 bg-gray-50/70 p-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className={qLabelCls}>
            Segment Name <span className="text-red-500">*</span>
          </label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Living Room" className={qTextInputCls} autoFocus />
          {touched && !nameValid && <p className="text-sm font-semibold text-red-600">Required.</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={qLabelCls}>
            Floor Level <span className={qHintCls}>(optional)</span>
          </label>
          <input value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="e.g. Ground Floor" className={qTextInputCls} />
        </div>
      </div>

      {!modeChooserOpen ? (
        <>
          <div className="flex flex-col gap-1.5">
            <label className={qLabelCls}>
              Total Area <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                min={0}
                step="0.01"
                value={totalSqm}
                onChange={(e) => setTotalSqm(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="0.00"
                className={`${qInputCls} pr-16`}
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-base font-semibold text-gray-400">
                sqm
              </span>
            </div>
            {touched && !totalValid && <p className="text-sm font-semibold text-red-600">Enter the total area.</p>}
          </div>
          <button
            type="button"
            onClick={() => setModeChooserOpen(true)}
            className="w-fit text-sm font-bold text-primary underline-offset-2 hover:underline"
          >
            Measure it differently →
          </button>
        </>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className={qLabelCls}>How was this measured?</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {MODES.map(({ mode, icon: Icon }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setEntryMode(mode)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-3 text-sm font-bold transition ${
                    entryMode === mode
                      ? "border-primary bg-orange-50 text-primary"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {SEGMENT_ENTRY_MODE_LABEL[mode]}
                </button>
              ))}
            </div>
          </div>

          {/* One mode's fields at a time — switching the mode above swaps this block, it
              never stacks a second block alongside it. */}
          {entryMode === "total_sqm" && (
            <div className="flex flex-col gap-1.5">
              <label className={qLabelCls}>
                Total Area <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={totalSqm}
                  onChange={(e) => setTotalSqm(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="0.00"
                  className={`${qInputCls} pr-16`}
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-base font-semibold text-gray-400">
                  sqm
                </span>
              </div>
              {touched && !totalValid && <p className="text-sm font-semibold text-red-600">Enter the total area.</p>}
            </div>
          )}

          {entryMode === "dimensions" && (
            <div className="flex flex-col gap-1.5">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className={qLabelCls}>Length (m)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={length}
                    onChange={(e) => setLength(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="0.00"
                    className={qInputCls}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={qLabelCls}>Width (m)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={width}
                    onChange={(e) => setWidth(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="0.00"
                    className={qInputCls}
                  />
                </div>
              </div>
              {computedArea !== null && (
                <p className="text-base font-bold text-gray-700">Calculated Area: {computedArea.toFixed(2)} sqm</p>
              )}
              {touched && !dimsValid && <p className="text-sm font-semibold text-red-600">Enter both length and width.</p>}
            </div>
          )}

          {entryMode === "l_shape" && (
            <div className="flex flex-col gap-1.5">
              <p className={qHintCls}>Overall rectangle, minus the notch that&apos;s cut out of it.</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className={qLabelCls}>Overall Length (m)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={overallLength}
                    onChange={(e) => setOverallLength(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="0.00"
                    className={qInputCls}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={qLabelCls}>Overall Width (m)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={overallWidth}
                    onChange={(e) => setOverallWidth(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="0.00"
                    className={qInputCls}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={qLabelCls}>
                    Notch Length (m) <span className={qHintCls}>(optional)</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={notchLength}
                    onChange={(e) => setNotchLength(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="0.00"
                    className={qInputCls}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={qLabelCls}>
                    Notch Width (m) <span className={qHintCls}>(optional)</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={notchWidth}
                    onChange={(e) => setNotchWidth(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="0.00"
                    className={qInputCls}
                  />
                </div>
              </div>
              {computedArea !== null && (
                <p className="text-base font-bold text-gray-700">Calculated Area: {computedArea.toFixed(2)} sqm</p>
              )}
              {touched && !lShapeValid && <p className="text-sm font-semibold text-red-600">Enter the overall length and width.</p>}
            </div>
          )}

          {entryMode === "running_meter" && (
            <div className="flex flex-col gap-1.5">
              <label className={qLabelCls}>
                Length (m) <span className={qHintCls}>— parapets, edges, linear runs</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={runningLength}
                  onChange={(e) => setRunningLength(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="0.00"
                  className={`${qInputCls} pr-14`}
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-base font-semibold text-gray-400">
                  m
                </span>
              </div>
              <p className={qHintCls}>Counted directly into the running total below — no area conversion.</p>
              {touched && !runningValid && <p className="text-sm font-semibold text-red-600">Enter the length.</p>}
            </div>
          )}

          <button
            type="button"
            onClick={() => setModeChooserOpen(false)}
            className="w-fit text-sm font-bold text-gray-500 underline-offset-2 hover:underline"
          >
            ← Back to Total sqm
          </button>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          className="flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition hover:bg-(--primary-hover)"
        >
          <Check className="h-4 w-4" /> Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 rounded-xl border-2 border-gray-300 bg-white px-5 py-2.5 text-sm font-bold text-gray-600 transition hover:bg-gray-50"
        >
          <X className="h-4 w-4" /> Cancel
        </button>
      </div>
    </div>
  );
}
