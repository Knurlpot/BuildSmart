UPDATE users
SET user_role = 'Estimator'
WHERE user_role = 'Admin';

ALTER TABLE users
DROP CONSTRAINT IF EXISTS users_user_role_check;

ALTER TABLE users
ADD CONSTRAINT users_user_role_check
CHECK (user_role IN ('Owner', 'Estimator'));

ALTER TABLE company_invites
DROP CONSTRAINT IF EXISTS company_invites_role_check;

ALTER TABLE company_invites
ADD CONSTRAINT company_invites_role_check
CHECK (role IN ('Estimator'));
