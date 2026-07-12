import { Truck } from "lucide-react";

// Deliberately deferred — NOT a schema gap like the other five rule types. Supplier Rules
// is the ONE CPRM category with a real, confirmed table (supplier_discount_rule, schema
// v3) — see types/entities/supplier-discount-rule.ts. It's kept as a placeholder tab here
// only so the six-category nav structure stays complete; the actual form is wired in a
// later pass.
export function SupplierRulesPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white p-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
        <Truck className="h-6 w-6 text-gray-400" />
      </div>
      <p className="text-sm font-bold text-gray-700">Supplier Rules</p>
      <p className="max-w-sm text-sm text-gray-400">deferred — schema-backed, wiring later</p>
    </div>
  );
}
