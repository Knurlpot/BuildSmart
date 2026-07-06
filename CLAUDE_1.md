# CLAUDE.md — BuildSmart Project Context

This file is read automatically by Claude Code and provides standing context
for the BuildSmart project. Do not re-explain these decisions each session;
they are settled unless this file is updated.

## SCOPE OF THIS WORK: FRONTEND / UI ONLY

This chat/session is responsible for the FRONTEND only: building pages,
routing, and the login/signup forms and flow (input fields, wizard steps,
redirects, and calls to the backend auth API). Reuse the existing Replit
UI and components wherever possible.

OUT OF SCOPE — do not do this work (it belongs to the backend team):
- Standing up Postgres / Supabase
- Writing or running database migrations (Drizzle or SQL)
- Server-side auth logic (password hashing, session creation, account storage)
- Fixing the "accounts vanish on restart" bug (that is a backend DB issue)
- Any change to server/storage.ts or the persistence layer

If a task appears to require backend/database work, STOP and flag it rather
than doing it — it likely belongs to the backend team and could collide with
their work.

---

## 1. What BuildSmart Is

BuildSmart is an AI-assisted construction quotation and price-management
platform for Philippine construction SMEs (contractors, estimators, quantity
surveyors). Users upload blueprints or enter quick measurements; the system
segments the blueprint into rooms/areas, computes a Bill of Quantities,
and generates Practical and Premium quotations using company rules, supplier
pricing, and DPWH/PSA government reference prices.

Core modules: Quotation Generation, Pricelist Management, Company Preferences
& Rules, Market Intelligence (quarterly price variance + AI insights),
Supplier Benchmarking, and Projects.

Hard constraint: BuildSmart is a decision-support and estimation tool, NOT a
procurement marketplace. It does not execute supplier negotiations or B2B
transactions.

---

## 2. THREE RESOLVED DECISIONS (do not relitigate)

### Decision 1 — Authoritative Schema: the Backend Team's final 13-table SERIAL design

The authoritative database schema is the backend team's final 13-table design
(`THIS_IS_THE_FINAL_DB.txt`), which matches the Revised Manuscript's data
dictionary exactly. This is the backend team's official call.

- Primary keys are **SERIAL** (auto-incrementing integers), NOT UUIDs.
  Example: company_id = 101, user_id = 1001, supplier_id = 501.
- IDs are **database-generated server-side**. The frontend must NEVER invent
  or send an ID when creating a record — it reads the ID back from the API
  response after creation.
- The existing Replit prototype code uses UUID string keys
  (e.g. "demo-company-001"). This is prototype residue and MUST be replaced.
  Do not preserve the UUID design.
- Consequence for frontend: any place that treats an ID as a string must be
  updated to handle integer IDs during migration.

The 13 tables (in dependency order):
company, users, suppliers, supplier_benchmarks, supplier_regions,
supplier_discount_rules, categories, items, historical_price_records,
material_price_variances, quotations, quotation_items, quotation_service_costs.

Key naming notes:
- All PKs are lowercase `_id` EXCEPT: `items` uses `item_code`, and
  `supplier_discount_rules` uses `supplierdisc_id`.
- `quotations.status` is ONLY 'Draft' or 'Final'.
- `supplier_discount_rules.rule_type` values (exact casing):
  'Bulk discount', 'Negotiated price', 'Minimum order', 'Preferred supplier'.
- `historical_price_records.source`: 'DPWH', 'PSA', 'Supplier Upload'.
- Passwords stored in `users.password` (hashed), not `password_hash`.

### Decision 2 — Target Branch: `feature/frontend-scaffold`

All new work (auth fix, login/signup, new pages) goes on
`feature/frontend-scaffold`, branched off `main`. Merge to `main` via pull
request only after validation. If the branch does not exist:

    git checkout main
    git pull
    git checkout -b feature/frontend-scaffold

### Decision 3 — Database: owned by the BACKEND TEAM, not this scope

The database (standing up Postgres via Supabase, running the 13-table SERIAL
migration, wiring the storage layer, and the auth backend) is the BACKEND
TEAM's responsibility. It is NOT part of this frontend scope.

Do NOT write Drizzle migrations, wire DATABASE_URL, stand up Postgres, or
modify server-side auth/storage logic. That work is happening separately and
this scope must not collide with it.

Context only (so the frontend can be built correctly): the backend is moving
from in-memory `MemStorage` to real Postgres. This is why login currently
fails (accounts vanish on server restart) — that bug is the backend team's to
fix, not this scope's. Build the frontend auth flow (forms, redirects, API
calls) against the documented API contract; the persistence behind it is
backend-owned.

---

## 3. STACK REALITY CHECK (important)

The documented target stack and the current prototype code DO NOT MATCH.

| Layer     | Documented target (thesis)        | Current prototype code (Replit)     |
|-----------|-----------------------------------|-------------------------------------|
| Frontend  | Next.js 14 + TS + Tailwind        | Vite + React + Wouter               |
| Backend   | Python FastAPI + SQLAlchemy       | Node.js + Express + Drizzle         |
| Auth      | Supabase Auth + JWT               | express-session + scrypt            |
| Database  | PostgreSQL via Supabase           | MemStorage (in-memory, no DB)       |
| Keys      | SERIAL integers                   | UUID strings                        |

Plan: finish the UI in the current prototype, then migrate to the documented
Next.js + FastAPI stack in local IDEs. When in doubt about which stack a task
targets, ask — do not assume.

---

## 4. CURRENT WORK QUEUE (frontend only, priority order)

1. **Login page + 3-step SignUp wizard (highest priority).**
   - Login: email + password, "remember me", password show/hide, "forgot
     password" link (placeholder), links to signup. On submit, call the
     backend auth API; redirect based on the returned onboarding_step
     (< 2 → onboarding, >= 2 → dashboard). On failure, inline error.
   - SignUp: 3-step wizard — (1) Company Info incl. logo upload, (2) Contact
     & Access incl. email/password, (3) Service Profile (regions, sectors,
     role, specializations). Fields must map to the `company` and `users`
     tables. No hardcoded default values — placeholders only. On final submit,
     call the backend register API and redirect to onboarding.
   - This is FRONTEND ONLY: build the forms, validation, wizard state, and API
     calls. The auth backend (hashing, sessions, storage) is backend-owned.

2. **Onboarding gate (frontend flow).**
   New accounts are routed through pricelist upload (step 0→1) then company
   rules (step 1→2) before dashboard access. Read `onboarding_step` from the
   authenticated user object returned by the backend; advancing a step calls
   the backend endpoint. Frontend owns the routing/guard logic and the API
   calls — it does NOT own where onboarding_step is persisted (backend).
   Note: current code reads this from localStorage; the intended source of
   truth is the user object from the backend. Build the guard to read from the
   authenticated user, not localStorage.

3. **SupplierBenchmarking page** (`/suppliers` currently re-renders Dashboard).
   Read-only analytics UI: ranking table + score cards + a recharts bar chart,
   filterable by region and material category. Consumes a backend endpoint
   that returns supplier benchmark data — build the page to render whatever
   that API returns; do not query the DB directly.

4. **Market Intelligence page.**
   Quarterly price line-graph UI per material, filterable by region, with
   variance summary cards (percent_change, spike flag if >= 15%) and an AI
   insight text panel (interpretive summaries, NOT forecasting). Consumes a
   backend endpoint for the historical data and the Gemini-generated text.

5. **Quotation Generation UI wiring.**
   Wire the existing tab components (UploadBlueprintTab, ReviewSegmentsTab,
   AssignScopeTab, QuickMeasurementTab, GeneratingQuotationScreen,
   QuotationCardsTab) into a coherent multi-step flow. The pricing COMPUTATION
   is backend-owned; the frontend sends inputs and renders the returned
   breakdown. For display purposes, the backend computes in this order (so the
   UI labels/breakdown reflect it): base price → supplier discount → strategy
   markup → parallel unit-conversion/wastage + labor → grand total.

NOTE: All pages consume backend API endpoints. Where an endpoint does not yet
exist, build the page against the expected response shape and use a clearly-
labeled mock ONLY in a dev-flagged location — never ship hardcoded mock data
as if it were real, and never query the database directly from the frontend.

---

## 5. LOGO

Auth pages must use the actual BuildSmart cube logo — 13 SVG frames
(`Field 1.svg` through `Field 13.svg`) that fill progressively as the signup
form is completed. Frame 13 = fully filled. Login page uses Frame 13 (static,
full). Do NOT use a generated chevron/diamond placeholder. The SVG frames must
be committed into the repo for Claude Code to reference them.

---

## 6. KEY DESIGN DECISIONS (from prior sessions, not yet all in code)

- Supplier discount pipeline: discount applies to base price BEFORE markup.
- `supplier_regions` is a real table (multi-region supplier coverage confirmed).
- Projects are created ONLY as the output of a saved quotation — no standalone
  "create project" entry point. Projects can be re-edited or archived.
- Onboarding gate is sequential (pricelist → rules), not parallel.
- Market Intelligence AI insights are interpretive summaries, not forecasts.
