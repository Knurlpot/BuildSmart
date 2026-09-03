"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/providers/AuthProvider";
import { useFetch } from "@/hooks/useFetch";
import type { Company, Users } from "@/types/entities";
import { logoFrame } from "@/components/logo-frames";
import type { WorkflowHeaderState } from "@/providers/WorkflowHeaderProvider";
import { NAV_ITEMS } from "./nav-items";
import WorkflowStepper from "./WorkflowStepper";

const STATIC_TITLES: Record<string, { title: string; subtitle?: string }> = {
  "/dashboard": { title: "Dashboard" },
  "/onboarding/pricelist": { title: "Setup: Step 1 of 2", subtitle: "Set up your pricelist" },
  "/onboarding/preferences": {
    title: "Setup: Step 2 of 2",
    subtitle: "Set your company preferences and rules",
  },
  // No longer in NAV_ITEMS (the sidebar/dashboard tab was removed in favor of
  // the header dropdown link below), so resolveTitle's NAV_ITEMS lookup can't
  // find this page's title/subtitle anymore — pinned here instead.
  "/account": { title: "Profile" },
};

function resolveTitle(pathname: string) {
  if (STATIC_TITLES[pathname]) return STATIC_TITLES[pathname];
  if (pathname !== "/quotations/new" && /^\/quotations\/[^/]+$/.test(pathname)) return { title: "Open Projects" };
  if (/^\/clients\/[^/]+$/.test(pathname)) return { title: "Open Projects" };
  const item = NAV_ITEMS.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
  if (item) return { title: item.label, subtitle: item.description };
  return { title: "BuildSmart" };
}

interface HeaderProps {
  workflow?: WorkflowHeaderState | null;
}

export default function Header({ workflow }: HeaderProps) {
  const pathname = usePathname();
  const { currentUser } = useAuth();
  const { title, subtitle } = resolveTitle(pathname);
  const isDashboard = pathname === "/dashboard";
  const lightHeaderContent = Boolean(workflow) || isDashboard;

  const companyId = currentUser?.companyId;
  const companyEndpoint = companyId !== undefined && companyId !== null ? `/api/company/${companyId}` : null;
  const { data: company, refetch: refetchCompany } = useFetch<Company>(companyEndpoint);
  const { data: profile, refetch: refetchProfile } = useFetch<Users>("/api/auth/me");

  const companyName = company?.company_name || "BuildSmart";
  const fullName = profile
    ? [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(" ")
    : (currentUser?.email?.split("@")[0] ?? "User");
  const profileInitials = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).map((name) => name.charAt(0)).join("").slice(0, 2).toUpperCase()
    : fullName.slice(0, 2).toUpperCase();

  useEffect(() => {
    const refreshUser = () => refetchProfile();
    const refreshCompany = () => refetchCompany();
    window.addEventListener("user-profile-updated", refreshUser);
    window.addEventListener("company-profile-updated", refreshCompany);
    return () => {
      window.removeEventListener("user-profile-updated", refreshUser);
      window.removeEventListener("company-profile-updated", refreshCompany);
    };
  }, [refetchCompany, refetchProfile]);

  return (
    <header
      className={`flex h-16 shrink-0 items-center justify-between gap-4 px-6 transition-colors ${
        workflow
          ? "bg-primary shadow-md qg-header-shimmer"
          : isDashboard
            ? "animate-brand-gradient border-b border-white/15 shadow-md"
            : "border-b border-gray-200 bg-white shadow-sm"
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {workflow ? (
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div className="flex shrink-0 items-center gap-1.5 rounded-md bg-white/15 px-2 py-1">
              <Image src={logoFrame(13)} alt="" className="h-3.5 w-3.5 brightness-0 invert" />
              <span className="text-[10px] font-extrabold uppercase tracking-wide text-white">{workflow.label}</span>
            </div>
            <div className="hidden h-5 w-px shrink-0 bg-white/20 sm:block" />
            <WorkflowStepper steps={workflow.steps} currentStep={workflow.currentStep} />
          </div>
        ) : (
          <div>
            <h1 className={`text-base font-bold ${isDashboard ? "text-white" : "text-gray-900"}`}>{title}</h1>
            {subtitle && <p className={`text-xs ${isDashboard ? "text-white/70" : "text-gray-500"}`}>{subtitle}</p>}
          </div>
        )}
      </div>

      <div className="relative shrink-0">
        <Link
          href="/account"
          className={`flex items-center gap-2 rounded-xl px-2 py-1.5 transition ${
            lightHeaderContent ? "hover:bg-white/10" : "hover:bg-gray-50"
          }`}
          title="Profile"
          aria-label="Open profile"
        >
          {company?.company_logo && (
            // eslint-disable-next-line @next/next/no-img-element -- company logos may use uploaded or external URLs
            <img
              src={company.company_logo}
              alt={`${companyName} logo`}
              className={`h-9 w-9 shrink-0 rounded-lg bg-white object-contain p-0.5 ${
                lightHeaderContent ? "border-2 border-white/40" : "border border-gray-100"
              }`}
            />
          )}
          {profile?.profile_picture ? (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary external URL, not a static asset
            <img
              src={profile.profile_picture}
              alt=""
              className={`h-9 w-9 shrink-0 rounded-full object-cover ${lightHeaderContent ? "border-2 border-white/40" : "border border-gray-100"}`}
            />
          ) : (
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                lightHeaderContent ? "bg-white text-primary" : "bg-primary text-primary-foreground"
              }`}
            >
              {profileInitials}
            </div>
          )}
          <div className="text-left">
            <p className={`text-xs font-semibold leading-tight ${lightHeaderContent ? "text-white" : "text-gray-800"}`}>{fullName}</p>
            <p className={`text-[10px] ${lightHeaderContent ? "text-white/70" : "text-gray-500"}`}>{companyName}</p>
          </div>
        </Link>
      </div>
    </header>
  );
}
