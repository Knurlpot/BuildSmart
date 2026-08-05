"use client";

// Public/authenticated About Us page — deliberately OUTSIDE the (app) route group, so it
// carries no RequireAuth/RequireOnboardingStep guard (app/(app)/layout.tsx is what applies
// those, and this route never passes through it). Renders for both logged-out visitors and
// logged-in users; components below adapt via useAuth() — see lib/marketing.ts for the one
// shared resolver both the FeatureGrid and SidebarPeek call.
//
// Copy is verbatim from the provided About Us doc, with ONE flagged substitution: the
// source copy's "practical and premium quotation options" now reads "Economic and Premium"
// — matching the tier's CURRENT product name (renamed from "Practical" app-wide in an
// earlier pass) rather than reintroducing the inconsistency that rename fixed. Every other
// word below is unchanged, including the "[Role]" placeholders for team members.
import { Landmark, ShieldCheck, Users2 } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { resolvePrimaryCta } from "@/lib/marketing";
import { TopBar } from "@/components/marketing/TopBar";
import { Hero } from "@/components/marketing/Hero";
import { SectionBand } from "@/components/marketing/SectionBand";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { TeamCard } from "@/components/marketing/TeamCard";
import { CTABand } from "@/components/marketing/CTABand";
import { SidebarPeek } from "@/components/marketing/SidebarPeek";

const TEAM = [
  { name: "Knurl Randel B. Abasola", role: "[Role]" },
  { name: "Emmanuel Christian E. Azarcon", role: "[Role]" },
  { name: "Princess Daniella M. Chica", role: "[Role]" },
  { name: "Matthew Aiman L. Lopez", role: "[Role]" },
];

const AUDIENCE = [
  {
    icon: Users2,
    title: "Contractors and estimators",
    body: "Shape how the system quotes — their rules, their materials, their pricing strategies.",
  },
  {
    icon: Landmark,
    title: "Material suppliers",
    body: "Ground the platform in real, current market prices.",
  },
  {
    icon: ShieldCheck,
    title: "Project managers",
    body: "Keep the workflow honest and practical.",
  },
];

export default function AboutPage() {
  const { isAuthenticated, currentUser } = useAuth();
  const primaryHref = resolvePrimaryCta(isAuthenticated, currentUser);
  const primaryLabel = isAuthenticated ? "Go to Dashboard" : "Get Started";

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SidebarPeek />
      <TopBar />

      <Hero primaryHref={primaryHref} primaryLabel={primaryLabel} />

      <SectionBand eyebrow="Who We Are" heading="Built by students. Grounded in a real problem.">
        <p className="text-sm leading-relaxed text-gray-600 sm:text-base">
          BuildSmart began as a capstone project by four Computer Engineering / IT students at the{" "}
          <strong className="font-semibold text-gray-800">Polytechnic University of the Philippines</strong>. We set
          out to solve a problem we kept seeing in the local construction industry: quoting a project is slow,
          manual, and painfully sensitive to prices that change from one quarter to the next.
        </p>
        <p className="text-sm leading-relaxed text-gray-600 sm:text-base">
          Small and medium construction contractors — the estimators and quantity surveyors who keep Filipino
          projects moving — often spend hours tracing blueprints by hand, chasing supplier prices, and rebuilding
          quotations every time material costs shift. We believed that work deserved better tools.
        </p>
      </SectionBand>

      <div id="solving">
        <SectionBand eyebrow="What We're Solving" heading="Prices move. Quotations shouldn't fall behind." tone="tinted">
          <p className="text-sm leading-relaxed text-gray-600 sm:text-base">
            Construction material prices in the Philippines are volatile. A quotation that was accurate last quarter
            can quietly become a loss this quarter. That uncertainty hurts everyone — contractors absorb the risk,
            and clients lose confidence in the numbers.
          </p>
          <p className="text-sm font-semibold text-gray-800">BuildSmart addresses this in two ways:</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <p className="text-sm font-bold text-gray-900">Faster quotations.</p>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-600">
                Upload a blueprint or enter quick measurements, and the system helps estimate areas, compute a Bill
                of Quantities, and generate Economic and Premium quotation options — using your own pricing rules
                and preferences.
              </p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <p className="text-sm font-bold text-gray-900">Honest market awareness.</p>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-600">
                By tracking published government price data over time, BuildSmart&apos;s AI produces a variance
                analysis that shows how material prices are actually moving. Contractors and clients get a clearer
                picture — so projects are priced fairly, for the dream home, the office, or the establishment being
                built.
              </p>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-gray-600 sm:text-base">
            We think fairer, faster estimates are a small contribution to something bigger: construction that moves
            confidently, and an industry that grows on trust.
          </p>

          <FeatureGrid />
        </SectionBand>
      </div>

      <SectionBand eyebrow="Our Principle" heading="A tool that assists — never one that guesses.">
        <div className="qg-card-glow-layer relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-[0.06]">
            <div className="qg-blob qg-blob-a" style={{ top: "-20%", left: "0%", width: "60%", height: "80%", background: "var(--brand-gradient-2)" }} />
            <div className="qg-blob qg-blob-b" style={{ bottom: "-25%", right: "0%", width: "55%", height: "75%", background: "var(--brand-gradient-1)" }} />
          </div>
          <p className="text-sm leading-relaxed text-gray-600 sm:text-base">
            BuildSmart is a decision-support tool, not a replacement for professional judgment. Every estimate it
            produces is meant to be reviewed and confirmed by the person using it.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-gray-600 sm:text-base">
            The system never invents prices, quantities, or client information. It works from real inputs — your
            measurements, your pricelists, and published reference data — and where the AI offers analysis, it
            explains its reasoning so the final call always stays with the professional. We built it this way on
            purpose: trustworthy estimates matter more than impressive-looking ones.
          </p>
        </div>
      </SectionBand>

      <SectionBand eyebrow="Who We Build With" heading="Better with the people who build." tone="tinted">
        <p className="text-sm leading-relaxed text-gray-600 sm:text-base">
          BuildSmart is designed to work <em>with</em> the construction community, not around it.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {AUDIENCE.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex flex-col gap-2.5 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <Icon className="h-5 w-5 text-primary" />
              <p className="text-sm font-bold text-gray-900">{title}</p>
              <p className="text-xs leading-relaxed text-gray-500">{body}</p>
            </div>
          ))}
        </div>
        <p className="text-sm leading-relaxed text-gray-600 sm:text-base">
          We&apos;re grateful to the professionals who share their time and insight with us. Their real-world
          feedback is what keeps BuildSmart useful rather than merely clever.
        </p>
      </SectionBand>

      <SectionBand eyebrow="Where We're Going" heading="A tool that keeps learning.">
        <p className="text-sm leading-relaxed text-gray-600 sm:text-base">
          BuildSmart is still growing. As a dedicated construction quotation tool, our goal is to keep refining how
          it estimates, how it reads the market, and how easily it fits into a contractor&apos;s day.
        </p>
        <p className="text-sm leading-relaxed text-gray-600 sm:text-base">
          We&apos;ll keep improving the system — better blueprint understanding, deeper price intelligence, and a
          smoother experience — guided by the contractors, suppliers, and estimators who work alongside us. The
          industry keeps moving. So will we.
        </p>
      </SectionBand>

      <SectionBand heading="The team behind BuildSmart" tone="tinted">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TEAM.map((member) => (
            <TeamCard key={member.name} name={member.name} role={member.role} />
          ))}
        </div>
      </SectionBand>

      <CTABand
        heading="Ready to quote smarter?"
        subtext="Start building faster, fairer construction estimates today."
        ctaHref={primaryHref}
        ctaLabel={primaryLabel}
      />
    </div>
  );
}
