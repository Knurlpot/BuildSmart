export async function linkBlueprintToQuotation(db, blueprintPath, quoteId, companyId) {
  if (!blueprintPath) return false;
  await db.query(
    "UPDATE quotation SET blueprint_file_path = $1, updated_at = CURRENT_TIMESTAMP WHERE quote_id = $2 AND company_id = $3",
    [blueprintPath, quoteId, companyId],
  );
  return true;
}
