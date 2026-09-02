# Site Conditions: Current Setup and Recommendation

## Purpose

Site Conditions describe real project conditions that can affect the quotation. These conditions help the estimator account for risk, additional preparation work, material suitability, labor effort, timeline delays, and contingency.

For BuildSmart, Site Conditions should not only be notes. They should eventually help the system explain why a quotation changed and why a specific material, labor allowance, or contingency was applied.

## Current Setup

In the current quotation generation flow, Site Conditions are configured per segment.

A segment can represent a room, area, floor section, or detected blueprint space. Because of that, each segment can have its own conditions.

Current condition tags include:

- Heavy-Rain Exposure
- High Foot Traffic
- Crack-prone Surface
- Moisture Prone Area

Each segment also has optional site notes.

Current behavior:

- The user selects Site Condition tags during segment configuration.
- The user can add free-text site notes for the segment.
- Site notes are saved into `project_segments.notes`.
- Condition tags currently exist mainly in frontend draft state.
- The quotation logic can use condition tags during generation to adjust contingency.
- Rush job is handled separately through labor uplift.

## Why Segment-Level Conditions Make Sense

Segment-level Site Conditions are useful because different rooms or areas can have different construction risks.

Example:

- Bathroom: Moisture Prone Area
- Roof deck: Heavy-Rain Exposure
- Lobby: High Foot Traffic
- Old wall area: Crack-prone Surface

If Site Conditions were only applied at the whole-project level, the system might overprice or misprice unaffected rooms. A bathroom condition should not automatically affect a bedroom, and a roof deck condition should not automatically affect an interior hallway.

## Current Limitation

The current setup is not yet fully connected to the backend.

The main limitation is that condition tags are not fully persisted as structured records. The database already has a `segment_tag` concept, but the quotation save flow needs to consistently write each condition tag to that table and reload it later.

Because of this, the current implementation is useful during active quotation generation, but it is not yet ideal for long-term reporting, recalculation, auditing, or finalized quotation history.

## Recommended Setup

The recommended model is to separate Site Conditions into two levels:

1. Project-Level Conditions
2. Segment-Level Conditions

This matches real construction workflow better because some conditions affect the entire project, while others only affect specific rooms or work areas.

## Project-Level Conditions

Project-level conditions should apply to the whole quotation.

Recommended examples:

- Occupied building
- Limited site access
- Remote location
- Night work or restricted working hours
- Tight schedule
- Permit or inspection constraints
- Difficult mobilization

Recommended quotation effects:

- Increase mobilization or other service cost
- Increase general labor allowance
- Increase project contingency
- Add timeline buffer
- Flag the quotation for estimator review

## Segment-Level Conditions

Segment-level conditions should apply only to a specific room, area, or blueprint segment.

Recommended examples:

- Moisture Prone Area
- Heavy-Rain Exposure
- High Foot Traffic
- Crack-prone Surface
- Uneven substrate
- Existing damage
- Poor ventilation
- Exterior exposure

Recommended quotation effects:

- Adjust material selection
- Increase wastage allowance
- Add surface preparation labor
- Add curing or drying time
- Increase segment-level contingency
- Recommend a higher treatment tier

## Recommended Condition Effects

### Moisture Prone Area

Possible effect on quotation:

- Recommend waterproofing materials
- Add primer, membrane, sealant, or moisture barrier
- Increase labor due to surface preparation
- Add curing or drying time
- Increase contingency for affected segment

Example:

A bathroom segment should include moisture-related treatment, while a dry bedroom wall should not.

### Crack-prone Surface

Possible effect on quotation:

- Add crack repair materials
- Add patching compound, mesh, sealant, or filler
- Increase labor for surface preparation
- Increase wastage allowance
- Flag for manual estimator review

Example:

An old wall with visible cracks may need repair before coating or tiling can proceed.

### Heavy-Rain Exposure

Possible effect on quotation:

- Recommend exterior-grade or weather-resistant materials
- Add waterproofing or protective coating
- Add curing buffer to the timeline
- Increase contingency due to weather risk

Example:

A roof deck or exterior balcony may need stronger waterproofing than an interior floor.

### High Foot Traffic

Possible effect on quotation:

- Recommend more durable finish materials
- Suggest premium coating, tile, adhesive, or grout
- Increase material grade
- Increase maintenance or warranty consideration

Example:

A lobby floor may require more durable materials than a private room.

## Recommended System Logic

The system should process Site Conditions using a rule-based approach.

Recommended flow:

1. User configures project-level conditions.
2. User configures segment-level conditions.
3. System checks each segment condition against material rules, labor rules, unit rules, and pricing strategy.
4. System applies condition-based adjustments only to affected segments.
5. System displays the reason in the detailed quotation breakdown.
6. System saves the condition tags and notes for audit/history.

## Recommended Database Connection

To fully connect Site Conditions to the system, condition tags should be persisted as structured segment records.

Recommended backend behavior:

- Save each selected segment condition into `segment_tag`.
- Use `tag_type = 'Condition'`.
- Link each tag to the correct `project_segments.segment_id`.
- Continue saving free-text notes into `project_segments.notes`.
- Reload saved condition tags when reopening a quotation or project.

This allows the system to preserve the exact conditions used when the quotation was created.

## Recommended Pricing Connection

Site Conditions should affect quotation through clear, explainable adjustments.

Recommended pricing effects:

- Material rules: choose condition-appropriate materials.
- Unit rules: adjust coverage or wastage.
- Labor rules: add prep labor or productivity adjustment.
- Pricing strategy: add contingency for risk.
- Timeline: add curing, drying, or access buffer.

The system should always show why an adjustment was applied.

Example breakdown text:

> Moisture Prone Area increased contingency and recommended waterproofing materials for this segment.

## Recommended UI Improvements

Recommended UI structure:

- Add a Project Conditions section near project details.
- Keep Segment Conditions inside each segment configuration card.
- Show selected conditions in the Detailed Breakdown.
- Add a small explanation beside each condition-driven adjustment.
- Add warning badges when a condition requires estimator review.

## Best Recommendation

Do not remove segment-level Site Conditions.

Instead, improve the system by adding project-level conditions on top of the existing segment-level conditions.

Best final structure:

- Project Conditions affect the entire quote.
- Segment Conditions affect only the specific room or area.
- Notes explain the estimator's reasoning.
- Condition tags are saved and shown in the quotation breakdown.
- Pricing adjustments are transparent and rule-based.

This makes Site Conditions more realistic, more accurate, and easier to defend during quotation review.
