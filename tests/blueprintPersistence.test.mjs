import assert from "node:assert/strict";
import test from "node:test";

import { linkBlueprintToQuotation } from "../lib/server/blueprintPersistence.mjs";
import { resetBlueprintReview, rescanBlueprintReview } from "../features/quotation-generation/lib/blueprintReviewActions.mjs";

test("saved blueprint path is linked to the tenant quotation", async () => {
  const calls = [];
  const db = { query: async (...args) => calls.push(args) };

  const linked = await linkBlueprintToQuotation(db, "quotations/42/plan.pdf", 42, 7);

  assert.equal(linked, true);
  assert.match(calls[0][0], /blueprint_file_path = \$1/);
  assert.deepEqual(calls[0][1], ["quotations/42/plan.pdf", 42, 7]);
});

test("missing storage path leaves the quotation unchanged", async () => {
  const db = { query: async () => assert.fail("query should not run") };
  assert.equal(await linkBlueprintToQuotation(db, null, 42, 7), false);
});

test("reset restores the original result without invoking extraction", () => {
  let extractionCalls = 0;
  const original = [{ floor_level: "Original", segments: [1] }];
  const reset = resetBlueprintReview(original, (floors) => floors.flatMap((floor) => floor.segments));
  assert.equal(extractionCalls, 0);
  assert.equal(reset.floors, original);
  assert.deepEqual(reset.segments, [1]);
});

test("rescan invokes extraction and uses the new result", async () => {
  let extractionCalls = 0;
  const rescanned = await rescanBlueprintReview(
    async () => {
      extractionCalls += 1;
      return { floors: [{ floor_level: "New", segments: [2] }] };
    },
    (floors) => floors.flatMap((floor) => floor.segments),
  );
  assert.equal(extractionCalls, 1);
  assert.equal(rescanned.floors[0].floor_level, "New");
  assert.deepEqual(rescanned.segments, [2]);
});
