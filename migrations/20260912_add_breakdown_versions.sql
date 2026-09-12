ALTER TABLE quotation_breakdown_snapshot
ADD COLUMN IF NOT EXISTS version_number INT NOT NULL DEFAULT 1;

ALTER TABLE quotation_breakdown_items
ADD COLUMN IF NOT EXISTS version_number INT NOT NULL DEFAULT 1;

ALTER TABLE quotation_breakdown_supplier_options
ADD COLUMN IF NOT EXISTS version_number INT NOT NULL DEFAULT 1;

ALTER TABLE quotation_breakdown_snapshot
DROP CONSTRAINT IF EXISTS quotation_breakdown_snapshot_quote_id_key;

ALTER TABLE quotation_breakdown_snapshot
ADD CONSTRAINT uq_breakdown_snapshot_quote_version UNIQUE (quote_id, version_number);

ALTER TABLE quotation_breakdown_items
DROP CONSTRAINT IF EXISTS uq_breakdown_item_line;

ALTER TABLE quotation_breakdown_items
ADD CONSTRAINT uq_breakdown_item_line_version UNIQUE (quote_id, version_number, line_id);

ALTER TABLE quotation_breakdown_supplier_options
DROP CONSTRAINT IF EXISTS uq_breakdown_supplier_option;

ALTER TABLE quotation_breakdown_supplier_options
ADD CONSTRAINT uq_breakdown_supplier_option_version UNIQUE (quote_id, version_number, line_id, supplier_id);
