"use client";

// Dual-mode feature cards — sourced from the SAME NAV_ITEMS the real in-app sidebar reads
// (components/layout/nav-items.ts), so label/description/icon/route here can never drift
// from what the actual product does. "Account & Company Profile" is excluded — it isn't a
// module BuildSmart's marketing copy talks about, it's account admin.
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { resolveFeatureHref } from "@/lib/marketing";

const EXCLUDED_HREFS = new Set(["/account"]);
const FEATURE_ITEMS = NAV_ITEMS.filter((item) => !EXCLUDED_HREFS.has(item.href));

export function FeatureGrid() {
  const { isAuthenticated, currentUser } = useAuth();

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURE_ITEMS.map((item) => {
          const Icon = item.icon;
          const href = resolveFeatureHref(item, isAuthenticated, currentUser);
          return (
            <Link
              key={item.href}
              href={href}
              className="group flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${item.color}1a`, color: item.color }}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">{item.label}</p>
                <p className="mt-0.5 text-xs text-gray-500">{item.description}</p>
              </div>
              <span className="mt-auto flex items-center gap-1 text-xs font-semibold text-primary opacity-0 transition group-hover:opacity-100">
                {isAuthenticated ? "Open" : "Get started"} <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
          );
        })}
      </div>
      {!isAuthenticated && (
        <p className="text-center text-xs text-gray-400">Sign up to unlock the full platform — every module above is part of one account.</p>
      )}
    </div>
  );
}
