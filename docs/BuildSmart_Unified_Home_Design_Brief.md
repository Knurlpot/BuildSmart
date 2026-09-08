# BuildSmart Unified Landing, About Us, and Dashboard

## Product and UI Design Brief

Use this document as the source prompt for ChatGPT, Replit, or a UI designer. The goal is to revise BuildSmart's current home experience into one coherent product story that welcomes new visitors, explains the platform, and gives authenticated users an immediately useful dashboard.

## 1. Product context

BuildSmart is an AI-assisted construction quotation and decision-support platform intended primarily for Philippine contractors, estimators, quantity surveyors, suppliers, and project managers. It helps teams turn measurements or blueprints into quotations, maintain company-specific pricing rules, normalize supplier pricelists, compare material prices, manage clients and projects, and monitor market price movement.

BuildSmart began as a capstone project by four Computer Engineering / IT students at the Polytechnic University of the Philippines. It responds to a practical industry problem: construction quotations are slow to prepare, highly dependent on changing material prices, and often rebuilt manually when supplier or government reference prices change.

The product must be described honestly as a decision-support tool. It assists professionals but does not replace engineering judgment, quantity surveying, validation of blueprint measurements, or review of final quotations. Do not imply that AI results are automatically correct.

## 2. Primary design objective

Create an adaptive home experience with a consistent visual identity:

- Logged-out visitors see a welcoming landing page with concise About Us content, product capabilities, workflow explanation, trust messaging, and clear Login/Create Account calls to action.
- Newly registered users see onboarding progress and the exact next action required to configure their company.
- Fully onboarded users see an operational dashboard with project activity, quotation status, pricing signals, shortcuts, and contextual guidance.
- Logged-in users can still access the complete About Us story without leaving the visual language of the application.

The experience may look unified, but authentication boundaries must remain clear in the implementation. Keep `/` public, `/about` public, and `/dashboard` protected. Shared components and styling may make them feel like variants of one home experience. Never expose company data through the public routes.

## 3. Current technical environment

Design for the existing application rather than generating a disconnected static concept.

- Framework: Next.js App Router, React, and TypeScript
- Styling: Tailwind CSS and shadcn-compatible design tokens
- Icons: Lucide React
- Font: Montserrat, loaded locally
- Main brand color: `#e07b39`
- Hover orange: `#c96a2c`
- Brand gradient colors: `#6b1200`, `#e07b39`, and `#9a2800`
- General surface style: white cards, light-gray page backgrounds, subtle borders, modest shadows, and rounded corners
- Typical card radius: `rounded-2xl`
- Typical button radius: `rounded-xl`
- Existing authenticated shell: collapsible left sidebar, 64-pixel top header, and scrollable main content
- Existing responsive behavior: desktop sidebar with compact/collapsed mode; layouts should collapse cleanly on tablets and phones

Preserve existing CSS variables such as `--primary`, `--primary-hover`, `--brand-gradient-1`, `--brand-gradient-2`, and `--brand-gradient-3`. Do not introduce a second unrelated palette or replace Montserrat.

## 4. Visual direction

The interface should feel professional, practical, warm, and construction-oriented without using visual clichés excessively. It should look like an operational business tool rather than a generic AI startup page.

Use:

- Warm orange for primary actions, active navigation, progress, and important highlights
- Deep rust-to-orange gradients for brand moments and the dashboard welcome area
- White and very light gray for working surfaces
- Dark gray for headings and medium gray for supporting text
- Subtle grid, blueprint-line, measurement, or material motifs as low-opacity decoration
- Real interface previews or diagrammatic product mockups rather than generic stock photography
- Lucide icons that already correspond to BuildSmart modules
- Short, useful motion such as gentle gradient movement, card entrance, or progress transitions

Avoid:

- Excessive glassmorphism, neon colors, heavy black backgrounds, or purple AI gradients
- Giant empty hero areas that delay access to useful information
- Unsupported statistics, fabricated customer testimonials, fake partner logos, or claims of guaranteed accuracy
- Construction-site stock photos that overwhelm the product interface
- Too many equally prominent calls to action
- Continuous motion that ignores `prefers-reduced-motion`

## 5. Recommended information architecture

### Public landing page: `/`

#### A. Top navigation

Include:

- BuildSmart logo and wordmark
- Product or Features anchor
- How It Works anchor
- About Us link
- Login as a secondary action
- Get Started as the primary orange action

On mobile, use an accessible menu button and a simple drawer. Keep Login and Get Started easy to find.

#### B. Hero

Recommended headline:

> Smarter Estimates. Fairer Prices. Better Builds.

Recommended supporting copy:

> BuildSmart helps Philippine contractors turn project inputs, company rules, and current material prices into reviewable construction quotations—faster and with clearer cost context.

Primary CTA: **Create Your Account**

Secondary CTA: **See How It Works**

Optional tertiary text link: **Already have an account? Log in**

The hero visual should show a credible BuildSmart workflow preview: blueprint or measurements entering the system, a Bill of Quantities being assembled, and Economic/Premium quotation options. Treat it as an illustrative UI preview, not live project data.

#### C. Problem statement

Heading:

> Construction prices move. Your quotations need to keep up.

Explain three real pressures:

- Manual takeoff and quotation preparation consume time.
- Supplier and published reference prices change.
- Company rules, labor assumptions, and preferred suppliers must remain consistent across estimates.

Keep this section concise and grounded in the Philippine construction context.

#### D. How BuildSmart works

Use a four-step visual sequence:

1. **Set up your pricing foundation** — upload supplier pricelists or use available reference catalogs.
2. **Configure company preferences** — define material, supplier, labor, unit, and pricing rules.
3. **Describe the project** — upload a supported blueprint or enter quick measurements.
4. **Review and generate** — inspect quantities, price sources, alternatives, and quotation tiers before finalizing.

Explicitly say that users review the generated result before using it.

#### E. Core capabilities

Use five cards matching the current navigation:

1. **Manage Pricelist**
   - Upload and organize supplier pricing.
   - Normalize inconsistent item names and formats.
   - Review uncertain matches rather than silently accepting them.

2. **Preferences & Rules**
   - Configure company-specific material, supplier, labor, unit, and pricing policies.
   - Ensure estimates reflect how the company actually works.

3. **Quotation Generation**
   - Start from blueprints or manual measurements.
   - Build reviewable quantities and Economic/Premium quotation options.
   - Show the source of important price decisions.

4. **Open Projects**
   - Continue unfinished work.
   - Review client and quotation details.
   - Track current quotation status.

5. **Price Trends**
   - Compare company or supplier prices with available reference data.
   - Highlight favorable and unfavorable movement without presenting predictions as facts.

If a feature is experimental or unavailable in the deployed environment, label it accurately instead of presenting it as finished.

#### F. Built for real roles

Include three audience cards:

- **Contractors and estimators** — shape quotations using their own rules, materials, and pricing strategies.
- **Project managers** — keep client, project, and quotation context organized and reviewable.
- **Material suppliers** — provide current price information that can support more realistic estimates.

Do not imply that suppliers are automatically connected to or endorsing BuildSmart unless that relationship exists.

#### G. Trust and responsible AI

Heading:

> A tool that assists—never one that guesses for you.

Include these principles:

- The user remains responsible for reviewing measurements, quantities, prices, and final quotations.
- Low-confidence pricelist matches should be surfaced for review.
- Price sources and assumptions should be visible where practical.
- AI-enhanced steps should degrade gracefully when an AI service is unavailable.
- Client and company data must remain isolated by company account.

#### H. About BuildSmart preview

Provide a short origin story and link to `/about`:

> BuildSmart began as a Polytechnic University of the Philippines capstone project focused on a real challenge faced by small and medium construction teams: producing timely quotations while material costs keep changing.

CTA: **Meet the Team and Read Our Story**

#### I. Final CTA and footer

Final heading:

> Build your next quotation on a stronger foundation.

Primary CTA: **Get Started**

Secondary CTA: **Log In**

Footer content:

- BuildSmart logo and one-sentence description
- Product links
- About Us
- Terms and Privacy links if those pages are available
- Contact or support address only if a monitored address exists
- Current year and ownership statement

Do not add social-media links, addresses, accreditations, or support channels that have not been supplied.

### About Us page: `/about`

The About Us page should add depth rather than repeat the entire landing page.

Recommended sections:

1. **Mission** — make construction quotation work faster, clearer, and more responsive to price changes.
2. **Origin** — capstone project by four PUP Computer Engineering / IT students.
3. **Problem being addressed** — manual estimating, volatile material pricing, and fragmented company practices.
4. **Product principles** — professional review, traceable inputs, honest uncertainty, and company-specific configuration.
5. **Who the team builds with** — contractors, estimators, suppliers, and project managers.
6. **Roadmap direction** — better blueprint understanding, deeper price context, and smoother contractor workflows. Label future-facing items as goals, not current guarantees.
7. **Team** — names and confirmed roles. Do not leave `[Role]` placeholders in a production page; omit roles until confirmed.
8. **CTA** — Get Started for visitors and Go to Dashboard for authenticated users.

Known team names from the existing About Us draft:

- Knurl Randel B. Abasola
- Emmanuel Christian E. Azarcon
- Princess Daniella M. Chica
- Matthew Aiman L. Lopez

Ask the project owner to confirm each role, preferred biography, contact information, and whether photographs may be published.

### Authenticated dashboard: `/dashboard`

The dashboard should prioritize decisions and next actions over marketing content.

#### A. Personalized welcome

Show the user's first name where available and the company name. Use email-prefix fallback only when profile data is unavailable.

Examples:

- Morning/afternoon/evening greeting, first name
- “Here is what needs your attention at Company Name.”

Avoid overly casual greetings in critical business states.

#### B. Onboarding state

For incomplete setup, make the setup checklist the primary content:

- Pricelist configured
- Preferences and rules configured
- Quotation tools unlocked

Show progress, why each step matters, and one primary **Continue Setup** action. Locked modules should explain the prerequisite and link to the next valid setup step.

#### C. Operational summary

For completed setup, show metrics that can be calculated from real records:

- Active/open projects
- Quotations created this month
- Draft quotations requiring attention
- Final quotations
- Latest pricelist update date
- Items awaiting normalization review, if available

Every metric needs loading, empty, error, and permission-aware states. Never display invented values.

#### D. Continue working

Show up to five recent or actionable records:

- Project/client name
- Quotation tier or status
- Last updated date
- Clear action such as Continue, Review, or View

Use a useful empty state:

> No projects yet. Start with a client and create your first quotation.

CTA: **Create Quotation**

#### E. Quick actions

Prioritize three actions based on onboarding and role:

- New Quotation
- Upload Pricelist
- Open Projects

Secondary shortcuts may include Preferences & Rules and Price Trends. Do not give every module equal visual weight.

#### F. Pricing and data health

Add a compact “Pricing readiness” or “Data health” card when the endpoints exist:

- Last supplier upload
- Number of active catalog items
- Number of unresolved normalization reviews
- Number of configured rule groups
- Warning when data is missing or stale

Use neutral language. “Needs review” is preferable to alarming red error styling unless work is genuinely blocked.

#### G. Product context inside the dashboard

Do not put the full About Us story in the working dashboard. Include one small dismissible card for first-time users:

> BuildSmart combines your pricing data, company rules, and project measurements into quotations you can inspect and refine.

Link: **How BuildSmart works**

This link can open an in-app guide or `/about#how-it-works`.

## 6. Adaptive behavior by user state

### Logged out

- Public navigation
- Product explanation and About Us content
- Create Account primary CTA
- Login secondary CTA
- No company-specific API requests

### Authenticated, onboarding step 0

- Welcome and explain why a pricelist is needed
- Primary CTA: Set Up Pricelist
- Preferences, quotation, project, and trend tools remain appropriately gated

### Authenticated, onboarding step 1

- Acknowledge pricelist completion
- Primary CTA: Set Up Preferences & Rules
- Explain what remains before quotation generation unlocks

### Authenticated, onboarding step 2 or higher

- Show operational metrics and recent activity
- Primary CTA: New Quotation
- Present full module navigation

### Loading or unknown authentication state

- Show a stable branded skeleton or spinner
- Do not briefly render private dashboard content or the wrong CTA
- Avoid layout shifts between authentication states

## 7. Component recommendations

Create small reusable components instead of one oversized page:

- `PublicTopBar`
- `HomeHero`
- `ProblemSection`
- `WorkflowSteps`
- `CapabilityGrid`
- `ResponsibleAISection`
- `AboutPreview`
- `PublicFooter`
- `DashboardWelcome`
- `OnboardingChecklist`
- `MetricCard`
- `RecentWorkList`
- `QuickActions`
- `PricingReadinessCard`
- `AsyncState`

Shared marketing sections should accept content through props. Dashboard components should consume typed API results, not hard-coded demo values.

## 8. Interaction and accessibility requirements

- Meet WCAG AA contrast for text and interactive controls.
- Use semantic landmarks: `header`, `nav`, `main`, `section`, and `footer`.
- Maintain a logical heading hierarchy with one page-level `h1`.
- All controls must be keyboard accessible and show a visible focus state.
- Icon-only controls require accessible labels and tooltips where useful.
- Images need meaningful alternative text unless purely decorative.
- Do not use color as the only indicator of status.
- Respect `prefers-reduced-motion` for gradients, reveals, and transitions.
- Keep mobile tap targets at least approximately 44 by 44 pixels.
- Ensure skeleton, error, and empty states are announced appropriately where dynamic updates matter.

## 9. Responsive layout

- Mobile: single-column sections, compact hero, stacked CTAs, and a navigation drawer.
- Tablet: two-column capability/metric cards where space permits.
- Desktop public page: centered content around `max-w-6xl` or `max-w-7xl`.
- Desktop dashboard: retain the existing sidebar and header shell.
- Avoid horizontal scrolling at 320-pixel width.
- Dashboard tables should become cards, scroll safely, or hide only nonessential columns on small screens.

## 10. Data and implementation constraints

- Reuse the current `AuthProvider` and onboarding step values.
- Preserve protected route behavior for `/dashboard`.
- Reuse existing `NAV_ITEMS`; do not duplicate module names in multiple hard-coded arrays without a clear reason.
- Use existing endpoints for quotations and dashboard activity.
- Add new dashboard metrics only after confirming or creating the corresponding endpoint.
- Keep API failures local to the affected card rather than breaking the whole page.
- Do not expose environment variables, database credentials, internal IDs, or stack traces in the UI.
- Do not make frontend display depend directly on Redis, Celery, or Gemini availability unless the relevant action requires it.
- If AI services are unavailable, clearly indicate that core parsing or manual workflows remain available where true.

## 11. Content still required from the project owners

Before production release, collect and confirm:

- Official one-sentence product description
- Intended primary customer segment
- Final Economic/Premium tier names and definitions
- Supported blueprint formats and current limitations
- Which reference price sources are currently available
- Definition of “AI-assisted” for each feature
- Team roles, short biographies, and approved photographs
- Official support/contact email
- Privacy policy and data-retention details
- Terms of use
- Accurate product status: prototype, pilot, beta, or production
- Any approved institutional acknowledgments or partner logos
- Whether pricing, plans, or access limitations should be shown publicly

Until confirmed, omit these claims or label them transparently as placeholders in development only.

## 12. Success criteria

The revised experience succeeds when:

- A first-time visitor can explain what BuildSmart does, who it serves, and how it works after a short scan.
- The visitor has one obvious next action.
- A new account holder always knows the next onboarding step.
- A returning user can continue important work within one or two clicks.
- Product capabilities are described without exaggeration.
- Public pages contain no private company data.
- The new UI looks native to the current BuildSmart system.
- The design works on mobile, tablet, and desktop and supports reduced motion.

## 13. Copy-paste generation prompt

Use the following prompt after attaching this brief and, if possible, the current BuildSmart source archives:

> Design and implement a production-quality adaptive home experience for BuildSmart using the attached design brief as the authoritative product and content specification. Use Next.js App Router, React, TypeScript, Tailwind CSS, Lucide React, and the existing BuildSmart components and design tokens. Preserve Montserrat, the current orange/rust palette, rounded white cards, subtle borders, and authenticated application shell. Keep `/` and `/about` public and `/dashboard` authenticated, but make them feel like one coherent product experience. Implement responsive layouts and accessible keyboard/focus behavior. Respect reduced-motion settings. Reuse AuthProvider, onboarding state, NAV_ITEMS, and real API hooks. Do not fabricate data, testimonials, usage statistics, partnerships, price sources, or AI accuracy claims. Include explicit loading, empty, error, and onboarding states. Break the work into reusable components and return the proposed file tree before writing code. Do not replace unrelated application files or backend logic. Clearly identify any required endpoint or content that does not yet exist.

## 14. Requested design deliverables

Ask the generator or designer to provide:

1. A short rationale for the information hierarchy.
2. Desktop and mobile layouts for `/`, `/about`, and `/dashboard`.
3. Variants for logged out, onboarding step 0, onboarding step 1, and setup complete.
4. A reusable component tree.
5. Exact files to add or modify.
6. Complete TypeScript/React code without placeholder imports.
7. Loading, empty, error, and reduced-motion behavior.
8. A list of new API requirements, clearly separated from frontend implementation.
9. A verification checklist covering authentication boundaries, responsiveness, accessibility, and truthful content.

