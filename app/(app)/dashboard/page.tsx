"use client";

import Link from "next/link";
import { CalendarDays, CheckCircle2, ChevronRight, FileText, Zap } from "lucide-react";
import { RequireOnboardingStep } from "@/components/auth/RequireOnboardingStep";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { useFetch } from "@/hooks/useFetch";
import { useAuth } from "@/providers/AuthProvider";
import type { Quotation } from "@/types/entities";

function formatActivityDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

interface DashboardActivity {
  activity_id: string;
  activity_type: "quotation";
  title: string;
  status: string;
  occurred_at: string;
}

function activityStatusLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

export default function DashboardPage() {
  const { currentUser } = useAuth();
  const { data: quotations, isLoading, error } = useFetch<Quotation[]>("/api/quotations");
  const {
    data: activities,
    isLoading: isActivityLoading,
    error: activityError,
  } = useFetch<DashboardActivity[]>("/api/dashboard/activity");
  const firstName = currentUser?.email?.split("@")[0] || "there";
  const now = new Date();
  const quotationsThisMonth = (quotations ?? []).filter((quotation) => {
    const created = new Date(quotation.created_at);
    return created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth();
  }).length;
  const setupProgress = Math.min(100, Math.round(((currentUser?.onboardingStep ?? 0) / 2) * 100));

  return (
    <RequireOnboardingStep minStep={2}>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Hi, {firstName}!</h1>
        <p className="mt-1 text-sm text-gray-500">Here is what is happening with your construction estimates.</p>
      </div>

      <div className="flex items-center gap-4 rounded-2xl bg-linear-to-r from-primary to-(--primary-hover) p-6 text-white shadow-md">
        <Zap className="h-10 w-10 shrink-0 opacity-90" />
        <div className="flex-1">
          <p className="text-lg font-semibold">Setup complete. All features are now unlocked.</p>
          <p className="text-sm opacity-80">Ready to generate your first quotation? Upload a blueprint or use quick measurement to get started.</p>
        </div>
        <Link
          href="/quotations"
          className="flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-primary hover:bg-orange-50"
        >
          Start Now <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <p className="mb-3 mt-6 text-xs font-semibold uppercase tracking-wider text-gray-400">
        Overview
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-medium text-gray-900">Project Summary</h2>
              <p className="mt-1 text-sm text-gray-500">Current quotation and setup progress</p>
            </div>
            <CalendarDays className="h-6 w-6 shrink-0 text-primary" />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-orange-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">This Month</p>
              <p className="mt-2 text-2xl font-semibold text-gray-900">{isLoading ? "..." : error ? "--" : quotationsThisMonth}</p>
              <p className="mt-1 text-sm text-gray-500">{error ? "Summary unavailable" : "Quotations created"}</p>
            </div>
            <div className="rounded-xl border border-gray-100 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Setup</p>
                <span className="text-sm font-medium text-primary">{setupProgress}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-primary" style={{ width: `${setupProgress}%` }} />
              </div>
              <p className="mt-3 text-sm text-gray-500">Company setup complete</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-medium text-gray-900">Recent Activity</h2>
              <p className="mt-1 text-sm text-gray-500">Your latest quotations</p>
            </div>
            <FileText className="h-6 w-6 shrink-0 text-primary" />
          </div>

          <div className="mt-4 divide-y divide-gray-100">
            {isActivityLoading && <p className="py-5 text-sm text-gray-400">Loading recent activity...</p>}
            {!isActivityLoading && activityError && <p className="py-5 text-sm text-gray-500">Recent activity is unavailable.</p>}
            {!isActivityLoading && !activityError && (activities ?? []).length === 0 && (
              <p className="py-5 text-sm text-gray-400">No quotation projects yet.</p>
            )}
            {!isActivityLoading && !activityError && (activities ?? []).map((activity) => (
              <Link
                key={`${activity.activity_type}-${activity.activity_id}`}
                href={`/quotations/${activity.activity_id}`}
                className="flex items-center gap-3 py-3 transition-colors hover:text-primary"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-primary">
                  {activity.status === "Final" ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{activity.title}</p>
                  <p className="text-xs text-gray-400">{formatActivityDate(activity.occurred_at)}</p>
                </div>
                <span className="text-xs font-medium text-gray-400">{activityStatusLabel(activity.status)}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <p className="mb-3 mt-6 text-xs font-semibold uppercase tracking-wider text-gray-400">
        Select Main Function
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:border-gray-200 hover:shadow-md sm:last:col-span-2"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-primary transition-transform group-hover:scale-110">
                <Icon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900 transition-colors group-hover:text-primary">
                  {item.label}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
            </Link>
          );
        })}
      </div>
    </RequireOnboardingStep>
  );
}
