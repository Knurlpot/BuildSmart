import { NextRequest, NextResponse } from "next/server";
import { authContext, isAuthContext, withTransaction } from "../../pricing";
import { SITE_CONDITION_FIELDS, type ProjectSiteCondition } from "@/types/entities/site-condition-rule";

type Params = { params: Promise<{ quotationId: string }> };

type SegmentPayload = {
  segment_name: string;
  segment_type: string;
  source_method: "Manual" | "Blueprint" | "Hybrid";
  floor_level: string;
  shape_type: string | null;
  length: number;
  width: number;
  area_sqm: number;
  polygon_coords: string | null;
  confidence_score: number | null;
  included_in_quote: boolean;
  scope_of_work: string;
  work_type: string;
  notes: string | null;
  site_conditions?: ProjectSiteCondition[];
  site_condition_effect_decisions?: Record<string, boolean>;
};

type SaveSegmentsPayload = {
  segments?: SegmentPayload[];
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

const conditionFields = new Set(SITE_CONDITION_FIELDS.map((field) => field.key));

function validateSegment(segment: SegmentPayload, index: number): string | null {
  const label = `Segment ${index + 1}`;
  if (!segment.segment_name?.trim()) return `${label} needs a name.`;
  if (!segment.segment_type?.trim()) return `${label} needs a segment type.`;
  if (!["Manual", "Blueprint", "Hybrid"].includes(segment.source_method)) return `${label} has an invalid source method.`;
  if (!segment.floor_level?.trim()) return `${label} needs a floor level.`;
  if (!isFiniteNumber(segment.length) || segment.length < 0) return `${label} has an invalid length.`;
  if (!isFiniteNumber(segment.width) || segment.width < 0) return `${label} has an invalid width.`;
  if (!isFiniteNumber(segment.area_sqm) || segment.area_sqm < 0) return `${label} has an invalid area.`;
  if (segment.confidence_score !== null && (!isFiniteNumber(segment.confidence_score) || segment.confidence_score < 0 || segment.confidence_score > 100)) {
    return `${label} has an invalid confidence score.`;
  }
  if (typeof segment.included_in_quote !== "boolean") return `${label} has an invalid included flag.`;
  if (!segment.scope_of_work?.trim()) return `${label} needs a scope of work.`;
  if (!segment.work_type?.trim()) return `${label} needs a work type.`;
  if (!Array.isArray(segment.site_conditions ?? [])) return `${label} has invalid site conditions.`;
  const seenFields = new Set<string>();
  for (const condition of segment.site_conditions ?? []) {
    if (!conditionFields.has(condition.field) || !condition.value?.trim()) return `${label} has an invalid site condition.`;
    if (seenFields.has(condition.field)) return `${label} has a duplicate site condition.`;
    seenFields.add(condition.field);
  }
  if (segment.site_condition_effect_decisions && Object.values(segment.site_condition_effect_decisions).some((value) => typeof value !== "boolean")) {
    return `${label} has invalid site-condition review decisions.`;
  }
  return null;
}

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await authContext(request);
  if (!isAuthContext(auth)) return auth;

  const { quotationId } = await params;
  const quoteId = Number(quotationId);
  if (!Number.isInteger(quoteId)) return badRequest("Invalid quotation id.");

  const result = await withTransaction(async (client) => {
    const quote = await client.query(
      "SELECT quote_id FROM quotation WHERE quote_id = $1 AND company_id = $2 LIMIT 1",
      [quoteId, auth.companyId]
    );
    if (!quote.rows[0]) return null;

    const segments = await client.query(
      `SELECT segment_id, quote_id, segment_name, segment_type, source_method, floor_level,
              shape_type, length::float AS length, width::float AS width, area_sqm::float AS area_sqm,
              polygon_coords, confidence_score::float AS confidence_score, included_in_quote,
              scope_of_work, work_type, notes, status
       FROM project_segments
       WHERE quote_id = $1
       ORDER BY segment_id`,
      [quoteId]
    );
    const conditions = await client.query(
      `SELECT psc.segment_id, psc.condition_field, psc.condition_value
       FROM project_site_condition psc
       JOIN project_segments ps ON ps.segment_id = psc.segment_id
       WHERE ps.quote_id = $1 ORDER BY psc.project_site_condition_id`,
      [quoteId]
    );
    const reviews = await client.query(
      `SELECT pscr.segment_id, pscr.site_condition_rule_id, pscr.effect_key, pscr.included
       FROM project_site_condition_effect_review pscr
       JOIN project_segments ps ON ps.segment_id = pscr.segment_id
       WHERE ps.quote_id = $1`,
      [quoteId]
    );
    return segments.rows.map((segment) => ({
      ...segment,
      site_conditions: conditions.rows
        .filter((condition) => condition.segment_id === segment.segment_id)
        .map((condition) => ({ field: condition.condition_field, value: condition.condition_value })),
      site_condition_effect_decisions: Object.fromEntries(
        reviews.rows
          .filter((review) => review.segment_id === segment.segment_id)
          .map((review) => [`scr-${review.site_condition_rule_id}:${review.effect_key}`, Boolean(review.included)])
      ),
    }));
  });

  if (result === null) return NextResponse.json({ error: "Quotation not found." }, { status: 404 });
  return NextResponse.json({ segments: result });
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await authContext(request);
  if (!isAuthContext(auth)) return auth;

  const { quotationId } = await params;
  const quoteId = Number(quotationId);
  if (!Number.isInteger(quoteId)) return badRequest("Invalid quotation id.");

  const body = (await request.json().catch(() => null)) as SaveSegmentsPayload | null;
  if (!Array.isArray(body?.segments)) return badRequest("Segments are required.");
  if (body.segments.length === 0) return badRequest("At least one segment is required.");

  for (let index = 0; index < body.segments.length; index += 1) {
    const error = validateSegment(body.segments[index], index);
    if (error) return badRequest(error);
  }

  try {
    const savedCount = await withTransaction(async (client) => {
      const quote = await client.query(
        "SELECT quote_id FROM quotation WHERE quote_id = $1 AND company_id = $2 LIMIT 1",
        [quoteId, auth.companyId]
      );
      if (!quote.rows[0]) return null;

      await client.query("DELETE FROM project_segments WHERE quote_id = $1", [quoteId]);

      for (const segment of body.segments!) {
        const inserted = await client.query<{ segment_id: number }>(
          `INSERT INTO project_segments (
             quote_id, segment_name, segment_type, source_method, floor_level, shape_type,
             length, width, area_sqm, polygon_coords, confidence_score, included_in_quote,
             scope_of_work, work_type, notes, status
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'Active')
           RETURNING segment_id`,
          [
            quoteId,
            segment.segment_name.trim(),
            segment.segment_type.trim(),
            segment.source_method,
            segment.floor_level.trim(),
            segment.shape_type,
            segment.length,
            segment.width,
            segment.area_sqm,
            segment.polygon_coords,
            segment.confidence_score,
            segment.included_in_quote,
            segment.scope_of_work.trim(),
            segment.work_type.trim(),
            segment.notes?.trim() || null,
          ]
        );
        const segmentId = inserted.rows[0].segment_id;
        for (const condition of segment.site_conditions ?? []) {
          await client.query(
            `INSERT INTO project_site_condition (segment_id, condition_field, condition_value) VALUES ($1, $2, $3)`,
            [segmentId, condition.field, condition.value.trim()]
          );
        }
        for (const [reviewKey, included] of Object.entries(segment.site_condition_effect_decisions ?? {})) {
          const match = /^scr-(\d+):(.+)$/.exec(reviewKey);
          if (!match) continue;
          await client.query(
            `INSERT INTO project_site_condition_effect_review (segment_id, site_condition_rule_id, effect_key, included)
             SELECT $1, site_condition_rule_id, $3, $4 FROM site_condition_rule
             WHERE site_condition_rule_id = $2 AND company_id = $5`,
            [segmentId, Number(match[1]), match[2], included, auth.companyId]
          );
        }
      }

      await client.query("UPDATE quotation SET updated_by_user_id = $1, updated_at = CURRENT_TIMESTAMP WHERE quote_id = $2", [auth.userId, quoteId]);
      return body.segments!.length;
    });

    if (savedCount === null) return NextResponse.json({ error: "Quotation not found." }, { status: 404 });
    return NextResponse.json({ saved_count: savedCount });
  } catch (error) {
    console.error("Unable to save segments", error);
    return NextResponse.json({ error: "Unable to save segments." }, { status: 500 });
  }
}
