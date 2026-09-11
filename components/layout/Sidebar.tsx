"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { Lock, LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { useWorkflowHeaderValue } from "@/providers/WorkflowHeaderProvider";
import { logoFrame } from "@/components/logo-frames";
import { NAV_ITEMS, type NavItem } from "./nav-items";

function CollapsedTooltip({ children }: { children: React.ReactNode }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-[calc(100%+0.75rem)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-xl bg-black px-3.5 py-2 text-sm font-medium leading-none text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
    >
      {children}
    </span>
  );
}

function NavRow({ item, onboardingStep, active, collapsed }: { item: NavItem; onboardingStep: number; active: boolean; collapsed: boolean }) {
  const Icon = item.icon;
  const locked = onboardingStep < item.minStep;
  const lockedLabel = `Complete setup to unlock ${item.label}`;

  if (locked) {
    return (
      <div
        aria-label={lockedLabel}
        className={`group relative flex cursor-not-allowed select-none items-center rounded-md py-2.5 text-sm font-medium text-gray-400 ${collapsed ? "justify-center px-0" : "gap-2.5 px-3"}`}
      >
        <span className="relative shrink-0"><Icon className="h-4 w-4" /><Lock className="absolute -right-1.5 -bottom-1 h-2.5 w-2.5 rounded-sm bg-white" /></span>
        {!collapsed && <span>{item.label}</span>}
        {collapsed && <CollapsedTooltip>{lockedLabel}</CollapsedTooltip>}
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={`group relative flex items-center rounded-md py-2.5 text-sm font-medium transition-colors ${collapsed ? "justify-center px-0" : "gap-2.5 px-3"} ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-gray-600 hover:bg-orange-50 hover:text-primary"
      }`}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      {!collapsed && <span>{item.label}</span>}
      {collapsed && <CollapsedTooltip>{item.label}</CollapsedTooltip>}
    </Link>
  );
}

export default function Sidebar({ collapsed = true, onToggle }: { collapsed?: boolean; onToggle?: () => void }) {
  const { currentUser, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const onboardingStep = currentUser?.onboardingStep ?? 0; 
  const workflow = useWorkflowHeaderValue();
  const compact = collapsed;

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <aside
      aria-label="Main navigation"
      onKeyDown={(event) => { if (event.key === "Escape" && !collapsed) onToggle?.(); }}
      className={`sticky top-0 z-40 flex h-dvh flex-shrink-0 flex-col border-r border-gray-200 bg-white transition-[width] duration-200 motion-reduce:transition-none ${compact ? "w-16" : "w-64"}`}
    >
      <div className={`flex h-16 shrink-0 items-center transition-colors ${workflow ? "bg-primary" : "border-b border-gray-100"}`}>
        <Link
          href="/dashboard"
          aria-label="Go to dashboard"
          className={`${compact && onToggle ? "hidden" : "flex"} h-full min-w-0 flex-1 items-center ${compact ? "justify-center px-0" : "gap-2 px-4"}`}
        >
          <Image src={logoFrame(13)} alt="" className={`h-7 w-7 shrink-0 ${workflow ? "brightness-0 invert" : ""}`} />
          {!compact && <span className={`text-base font-bold ${workflow ? "text-white" : "text-gray-900"}`}>BuildSmart</span>}
        </Link>
        {onToggle && <button
          type="button"
          onClick={onToggle}
          aria-label={compact ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!compact}
          className={`group relative flex shrink-0 items-center justify-center rounded-md ${compact ? "h-full w-full" : "mr-3 h-8 w-8"} ${workflow ? "text-white/80 hover:bg-white/15 hover:text-white" : "text-gray-500 hover:bg-orange-50 hover:text-primary"}`}
        >
          {compact ? <>
            <Image src={logoFrame(13)} alt="" className={`h-7 w-7 transition-opacity group-hover:opacity-0 group-focus-visible:opacity-0 motion-reduce:transition-none ${workflow ? "brightness-0 invert" : ""}`} />
            <PanelLeftOpen className="absolute h-5 w-5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none" />
            <CollapsedTooltip>Expand sidebar</CollapsedTooltip>
          </> : <PanelLeftClose className="h-4 w-4" />}
        </button>}
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

      <nav className={`flex flex-1 flex-col gap-0.5 overflow-visible py-3 ${compact ? "px-2" : "px-3"}`}>
        {NAV_ITEMS.map((item) => (
          <NavRow key={item.href} item={item} onboardingStep={onboardingStep} active={pathname === item.href} collapsed={compact} />
        ))}
      </nav>

      <div className="border-t border-gray-100 p-3">
        <button
          type="button"
          onClick={handleLogout}
          aria-label="Log out"
          className={`group relative flex w-full items-center rounded-md py-2.5 text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors ${compact ? "justify-center px-0" : "gap-2.5 px-3"}`}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!compact && <span>Log out</span>}
          {compact && <CollapsedTooltip>Log out</CollapsedTooltip>}
        </button>
      </div>
    </aside>
  );
}
