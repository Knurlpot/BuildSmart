ALTER TABLE quotation
ADD COLUMN IF NOT EXISTS updated_by_user_id INT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_quotation_updated_by_user'
          AND conrelid = 'quotation'::regclass
    ) THEN
        ALTER TABLE quotation
        ADD CONSTRAINT fk_quotation_updated_by_user
            FOREIGN KEY (updated_by_user_id) REFERENCES users(user_id);
    END IF;
END
$$;
