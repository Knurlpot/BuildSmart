This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Full Local Setup (frontend + Python backend)

.env, the Python venv, and node_modules are all gitignored, so none of this comes along with a git clone`/git pull` — it has to be set up once per machine.

### 1. Create .env at the repo root

GEMINI_API_KEY=<a real key — enables optional PDF pricelist proofreading and blueprint AI features>
DATABASE_URL="postgresql://postgres:<your local postgres password>@localhost:5432/BuildSmart"
REDIS_URL="redis://localhost:6379/0"
SESSION_SECRET="<a long random string for signing local session cookies>"
FRONTEND_ORIGIN="http://localhost:3000"
NORMALIZATION_API_BASE_URL="http://localhost:8000"
BACKEND_INTERNAL_API_KEY="<shared key for Next.js to call FastAPI; optional in local dev>"

DATABASE_URL's credentials should match your own local Postgres user — "password" above is just a placeholder. You may use `POSTGRES_URL` instead of `DATABASE_URL`; both the Next.js app and Python backend read `DATABASE_URL` first and then fall back to `POSTGRES_URL`.
Production deployments must set SESSION_SECRET or NEXTAUTH_SECRET; the app will refuse to use the local development fallback in production.
The browser no longer calls FastAPI directly. Do not set NEXT_PUBLIC_NORMALIZATION_API_BASE_URL in production; pricelist and blueprint calls go through same-origin Next.js API routes, which forward BACKEND_INTERNAL_API_KEY server-side.
When GEMINI_API_KEY is set, PDF pricelist uploads run an optional Gemini proofreading pass after table extraction. If Gemini is unavailable or rate-limited, uploads still continue with the normal parser output.

### 2. Local services

- *PostgreSQL* running locally, with a database named BuildSmart.
- *Redis* running locally.

### 3. Database schema

Run database_schema.sql (repo root) against your BuildSmart database — it's a drop-and-recreate script covering all tables (items, category, historical_price_record, pricelist_review_item, etc.).

It ships with *zero seed rows*. The material normalizer needs at least one category`/items` row to have anything to match against — with an empty catalog, matching errors (candidates must not be empty). Insert a few rows manually before testing the pricelist normalization feature.

### 4. Python backend

# from backend/, with a venv active
pip install -r requirements.txt

# terminal 1
uvicorn app.main:app --port 8000

# terminal 2
celery -A app.celery_app worker --pool=solo --loglevel=info

--pool=solo is required on Windows; it's harmless on other platforms.

*Both processes must be restarted manually after any backend code change* — there's no autoreload configured for either.

### 5. Frontend

npm install
npm run dev

## Getting Started

First, run the development server:

npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying app/page.tsx. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Production Deployment Checklist

Required server-side environment variables:

- `NODE_ENV=production`
- `SESSION_SECRET` or `NEXTAUTH_SECRET`
- `DATABASE_URL` or `POSTGRES_URL`
- `NORMALIZATION_API_BASE_URL`
- `BACKEND_INTERNAL_API_KEY`
- `FRONTEND_ORIGIN`
- `IMAGE_UPLOAD_DIR`
- `REDIS_URL`

Recommended production environment variables:

- `HEALTHCHECK_SECRET` for detailed `/api/health` checks.
- `DATABASE_CA_CERT` when the PostgreSQL provider requires a custom CA bundle. Use escaped newlines (`\n`) if storing it as a single-line secret.
- `GEMINI_API_KEY` only when AI-assisted parsing/scanning is enabled.

Do not set `DATABASE_SSL_REJECT_UNAUTHORIZED=false` in production unless you have an explicit, temporary incident workaround. Production database TLS verifies certificates by default.

Deployment gates to verify outside the repository:

- HTTPS certificates and HTTP-to-HTTPS redirect are configured.
- FastAPI is private or rejects direct requests without `X-BuildSmart-Internal-Key`.
- `BACKEND_INTERNAL_API_KEY` matches between Next.js and FastAPI.
- `IMAGE_UPLOAD_DIR` points to a persistent private volume.
- Database backups are automated and a restore has been tested.
- Redis is reachable, authenticated where supported, and used by Celery.
- Celery workers and scheduled jobs are supervised and restart on failure.
- Migrations are run through a documented production process.
- Monitoring, alerting, and log retention are configured.
- Multi-instance deployments use shared rate limiting, such as Redis or an edge/WAF limiter.
- The hosting proxy sanitizes `X-Forwarded-For` before it reaches the app.

## Deploy the Next.js App

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
