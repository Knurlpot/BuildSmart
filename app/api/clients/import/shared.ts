import { NextRequest } from "next/server";
import { pool } from "@/lib/server/db";
import { readSession } from "@/lib/server/session";
import { CLIENT_TYPES, type ClientType } from "@/types/entities";

export type ClientImportField =
  | "client_name"
  | "contact_person"
  | "contact_email"
  | "contact_number"
  | "client_address"
  | "client_type"
  | "default_downpayment_percentage"
  | "notes";

export const REQUIRED_CLIENT_IMPORT_FIELDS: ClientImportField[] = [
  "client_name",
  "contact_person",
  "contact_number",
  "client_address",
];

export type DetectedClientColumn = {
  raw_column: string;
  mapped_field: ClientImportField | null;
  source_files: string[];
};

export type ExtractedClientRow = {
  row_key: string;
  client_name: string;
  contact_person: string | null;
  contact_email: string | null;
  contact_number: string | null;
  client_address: string | null;
  client_type: ClientType | null;
  default_downpayment_percentage: number | null;
  notes: string | null;
  needs_mapping: boolean;
};

export async function companyIdFor(request: NextRequest) {
  const session = readSession(request);
  if (!session) return null;

  const result = await pool.query<{ company_id: number }>(
    "SELECT company_id FROM users WHERE user_id = $1 LIMIT 1",
    [session.userId]
  );
  return result.rows[0]?.company_id ?? null;
}

export function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function detectClientField(header: string): ClientImportField | null {
  const normalized = normalizeHeader(header);
  const matches: Record<ClientImportField, string[]> = {
    client_name: ["clientname", "client", "companyname", "company", "customername", "customer"],
    contact_person: ["contactperson", "contactname", "personincharge", "representative", "contact"],
    contact_email: ["contactemail", "email", "emailaddress"],
    contact_number: ["contactnumber", "contactno", "phone", "phonenumber", "mobile", "mobilenumber", "telephone"],
    client_address: ["clientaddress", "address", "location", "projectaddress", "billingaddress"],
    client_type: ["clienttype", "type"],
    default_downpayment_percentage: ["defaultdownpaymentpercentage", "downpayment", "downpaymentonfile"],
    notes: ["notes", "remarks", "comment", "comments"],
  };
  return (Object.entries(matches) as [ClientImportField, string[]][])
    .find(([, aliases]) => aliases.includes(normalized))?.[0] ?? null;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (char === "\n") {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  return rows.filter((values) => values.some((value) => value !== ""));
}

export function missingRequiredFields(columns: DetectedClientColumn[]) {
  const mapped = new Set(columns.map((column) => column.mapped_field).filter(Boolean));
  return REQUIRED_CLIENT_IMPORT_FIELDS.filter((field) => !mapped.has(field));
}

export function validClientType(value: string | null): ClientType | null {
  if (!value) return null;
  return CLIENT_TYPES.includes(value as ClientType) ? (value as ClientType) : null;
}
