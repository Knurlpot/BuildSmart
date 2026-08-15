export function resetBlueprintReview(originalFloors, buildSegments) {
  return { floors: originalFloors, segments: buildSegments(originalFloors) };
}

export async function rescanBlueprintReview(runRescan, buildSegments) {
  const result = await runRescan();
  return { result, floors: result.floors, segments: buildSegments(result.floors) };
}
