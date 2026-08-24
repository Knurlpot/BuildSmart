import { NextRequest, NextResponse } from "next/server";
import { authContext, isAuthContext, withTransaction } from "../../pricing";

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

    return client.query(
      `SELECT segment_id, quote_id, segment_name, segment_type, source_method, floor_level,
              shape_type, length::float AS length, width::float AS width, area_sqm::float AS area_sqm,
              polygon_coords, confidence_score::float AS confidence_score, included_in_quote,
              scope_of_work, work_type, notes, status
       FROM project_segments
       WHERE quote_id = $1
       ORDER BY segment_id`,
      [quoteId]
    );
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
        await client.query(
          `INSERT INTO project_segments (
             quote_id, segment_name, segment_type, source_method, floor_level, shape_type,
             length, width, area_sqm, polygon_coords, confidence_score, included_in_quote,
             scope_of_work, work_type, notes, status
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'Active')`,
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
      }

      await client.query("UPDATE quotation SET updated_at = CURRENT_TIMESTAMP WHERE quote_id = $1", [quoteId]);
      return body.segments!.length;
    });

    if (savedCount === null) return NextResponse.json({ error: "Quotation not found." }, { status: 404 });
    return NextResponse.json({ saved_count: savedCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save segments.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
