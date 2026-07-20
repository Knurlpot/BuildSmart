"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, LogOut } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { useFetch } from "@/hooks/useFetch";
import type { Company, Users } from "@/types/entities";
import { NAV_ITEMS } from "./nav-items";

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

function normalizeLogoUrl(value?: string | null): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
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

function getLogoCandidates(value?: string | null): string[] {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return [];

  const direct = normalizeLogoUrl(trimmed);
  const legacySvgProxy =
    direct.startsWith("/uploads/") && direct.toLowerCase().endsWith(".svg+xml")
      ? `/api/uploads/company-logo/legacy?path=${encodeURIComponent(direct)}`
      : "";
  const fileName = trimmed.split("/").filter(Boolean).pop() ?? "";
  const fallbackFromFileName = fileName ? `/uploads/company-logos/${fileName}` : "";

  return [...new Set([legacySvgProxy, direct, fallbackFromFileName].filter(Boolean))];
}


export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, logout } = useAuth();
  const { title, subtitle } = resolveTitle(pathname);
  const companyId = currentUser?.companyId;
  const companyEndpoint = companyId !== undefined && companyId !== null ? `/api/company/${companyId}` : null;
  const { data: company, refetch: refetchCompany } = useFetch<Company>(companyEndpoint);
  const { data: profile } = useFetch<Users>("/api/auth/me");
  const companyName = company?.company_name || "BuildSmart";
  const companyInitials = companyName.slice(0, 2).toUpperCase();
  const fullName = profile
    ? [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(" ")
    : (currentUser?.email?.split("@")[0] ?? "User");
  const logoCandidates = getLogoCandidates(company?.company_logo);

  const [menuOpen, setMenuOpen] = useState(false);
  const [logoIndex, setLogoIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLogoIndex(0);
  }, [company?.company_logo]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  useEffect(() => {
    const handleCompanyProfileUpdated = () => {
      refetchCompany();
    };
    window.addEventListener("company-profile-updated", handleCompanyProfileUpdated);
    return () => window.removeEventListener("company-profile-updated", handleCompanyProfileUpdated);
  }, [refetchCompany]);

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 shadow-sm">
      <div>
        <h1 className="text-base font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>

      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition hover:bg-gray-50"
        >
          {logoCandidates[logoIndex] ? (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary external URL, not a static asset
            <img
              src={logoCandidates[logoIndex]}
              alt=""
              className="h-9 w-9 shrink-0 rounded-full border border-gray-100 object-cover"
              onError={() => {
                setLogoIndex((current) => (current + 1 < logoCandidates.length ? current + 1 : current));
              }}
            />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {companyInitials}
            </div>
          )}
          <div className="text-left">
            <p className="text-xs font-semibold leading-tight text-gray-800">{fullName}</p>
            <p className="text-[10px] text-gray-500">{companyName}</p>
          </div>
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${menuOpen ? "rotate-180" : ""}`} />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full z-10 mt-2 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
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