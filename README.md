This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Full Local Setup (frontend + Python backend)

`.env`, the Python venv, and `node_modules` are all gitignored, so none of this comes along with a `git clone`/`git pull` — it has to be set up once per machine.

### 1. Create `.env` at the repo root

```
GEMINI_API_KEY=<a real key, or any placeholder string if you'll only use Quick Match>
DATABASE_URL="postgresql://postgres:<your local postgres password>@localhost:5432/BuildSmart"
REDIS_URL="redis://localhost:6379/0"
FRONTEND_ORIGIN="http://localhost:3000"
NEXT_PUBLIC_NORMALIZATION_API_BASE_URL="http://localhost:8000"
USE_MOCK_AI=true
```

`DATABASE_URL`'s credentials should match your own local Postgres user — "password" above is just a placeholder.

**`GEMINI_API_KEY` is required even if you only ever use Quick Match** — `backend/app/services/normalizer_gemini.py` initializes its Gemini client at import time, and that import runs unconditionally whenever `uvicorn` or the Celery worker starts. Without it, both crash on startup with `KeyError`, regardless of `USE_MOCK_AI`.

### 2. Local services

- **PostgreSQL** running locally, with a database named `BuildSmart`.
- **Redis** running locally.

### 3. Database schema

Run `database_schema.sql` (repo root) against your `BuildSmart` database — it's a drop-and-recreate script covering all tables (`items`, `category`, `historical_price_record`, `pricelist_review_item`, etc.).

It ships with **zero seed rows**. The material normalizer needs at least one `category`/`items` row to have anything to match against — with an empty catalog, even Quick Match errors (`candidates must not be empty`). Insert a few rows manually before testing the pricelist normalization feature.

### 4. Python backend

```bash
# from backend/, with a venv active
pip install -r requirements.txt

# terminal 1
uvicorn app.main:app --port 8000

# terminal 2
celery -A app.celery_app worker --pool=solo --loglevel=info
```

`--pool=solo` is required on Windows; it's harmless on other platforms.

**Both processes must be restarted manually after any backend code change** — there's no autoreload configured for either.

### 5. Frontend

```bash
npm install
npm run dev
```

### Testing AI Match for real

Gemini's free-tier rate limits have been tight and have shifted more than once as the `gemini-flash-latest` alias moved to newer underlying models. Keep test files small (3–5 rows) to avoid burning quota.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
