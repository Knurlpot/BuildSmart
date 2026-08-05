"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Info, LogOut } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { useFetch } from "@/hooks/useFetch";
import type { Company, Users } from "@/types/entities";
import { logoFrame } from "@/components/logo-frames";
import type { WorkflowHeaderState } from "@/providers/WorkflowHeaderProvider";
import { NAV_ITEMS } from "./nav-items";
import WorkflowStepper from "./WorkflowStepper";

const STATIC_TITLES: Record<string, { title: string; subtitle?: string }> = {
  "/dashboard": { title: "Dashboard", subtitle: "Select a function to get started" },
  "/onboarding/pricelist": { title: "Setup — Step 1 of 2", subtitle: "Set up your pricelist" },
  "/onboarding/preferences": {
    title: "Setup — Step 2 of 2",
    subtitle: "Set your company preferences and rules",
  },
};

function resolveTitle(pathname: string) {
  if (STATIC_TITLES[pathname]) return STATIC_TITLES[pathname];
  const item = NAV_ITEMS.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
  if (item) return { title: item.label, subtitle: item.description };
  return { title: "BuildSmart" };
}

interface HeaderProps {
  /** OPTIONAL — absent renders the header exactly as it always has (white, page title,
   * no steps). Present inverts the whole bar to the brand orange with the workflow's
   * module label + path-aware step sequence in place of the page title. Set via
   * providers/WorkflowHeaderProvider.tsx (AppShell bridges it in as this prop) — a
   * workflow registers it with useWorkflowHeader() for as long as it stays mounted. */
  workflow?: WorkflowHeaderState | null;
}

// Part B — the ONE profile widget in the app (the sidebar's copy was removed). Logo as
// avatar, user's name as the primary line, company name underneath, Logout lives in the
// dropdown this opens.
export default function Header({ workflow }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, logout } = useAuth();
  const { title, subtitle } = resolveTitle(pathname);

  // Same endpoint/contract CompanySection on the Account page already relies on
  // (app/(app)/account/page.tsx) — reused here rather than guessing at a new
  // "company summary embedded in /api/auth/me" shape.
  const companyId = currentUser?.companyId;
  const companyEndpoint = companyId !== undefined && companyId !== null ? `/api/company/${companyId}` : null;
  const { data: company } = useFetch<Company>(companyEndpoint);
  // Same "/api/auth/me" contract the Account page's UserSection relies on — the minimal
  // AuthUser shape from AuthProvider deliberately doesn't carry name/role.
  const { data: profile } = useFetch<Users>("/api/auth/me");

  const companyName = company?.company_name || "BuildSmart";
  const companyInitials = companyName.slice(0, 2).toUpperCase();
  const fullName = profile
    ? [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(" ")
    : (currentUser?.email?.split("@")[0] ?? "User");

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <header
      className={`flex h-16 shrink-0 items-center justify-between gap-4 px-6 transition-colors ${
        workflow ? "bg-primary shadow-md qg-header-shimmer" : "border-b border-gray-200 bg-white shadow-sm"
      }`}
    >
      {/* Part A — `gap-4` here (not just justify-between, which only spaces things out when
          there's room to spare) is what guarantees real breathing room between the
          workflow stepper and the username widget at narrow widths: flexbox gap is enforced
          even while the stepper's flex-1 box is being squeezed down, so its own
          overflow-hidden clips a few px short of the avatar instead of stopping exactly
          at it. See WorkflowStepper.tsx for the step-windowing itself. */}
      {workflow ? (
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className="flex shrink-0 items-center gap-1.5 rounded-md bg-white/15 px-2 py-1">
            {/* Logo "inverts" via brightness-0 invert — the SVG's own brand-orange fill
                would disappear against this same orange header, so it's forced to solid
                white here rather than needing a separate logo asset. Same trick used in
                Sidebar.tsx's logo cell, which turns orange too (Part A) so the whole bar
                — sidebar corner included — reads as one continuous strip. */}
            <Image src={logoFrame(13)} alt="" className="h-3.5 w-3.5 brightness-0 invert" />
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-white">{workflow.label}</span>
          </div>
          <div className="hidden h-5 w-px shrink-0 bg-white/20 sm:block" />
          {/* No overflow-x-auto here — WorkflowStepper only ever receives the ACTIVE
              part's steps (see workflowSteps.ts's Part 1 / Part 2 split), so it's sized
              to always fit without needing to scroll. */}
          <WorkflowStepper steps={workflow.steps} currentStep={workflow.currentStep} />
        </div>
      ) : (
        <div>
          <h1 className="text-base font-bold text-gray-900">{title}</h1>
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
      )}

      <div ref={menuRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className={`flex items-center gap-2 rounded-xl px-2 py-1.5 transition ${
            workflow ? "hover:bg-white/10" : "hover:bg-gray-50"
          }`}
        >
          {company?.company_logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary external URL, not a static asset
            <img
              src={company.company_logo}
              alt=""
              className={`h-9 w-9 shrink-0 rounded-full object-cover ${workflow ? "border-2 border-white/40" : "border border-gray-100"}`}
            />
          ) : (
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                workflow ? "bg-white text-primary" : "bg-primary text-primary-foreground"
              }`}
            >
              {companyInitials}
            </div>
          )}
          <div className="text-left">
            <p className={`text-xs font-semibold leading-tight ${workflow ? "text-white" : "text-gray-800"}`}>{fullName}</p>
            <p className={`text-[10px] ${workflow ? "text-white/70" : "text-gray-500"}`}>{companyName}</p>
          </div>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 transition-transform ${workflow ? "text-white/70" : "text-gray-400"} ${menuOpen ? "rotate-180" : ""}`}
          />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full z-10 mt-2 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
            {/* Routes to /about — outside the (app) guard, so it renders the same
                logged-in/"secondary dashboard" view this dropdown lives inside of. */}
            <Link
              href="/about"
              onClick={() => setMenuOpen(false)}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-gray-600 transition hover:bg-orange-50 hover:text-primary"
            >
              <Info className="h-4 w-4" /> About Us
            </Link>
            <div className="border-t border-gray-100" />
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-gray-600 transition hover:bg-red-50 hover:text-red-600"
            >
              <LogOut className="h-4 w-4" /> Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
