export type SegmentTagType = 'Preference' | 'Condition';

// CHECK-constrained enum, tag_type = 'Preference'. No UI in Quotation Generation Part 1
// consumes this yet — only Condition tags are collected (see the task's Step 3) — kept
// here so the two enums stay next to the real CHECK constraint they mirror.
export const SEGMENT_PREFERENCE_TAGS = [
  'Durability',
  'Cost Efficiency',
  'Aesthetic Finish',
  'Low-Maintenance',
  'Eco-Friendly',
] as const;
export type SegmentPreferenceTag = (typeof SEGMENT_PREFERENCE_TAGS)[number];

// CHECK-constrained enum, tag_type = 'Condition' — the site condition tags Quotation
// Generation's Step 3 collects per segment.
export const SEGMENT_CONDITION_TAGS = [
  'Heavy-Rain Exposure',
  'High Foot Traffic',
  'Crack-prone Surface',
  'Moisture Prone Area',
] as const;
export type SegmentConditionTag = (typeof SEGMENT_CONDITION_TAGS)[number];

export interface SegmentTag {
  tag_id: number;
  segment_id: number;
  tag_type: SegmentTagType;
  tag_value: SegmentPreferenceTag | SegmentConditionTag;
}