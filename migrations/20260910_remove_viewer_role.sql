UPDATE users
SET user_role = 'Estimator'
WHERE user_role = 'Viewer';

ALTER TABLE users
DROP CONSTRAINT IF EXISTS users_user_role_check;

ALTER TABLE users
ADD CONSTRAINT users_user_role_check
CHECK (user_role IN ('Owner', 'Admin', 'Estimator'));
