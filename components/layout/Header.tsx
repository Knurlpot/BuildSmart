"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, LogOut, User } from "lucide-react";
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
  "/account": { title: "Profile", subtitle: "Update your profile and company details" },
};

function resolveTitle(pathname: string) {
  if (STATIC_TITLES[pathname]) return STATIC_TITLES[pathname];
  const item = NAV_ITEMS.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
  if (item) return { title: item.label, subtitle: item.description };
  return { title: "BuildSmart" };
}

interface HeaderProps {
  workflow?: WorkflowHeaderState | null;
}

export default function Header({ workflow }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, logout } = useAuth();
  const { title, subtitle } = resolveTitle(pathname);

  const companyId = currentUser?.companyId;
  const companyEndpoint = companyId !== undefined && companyId !== null ? `/api/company/${companyId}` : null;
  const { data: company } = useFetch<Company>(companyEndpoint);
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
            <Link
              href="/account"
              onClick={() => setMenuOpen(false)}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-gray-600 transition hover:bg-gray-50 hover:text-primary"
            >
              <User className="h-4 w-4" /> Profile
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-2 border-t border-gray-100 px-4 py-2.5 text-left text-sm text-gray-600 transition hover:bg-red-50 hover:text-red-600"
            >
              <LogOut className="h-4 w-4" /> Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
