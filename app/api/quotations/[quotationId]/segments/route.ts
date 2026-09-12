import { NextRequest, NextResponse } from "next/server";
import { authContext, isAuthContext, withTransaction } from "../../pricing";
import type { ProjectAdjustment } from "@/types/entities/segment-tag";

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
  project_adjustments: ProjectAdjustment[];
};

type SaveSegmentsPayload = {
  segments?: SegmentPayload[];
};

type SegmentRow = {
  segment_id: number;
  [key: string]: unknown;
};

type AdjustmentRow = {
  segment_id: number;
  condition: string;
  amount: number;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function adjustmentAmount(value: string): number {
  return Number(value.replace(/,/g, ""));
}

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
  if (!Array.isArray(segment.project_adjustments)) return `${label} has invalid project adjustments.`;
  if (segment.project_adjustments.some((adjustment) => !adjustment.condition?.trim() || typeof adjustment.amount !== "string" || !Number.isFinite(adjustmentAmount(adjustment.amount)) || adjustmentAmount(adjustment.amount) < 0)) {
    return `${label} has invalid project adjustment amounts.`;
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

    const segments = await client.query<SegmentRow>(
      `SELECT segment_id, quote_id, segment_name, segment_type, source_method, floor_level,
              shape_type, length::float AS length, width::float AS width, area_sqm::float AS area_sqm,
              polygon_coords, confidence_score::float AS confidence_score, included_in_quote,
              scope_of_work, work_type, notes, status
       FROM project_segments
       WHERE quote_id = $1
      ORDER BY segment_id`,
      [quoteId]
    );
    const adjustments = await client.query<AdjustmentRow>(
      `SELECT psa.segment_id, psa.condition, psa.amount::float AS amount
       FROM project_segment_adjustment psa
       JOIN project_segments ps ON ps.segment_id = psa.segment_id
       WHERE ps.quote_id = $1
       ORDER BY psa.project_segment_adjustment_id`,
      [quoteId]
    );
    const adjustmentsBySegment = new Map<number, ProjectAdjustment[]>();
    for (const adjustment of adjustments.rows) {
      const current = adjustmentsBySegment.get(adjustment.segment_id) ?? [];
      current.push({ condition: adjustment.condition as ProjectAdjustment["condition"], amount: adjustment.amount.toFixed(2) });
      adjustmentsBySegment.set(adjustment.segment_id, current);
    }
    return {
      ...segments,
      rows: segments.rows.map((segment) => ({
        ...segment,
        project_adjustments: adjustmentsBySegment.get(segment.segment_id) ?? [],
      })),
    };
  });

  if (result === null) return NextResponse.json({ error: "Quotation not found." }, { status: 404 });
  return NextResponse.json({ segments: result.rows });
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
           RETURNING segment_id
          `,
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
        for (const adjustment of segment.project_adjustments) {
          await client.query(
            `INSERT INTO project_segment_adjustment (segment_id, condition, amount)
             VALUES ($1, $2, $3)`,
            [inserted.rows[0].segment_id, adjustment.condition.trim(), adjustmentAmount(adjustment.amount)]
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
