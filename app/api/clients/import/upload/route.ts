import { NextRequest, NextResponse } from "next/server";
import {
  companyIdFor,
  detectClientField,
  missingRequiredFields,
  parseCsv,
  validClientType,
  type ClientImportField,
  type DetectedClientColumn,
  type ExtractedClientRow,
} from "../shared";

const FIELD_LABELS: Record<ClientImportField, string> = {
  client_name: "Client Name",
  contact_person: "Contact Person",
  contact_email: "Contact Email",
  contact_number: "Contact Number",
  client_address: "Client Address",
  client_type: "Client Type",
  default_downpayment_percentage: "Downpayment",
  notes: "Notes",
};

function valueFor(mapped: Map<ClientImportField, number>, row: string[], field: ClientImportField) {
  const index = mapped.get(field);
  if (index === undefined) return null;
  const value = row[index]?.trim();
  return value ? value : null;
}

function downpaymentValue(value: string | null) {
  if (!value) return null;
  const numeric = Number(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

export async function POST(request: NextRequest) {
  const companyId = await companyIdFor(request);
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const files = form?.getAll("files").filter((file): file is File => file instanceof File) ?? [];
  if (files.length === 0) return NextResponse.json({ error: "Upload a CSV client list." }, { status: 400 });

  const allColumns = new Map<string, DetectedClientColumn>();
  const rows: ExtractedClientRow[] = [];

  for (const file of files) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      return NextResponse.json({ error: "Client import currently supports CSV files." }, { status: 400 });
    }

    const parsed = parseCsv(await file.text());
    const headers = parsed[0] ?? [];
    if (headers.length === 0) return NextResponse.json({ error: `${file.name} has no header row.` }, { status: 400 });

    const usedFields = new Set<ClientImportField>();
    const columns = headers.map((header) => {
      const detected = detectClientField(header);
      const mappedField = detected && !usedFields.has(detected) ? detected : null;
      if (mappedField) usedFields.add(mappedField);
      const column = allColumns.get(header) ?? { raw_column: header, mapped_field: mappedField, source_files: [] };
      if (!column.source_files.includes(file.name)) column.source_files.push(file.name);
      if (!column.mapped_field) column.mapped_field = mappedField;
      allColumns.set(header, column);
      return column;
    });
    const missing = missingRequiredFields(columns);
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `${file.name} is missing required column(s): ${missing.map((field) => FIELD_LABELS[field]).join(", ")}.` },
        { status: 400 }
      );
    }

    const mapped = new Map<ClientImportField, number>();
    headers.forEach((header, index) => {
      const field = columns.find((column) => column.raw_column === header)?.mapped_field;
      if (field && !mapped.has(field)) mapped.set(field, index);
    });

    parsed.slice(1).forEach((row, index) => {
      const clientName = valueFor(mapped, row, "client_name") ?? "";
      rows.push({
        row_key: `${file.name}-${index + 2}`,
        client_name: clientName,
        contact_person: valueFor(mapped, row, "contact_person"),
        contact_email: valueFor(mapped, row, "contact_email"),
        contact_number: valueFor(mapped, row, "contact_number"),
        client_address: valueFor(mapped, row, "client_address"),
        client_type: validClientType(valueFor(mapped, row, "client_type")) ?? "Returning",
        default_downpayment_percentage: downpaymentValue(valueFor(mapped, row, "default_downpayment_percentage")),
        notes: valueFor(mapped, row, "notes"),
        needs_mapping: !clientName.trim(),
      });
    });
  }

  return NextResponse.json({ columns: Array.from(allColumns.values()), rows });
}
