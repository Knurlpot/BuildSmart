ALTER TABLE quotation_breakdown_items
ADD COLUMN IF NOT EXISTS selected_supplier_name VARCHAR(150);
