ALTER TABLE quotation_price_history
DROP CONSTRAINT IF EXISTS quotation_price_history_quote_item_id_fkey;

ALTER TABLE quotation_price_history
DROP CONSTRAINT IF EXISTS fk_price_history_quote_item;

ALTER TABLE quotation_price_history
ADD CONSTRAINT fk_price_history_quote_item
FOREIGN KEY (quote_item_id)
REFERENCES quotation_items(quote_item_id)
ON DELETE CASCADE;
