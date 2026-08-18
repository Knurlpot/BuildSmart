"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { useState } from "react";
import { Lock, LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { useWorkflowHeaderValue } from "@/providers/WorkflowHeaderProvider";
import { logoFrame } from "@/components/logo-frames";
import { NAV_ITEMS, type NavItem } from "./nav-items";

function NavRow({ item, onboardingStep, active, collapsed, dashboardStyle }: { item: NavItem; onboardingStep: number; active: boolean; collapsed: boolean; dashboardStyle: boolean }) {
  const Icon = item.icon;
  const locked = onboardingStep < item.minStep;

  if (locked) {
    return (
      <div
        className={`flex cursor-not-allowed select-none items-center rounded-md py-2.5 text-sm font-medium ${dashboardStyle ? "text-white/40" : "text-gray-300"} ${collapsed ? "justify-center px-0" : "gap-2.5 px-3"}`}
        title={`Complete setup to unlock ${item.label}`}
      >
        <Lock className="h-4 w-4 flex-shrink-0" />
        {!collapsed && <span>{item.label}</span>}
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={`flex items-center rounded-md py-2.5 text-sm font-medium transition-colors ${collapsed ? "justify-center px-0" : "gap-2.5 px-3"} ${
        active
          ? dashboardStyle ? "bg-white text-primary shadow-sm" : "bg-primary text-primary-foreground"
          : dashboardStyle ? "text-white/80 hover:bg-white/10 hover:text-white" : "text-gray-600 hover:bg-orange-50 hover:text-primary"
      }`}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      {!collapsed && <span>{item.label}</span>}
    </Link>
  );
}

export default function Sidebar({ collapsed = false, onToggle }: { collapsed?: boolean; onToggle?: () => void }) {
  const { currentUser, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isDashboard = pathname === "/dashboard";
  const onboardingStep = currentUser?.onboardingStep ?? 0; 
  const workflow = useWorkflowHeaderValue();
  const [hovered, setHovered] = useState(false);
  const compact = collapsed && !hovered;

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <aside
      onMouseEnter={() => collapsed && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`relative flex h-screen flex-shrink-0 flex-col shadow-[2px_0_8px_rgba(0,0,0,0.08)] transition-[width] duration-200 ${isDashboard ? "animate-brand-gradient text-white" : "bg-white"} ${compact ? "w-16" : "w-64"}`}
    >
      <div className={`flex h-16 items-center transition-colors ${workflow ? "bg-primary" : isDashboard ? "border-b border-white/15" : "border-b border-gray-100"}`}>
        <Link
          href="/dashboard"
          aria-label="Go to dashboard"
          className={`flex h-full min-w-0 flex-1 items-center ${compact ? "justify-center px-0" : "gap-2 px-4"}`}
        >
          <Image src={logoFrame(13)} alt="" className={`h-7 w-7 shrink-0 ${workflow || isDashboard ? "brightness-0 invert" : ""}`} />
          {!compact && <span className={`text-base font-bold ${workflow || isDashboard ? "text-white" : "text-gray-900"}`}>BuildSmart</span>}
        </Link>
        {!compact && onToggle && (
          <button
            type="button"
            onClick={onToggle}
            title={collapsed ? "Keep sidebar open" : "Collapse sidebar"}
            aria-label={collapsed ? "Keep sidebar open" : "Collapse sidebar"}
            className={`mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ${workflow || isDashboard ? "text-white/80 hover:bg-white/15 hover:text-white" : "text-gray-400 hover:bg-gray-100 hover:text-gray-700"}`}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        )}
      </div>

      {onboardingStep < 2 && !compact && (
        <div className="mx-3 mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-center">
          <p className="text-[9px] font-bold uppercase tracking-wider text-amber-600">
            Setup {onboardingStep}/2
          </p>
          <div className="mt-1 flex gap-1">
            <div className={`h-1 flex-1 rounded-full ${onboardingStep >= 1 ? "bg-amber-500" : "bg-amber-200"}`} />
            <div className={`h-1 flex-1 rounded-full ${onboardingStep >= 2 ? "bg-amber-500" : "bg-amber-200"}`} />
          </div>
        </div>
      )}

      <nav className={`flex flex-1 flex-col gap-0.5 overflow-y-auto py-3 ${compact ? "px-2" : "px-3"}`}>
        {NAV_ITEMS.map((item) => (
          <NavRow key={item.href} item={item} onboardingStep={onboardingStep} active={pathname === item.href} collapsed={compact} dashboardStyle={isDashboard} />
        ))}
      </nav>

      <div className={`border-t p-3 ${isDashboard ? "border-white/15" : "border-gray-100"}`}>
        <button
          type="button"
          onClick={handleLogout}
          title={compact ? "Log out" : undefined}
          aria-label="Log out"
          className={`flex w-full items-center rounded-md py-2.5 text-sm font-medium transition-colors ${compact ? "justify-center px-0" : "gap-2.5 px-3"} ${
            isDashboard
              ? "text-white/80 hover:bg-white/10 hover:text-white"
              : "text-gray-600 hover:bg-red-50 hover:text-red-600"
          }`}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!compact && <span>Log out</span>}
        </button>
      </div>
    </aside>
  );
}
