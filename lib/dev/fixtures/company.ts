// DEV-ONLY fixture — see lib/dev/mock-toggle.ts. Matches Company exactly
// (types/entities/company.ts), same field casing.
import type { Company } from "@/types/entities";

// Self-contained inline SVG data URI so the logo preview renders with no network
// dependency (and nothing to break the prod-safety string check downstream).
const LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">' +
  '<rect width="96" height="96" rx="16" fill="#E07B39"/>' +
  '<text x="48" y="60" font-family="sans-serif" font-size="34" fill="white" text-anchor="middle">LB</text>' +
  "</svg>";

export const companyFixture: Company = {
  company_id: 101,
  company_name: "Lakeside Builders Co.",
  company_address: "42 Rivercrest Ave, Quezon City",
  contact_email: "info@lakesidebuilders.example",
  contact_number: "+63 917 555 0142",
  specialization_1: "Waterproofing Systems",
  specialization_2: "Structural Retrofitting",
  specialization_3: "Roofing Installation",
  company_logo: `data:image/svg+xml;utf8,${encodeURIComponent(LOGO_SVG)}`,
  status: "Active",
  created_at: "2025-03-11T08:00:00.000Z",
};
