ALTER TABLE rule_labor
ADD COLUMN IF NOT EXISTS worker_count INT NOT NULL DEFAULT 1 CHECK (worker_count > 0);
