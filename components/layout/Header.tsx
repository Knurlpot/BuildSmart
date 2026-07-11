"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
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
  const initials = currentUser?.email ? currentUser.email.slice(0, 2).toUpperCase() : "BS";

  return (
    <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 shadow-sm">
      <div>
        <h1 className="text-base font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
          {initials}
        </div>
        <div>
          <p className="text-xs font-semibold leading-tight text-gray-800">
            {currentUser?.email?.split("@")[0] ?? "User"}
          </p>
          <p className="text-[10px] text-gray-500">{currentUser?.email ?? ""}</p>
        </div>
      </div>
    </header>
  );
}
