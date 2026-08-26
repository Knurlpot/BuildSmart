ALTER TABLE quotation
ADD COLUMN IF NOT EXISTS accepted_tier VARCHAR(20);

ALTER TABLE quotation
DROP CONSTRAINT IF EXISTS quotation_accepted_tier_check;

ALTER TABLE quotation
ADD CONSTRAINT quotation_accepted_tier_check
CHECK (accepted_tier IS NULL OR accepted_tier IN ('Practical', 'Premium'));
