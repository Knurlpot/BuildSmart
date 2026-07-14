import Link from "next/link";
import { ChevronRight, Zap } from "lucide-react";
import { RequireOnboardingStep } from "@/components/auth/RequireOnboardingStep";
import { NAV_ITEMS } from "@/components/layout/nav-items";

export default function DashboardPage() {
  return (
    <RequireOnboardingStep minStep={2}>
      {/* Part C — Step 3 "onboarding complete" message. This page is itself gated on
          minStep=2, so reaching it at all means setup just finished (or already had). */}
      <div className="flex items-center gap-4 rounded-2xl bg-linear-to-r from-primary to-(--primary-hover) p-6 text-white shadow-md">
        <Zap className="h-10 w-10 shrink-0 opacity-90" />
        <div className="flex-1">
          <p className="text-lg font-bold">Setup complete — all features are now unlocked</p>
          <p className="text-sm opacity-80">Ready to generate your first quotation? Upload a blueprint or use quick measurement to get started.</p>
        </div>
        <Link
          href="/quotations"
          className="flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-primary hover:bg-orange-50"
        >
          Start Now <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <p className="mb-3 mt-6 text-xs font-bold uppercase tracking-wider text-gray-400">
        Select Main Function
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:border-gray-200 hover:shadow-md"
            >
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-110"
                style={{ background: `${item.color}18` }}
              >
                <Icon className="h-6 w-6" style={{ color: item.color }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-gray-900 transition-colors group-hover:text-primary">
                  {item.label}
                </p>
                <p className="truncate text-xs text-gray-400">{item.description}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
            </Link>
          );
        })}
      </div>
    </RequireOnboardingStep>
  );
}
