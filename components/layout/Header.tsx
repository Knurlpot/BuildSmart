"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { useFetch } from "@/hooks/useFetch";
import type { Company } from "@/types/entities";
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

export default function Header() {
  const pathname = usePathname();
  const { currentUser } = useAuth();
  const { title, subtitle } = resolveTitle(pathname);

  // Same endpoint/contract CompanySection on the Account page already relies on
  // (app/(app)/account/page.tsx) — reused here rather than guessing at a new
  // "company summary embedded in /api/auth/me" shape.
  const companyId = currentUser?.companyId;
  const endpoint = companyId !== undefined && companyId !== null ? `/api/company/${companyId}` : null;
  const { data: company } = useFetch<Company>(endpoint);

  const companyName = company?.company_name || "BuildSmart";
  const initials = companyName.slice(0, 2).toUpperCase();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 shadow-sm">
      <div>
        <h1 className="text-base font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        {company?.company_logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary external URL, not a static asset
          <img
            src={company.company_logo}
            alt=""
            className="h-9 w-9 rounded-full border border-gray-100 object-cover"
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
            {initials}
          </div>
        )}
        <div>
          <p className="text-xs font-semibold leading-tight text-gray-800">{companyName}</p>
          <p className="text-[10px] text-gray-500">{company?.contact_email ?? ""}</p>
        </div>
      </div>
    </header>
  );
}