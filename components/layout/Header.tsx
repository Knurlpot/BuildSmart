"use client";

import { useEffect, useState } from "react";
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

function normalizeUploadedImageUrl(value?: string | null): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  if (trimmed.startsWith("public/")) return normalizeUploadedImageUrl(trimmed.slice("public".length));
  if (trimmed.startsWith("/public/")) return normalizeUploadedImageUrl(trimmed.slice("/public".length));
  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:")
  ) {
    return trimmed;
  }
  return `/${trimmed.replace(/^\/+/, "")}`;
}

interface HeaderProps {
  workflow?: WorkflowHeaderState | null;
}

function HeaderUploadedImage({
  src,
  alt,
  className,
  fallback,
}: {
  src: string;
  alt: string;
  className: string;
  fallback: React.ReactNode;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) return fallback;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- uploaded images may be local or external URLs
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

export default function Header({ workflow }: HeaderProps) {
  const pathname = usePathname();
  const { currentUser } = useAuth();
  const { title, subtitle } = resolveTitle(pathname);
  const isDashboard = pathname === "/dashboard";
  const lightHeaderContent = Boolean(workflow);

  const companyId = currentUser?.companyId;
  const companyEndpoint = companyId !== undefined && companyId !== null ? `/api/company/${companyId}` : null;
  const { data: company, refetch: refetchCompany } = useFetch<Company>(companyEndpoint);
  const { data: profile, refetch: refetchProfile } = useFetch<Users>("/api/auth/me");

  const companyName = company?.company_name || "BuildSmart";
  const companyLogoSrc = normalizeUploadedImageUrl(company?.company_logo);
  const profilePictureSrc = normalizeUploadedImageUrl(profile?.profile_picture);
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
      data-app-header
      className={`flex min-h-16 shrink-0 items-center justify-between gap-2 px-3 py-1 sm:gap-4 sm:px-6 ${isDashboard ? "sticky top-0 z-40 flex-wrap" : "h-16"} transition-colors ${
        workflow
          ? "bg-primary shadow-md qg-header-shimmer"
          : isDashboard
            ? "border-b border-gray-200 bg-white/95 shadow-sm backdrop-blur-md"
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
        ) : isDashboard ? null : (
          <div>
            <h1 className={`text-base font-bold ${isDashboard ? "text-white" : "text-gray-900"}`}>{title}</h1>
            {subtitle && <p className={`text-xs ${isDashboard ? "text-white/70" : "text-gray-500"}`}>{subtitle}</p>}
          </div>
        )}
      </div>

      <div className="relative shrink-0">
        <Link
          href="/account"
          className="flex items-center transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          title="Profile"
          aria-label={`Open ${fullName}'s profile for ${companyName}`}
        >
          <div className={`${isDashboard ? "hidden sm:flex" : "flex"} min-w-0 items-center gap-2.5 px-1 pr-3`}>
            {companyLogoSrc ? (
              <HeaderUploadedImage
                src={companyLogoSrc}
                alt={`${companyName} logo`}
                className={`h-9 w-9 shrink-0 rounded-full bg-white object-contain p-0.5 ${
                  lightHeaderContent ? "ring-2 ring-white/40" : "ring-1 ring-gray-200"
                }`}
                fallback={
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${lightHeaderContent ? "bg-white text-primary" : "bg-orange-50 text-primary"}`}>
                    {companyName.slice(0, 2).toUpperCase()}
                  </div>
                }
              />
            ) : (
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${lightHeaderContent ? "bg-white text-primary" : "bg-orange-50 text-primary"}`}>
                {companyName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="hidden min-w-0 text-left sm:block">
              <p className={`${isDashboard ? "max-w-24 lg:max-w-44" : "max-w-44"} truncate text-xs font-bold leading-tight ${lightHeaderContent ? "text-white" : "text-gray-900"}`}>
                {companyName}
              </p>
              <p className={`mt-0.5 text-[9px] font-semibold uppercase tracking-wider ${lightHeaderContent ? "text-white/65" : "text-gray-400"}`}>
                Company
              </p>
            </div>
          </div>
          <div className={`${isDashboard ? "hidden sm:block" : ""} h-7 w-px shrink-0 ${lightHeaderContent ? "bg-white/25" : "bg-gray-200"}`} />
          <div className={isDashboard ? "sm:pl-2" : "pl-2"}>
            {profilePictureSrc ? (
              <HeaderUploadedImage
                src={profilePictureSrc}
                alt={`${fullName} profile`}
                className={`h-10 w-10 shrink-0 rounded-full object-cover ${lightHeaderContent ? "ring-2 ring-white/40" : "ring-2 ring-white shadow-sm"}`}
                fallback={
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${lightHeaderContent ? "bg-white text-primary" : "bg-primary text-primary-foreground"}`}>
                    {profileInitials}
                  </div>
                }
              />
            ) : (
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${lightHeaderContent ? "bg-white text-primary" : "bg-primary text-primary-foreground"}`}>
                {profileInitials}
              </div>
            )}
          </div>
        </Link>
      </div>
      {isDashboard && <span aria-hidden="true" data-reading-progress className="pointer-events-none absolute inset-x-0 bottom-0 h-px origin-left bg-primary" style={{ transform: "scaleX(var(--reading-progress, 0))" }} />}
    </header>
  );
}
