import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { readSession } from "@/lib/server/session";
import { PH_REGIONS } from "@/types/entities/common";

const SUPPLIER_TYPES = ["Distributor", "Warehouse", "Retailer"] as const;

type SupplierType = (typeof SUPPLIER_TYPES)[number];
type SupplierRegion = (typeof PH_REGIONS)[number];

type SupplierRow = {
  supplier_id: number;
  supplier_name: string;
  supplier_address: string;
  warehouse_loc: string | null;
  city: string;
  region: SupplierRegion;
  contact_email: string;
  contact_number: string;
  supplier_type: SupplierType;
  status: "Active" | "Inactive";
};

function isSupplierType(value: unknown): value is SupplierType {
  return typeof value === "string" && SUPPLIER_TYPES.includes(value as SupplierType);
}

function isRegion(value: unknown): value is SupplierRegion {
  return typeof value === "string" && PH_REGIONS.includes(value as SupplierRegion);
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: NextRequest) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await pool.query<SupplierRow>(
    `SELECT supplier_id, supplier_name, supplier_address, warehouse_loc, city, region,
            contact_email, contact_number, supplier_type, status
     FROM suppliers
     WHERE status = 'Active'
     ORDER BY supplier_name ASC, supplier_id ASC`
  );

  return NextResponse.json(result.rows);
}

export async function POST(request: NextRequest) {
  const session = readSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid supplier payload" }, { status: 400 });
  }

  const supplierName = clean(body.supplier_name);
  const supplierAddress = clean(body.supplier_address);
  const city = clean(body.city);
  const region = clean(body.region);
  const contactEmail = clean(body.contact_email).toLowerCase();
  const contactNumber = clean(body.contact_number);
  const supplierType = clean(body.supplier_type);
  const warehouseLoc = clean(body.warehouse_loc) || null;

  if (!supplierName || !supplierAddress || !city || !contactEmail || !contactNumber) {
    return NextResponse.json({ error: "Supplier name, address, city, email, and contact number are required" }, { status: 400 });
  }

  if (!isRegion(region)) {
    return NextResponse.json({ error: "Select a valid supplier region" }, { status: 400 });
  }

  if (!isSupplierType(supplierType)) {
    return NextResponse.json({ error: "Select a valid supplier type" }, { status: 400 });
  }

  try {
    const result = await pool.query<SupplierRow>(
      `INSERT INTO suppliers (
         supplier_name, supplier_address, warehouse_loc, city, region,
         contact_email, contact_number, supplier_type, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Active')
       ON CONFLICT (contact_email) DO UPDATE SET
         supplier_name = EXCLUDED.supplier_name,
         supplier_address = EXCLUDED.supplier_address,
         warehouse_loc = EXCLUDED.warehouse_loc,
         city = EXCLUDED.city,
         region = EXCLUDED.region,
         contact_number = EXCLUDED.contact_number,
         supplier_type = EXCLUDED.supplier_type,
         status = 'Active'
       RETURNING supplier_id, supplier_name, supplier_address, warehouse_loc, city, region,
                 contact_email, contact_number, supplier_type, status`,
      [supplierName, supplierAddress, warehouseLoc, city, region, contactEmail, contactNumber, supplierType]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save supplier";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
