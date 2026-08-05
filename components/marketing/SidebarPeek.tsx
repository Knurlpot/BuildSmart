"use client";

// Hidden-by-default sidebar that peeks a handle at the screen edge; clicking it slides the
// panel into place via the .about-sidebar-peek/.about-sidebar-peek-open CSS transition
// (app/globals.css) — the panel is `fixed`, so it overlays rather than reflowing the page.
//
// LOGGED-OUT: renders nothing at all (flagged decision — see the task summary). A sidebar
// full of app-module links that all just bounce to /signup would duplicate the Hero/
// FeatureGrid CTAs already on the page and reads like a fake app shell to a visitor with
// no account; a visitor gets a plain marketing top bar instead (see page.tsx).
//
// LOGGED-IN: lists the SAME NAV_ITEMS the real in-app Sidebar (components/layout/
// Sidebar.tsx) reads, styled to match it (lock badge for still-gated modules). Unlike that
// real sidebar, a locked item here still navigates — through the same resolveFeatureHref
// every other link on this page uses — rather than sitting inert, since a visitor landing
// on About Us mid-setup is better served by a path forward than a dead lock icon.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight, Lock } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { logoFrame } from "@/components/logo-frames";
import { resolveFeatureHref } from "@/lib/marketing";

export function SidebarPeek() {
  const { isAuthenticated, currentUser } = useAuth();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointer = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  if (!isAuthenticated || !currentUser) return null;
  const onboardingStep = currentUser.onboardingStep;

  return (
    <div
      ref={panelRef}
      className={`about-sidebar-peek fixed inset-y-0 left-0 z-40 w-72 ${open ? "about-sidebar-peek-open" : ""}`}
    >
      <div className="relative flex h-full flex-col border-r border-gray-100 bg-white shadow-2xl">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close navigation" : "Open navigation"}
          className="absolute left-full top-1/2 flex h-16 w-8 -translate-y-1/2 items-center justify-center rounded-r-xl bg-primary text-white shadow-lg transition hover:bg-(--primary-hover)"
        >
          <ChevronRight className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        <div className="flex h-16 shrink-0 items-center gap-2 border-b border-gray-100 px-4">
          <Image src={logoFrame(13)} alt="" className="h-7 w-7" />
          <span className="text-base font-bold text-gray-900">BuildSmart</span>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-3">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const locked = onboardingStep < item.minStep;
            return (
              <Link
                key={item.href}
                href={resolveFeatureHref(item, isAuthenticated, currentUser)}
                onClick={() => setOpen(false)}
                title={locked ? `Complete setup to unlock ${item.label}` : undefined}
                className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-orange-50 hover:text-primary"
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1">{item.label}</span>
                {locked && <Lock className="h-3 w-3 flex-shrink-0 text-gray-300" />}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
