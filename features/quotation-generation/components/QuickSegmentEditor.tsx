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

//
const qLabelCls = "text-sm font-bold text-gray-800";
const qHintCls = "text-sm font-normal normal-case text-gray-500";
const qInputCls =
  "peer w-full rounded-lg border border-gray-200 bg-gray-50 px-3 pb-2 pt-5 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20";

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

//
  export function QuickSegmentEditor({ draft, onSave, onCancel }: QuickSegmentEditorProps) {
  const [name, setName] = useState(draft.segment_name);
  const [floor, setFloor] = useState(draft.floor_level);
  const [entryMode, setEntryMode] = useState<SegmentEntryMode>(draft.entry_mode);
  
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
          <div className="relative">
            <input
              id="segment-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder=" "
              className={qInputCls}
              autoFocus
            />
            <label
              htmlFor="segment-name"
              className="pointer-events-none absolute left-3 top-1.5 text-[10px] font-semibold text-gray-500 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:font-medium peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-[10px] peer-focus:font-semibold peer-focus:text-primary"
            >
              Segment Name <span className="text-red-500">*</span>
            </label>
          </div>
          {touched && !nameValid && <p className="text-sm font-semibold text-red-600">Required.</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="relative">
            <input id="segment-floor-level" value={floor} onChange={(e) => setFloor(e.target.value)} placeholder=" " className={qInputCls} />
            <label
              htmlFor="segment-floor-level"
              className="pointer-events-none absolute left-3 top-1.5 text-[10px] font-semibold text-gray-500 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:font-medium peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-[10px] peer-focus:font-semibold peer-focus:text-primary"
            >
              Floor Level <span className="font-normal normal-case text-gray-400">(optional)</span>
            </label>
          </div>
        </div>
      </div>

      {!modeChooserOpen ? (
        <>
          <div className="flex flex-col gap-1.5">
            <div className="relative">
              <input
                id="segment-total-area"
                type="text"
                inputMode="decimal"
                value={totalSqm}
                onChange={(e) => {
                  const next = e.target.value.replace(/[^\d.]/g, "");
                  setTotalSqm(next === "" ? "" : Number(next));
                }}
                placeholder=" "
                className={`${qInputCls} pr-16`}
              />
              <label
                htmlFor="segment-total-area"
                className="pointer-events-none absolute left-3 top-1.5 text-[10px] font-semibold text-gray-500 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:font-medium peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-[10px] peer-focus:font-semibold peer-focus:text-primary"
              >
                Total Area <span className="text-red-500">*</span>
              </label>
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
              <div className="relative">
                <input
                  id="alternate-total-area"
                  type="text"
                  inputMode="decimal"
                  value={totalSqm}
                  onChange={(e) => {
                    const next = e.target.value.replace(/[^\d.]/g, "");
                    setTotalSqm(next === "" ? "" : Number(next));
                  }}
                  placeholder=" "
                  className={`${qInputCls} pr-16`}
                />
                <label
                  htmlFor="alternate-total-area"
                  className="pointer-events-none absolute left-3 top-1.5 text-[10px] font-semibold text-gray-500 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:font-medium peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-[10px] peer-focus:font-semibold peer-focus:text-primary"
                >
                  Total Area <span className="text-red-500">*</span>
                </label>
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
                  <div className="relative">
                    <input id="segment-length" type="text" inputMode="decimal" value={length} onChange={(e) => setLength(e.target.value.replace(/[^\d.]/g, "") === "" ? "" : Number(e.target.value.replace(/[^\d.]/g, "")))} placeholder=" " className={qInputCls} />
                    <label htmlFor="segment-length" className="pointer-events-none absolute left-3 top-1.5 text-[10px] font-semibold text-gray-500 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:font-medium peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-[10px] peer-focus:font-semibold peer-focus:text-primary">Length (m)</label>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="relative">
                    <input id="segment-width" type="text" inputMode="decimal" value={width} onChange={(e) => setWidth(e.target.value.replace(/[^\d.]/g, "") === "" ? "" : Number(e.target.value.replace(/[^\d.]/g, "")))} placeholder=" " className={qInputCls} />
                    <label htmlFor="segment-width" className="pointer-events-none absolute left-3 top-1.5 text-[10px] font-semibold text-gray-500 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:font-medium peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-[10px] peer-focus:font-semibold peer-focus:text-primary">Width (m)</label>
                  </div>
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
              <p className={qHintCls}>Overall rectangle, minus the notch that&apos;s cut out.</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <div className="relative">
                    <input
                      id="segment-overall-length"
                      type="text"
                      inputMode="decimal"
                      value={overallLength}
                      onChange={(e) => {
                        const next = e.target.value.replace(/[^\d.]/g, "");
                        setOverallLength(next === "" ? "" : Number(next));
                      }}
                      placeholder=" "
                      className={qInputCls}
                    />
                    <label htmlFor="segment-overall-length" className="pointer-events-none absolute left-3 top-1.5 text-[10px] font-semibold text-gray-500 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:font-medium peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-[10px] peer-focus:font-semibold peer-focus:text-primary">Overall Length (m)</label>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="relative">
                    <input
                      id="segment-overall-width"
                      type="text"
                      inputMode="decimal"
                      value={overallWidth}
                      onChange={(e) => {
                        const next = e.target.value.replace(/[^\d.]/g, "");
                        setOverallWidth(next === "" ? "" : Number(next));
                      }}
                      placeholder=" "
                      className={qInputCls}
                    />
                    <label htmlFor="segment-overall-width" className="pointer-events-none absolute left-3 top-1.5 text-[10px] font-semibold text-gray-500 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:font-medium peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-[10px] peer-focus:font-semibold peer-focus:text-primary">Overall Width (m)</label>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="relative">
                    <input
                      id="segment-notch-length"
                      type="text"
                      inputMode="decimal"
                      value={notchLength}
                      onChange={(e) => {
                        const next = e.target.value.replace(/[^\d.]/g, "");
                        setNotchLength(next === "" ? "" : Number(next));
                      }}
                      placeholder=" "
                      className={qInputCls}
                    />
                    <label htmlFor="segment-notch-length" className="pointer-events-none absolute left-3 top-1.5 text-[10px] font-semibold text-gray-500 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:font-medium peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-[10px] peer-focus:font-semibold peer-focus:text-primary">Notch Length (m) <span className="font-normal normal-case text-gray-400">(optional)</span></label>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="relative">
                    <input
                      id="segment-notch-width"
                      type="text"
                      inputMode="decimal"
                      value={notchWidth}
                      onChange={(e) => {
                        const next = e.target.value.replace(/[^\d.]/g, "");
                        setNotchWidth(next === "" ? "" : Number(next));
                      }}
                      placeholder=" "
                      className={qInputCls}
                    />
                    <label htmlFor="segment-notch-width" className="pointer-events-none absolute left-3 top-1.5 text-[10px] font-semibold text-gray-500 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:font-medium peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-[10px] peer-focus:font-semibold peer-focus:text-primary">Notch Width (m) <span className="font-normal normal-case text-gray-400">(optional)</span></label>
                  </div>
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
              <div className="relative">
                <input
                  id="segment-running-length"
                  type="text"
                  inputMode="decimal"
                  value={runningLength}
                  onChange={(e) => {
                    const next = e.target.value.replace(/[^\d.]/g, "");
                    setRunningLength(next === "" ? "" : Number(next));
                  }}
                  placeholder=" "
                  className={`${qInputCls} pr-14`}
                />
                <label
                  htmlFor="segment-running-length"
                  className="pointer-events-none absolute left-3 top-1.5 text-[10px] font-semibold text-gray-500 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:font-medium peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-[10px] peer-focus:font-semibold peer-focus:text-primary"
                >
                  Length (m) <span className="font-normal normal-case text-gray-400">(parapets, edges, linear runs)</span>
                </label>
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-base font-semibold text-gray-400">
                  m
                </span>
              </div>
              <p className={qHintCls}>Added directly to the total without area conversion.</p>
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
