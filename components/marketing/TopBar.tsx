"use client";

import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/providers/AuthProvider";
import { logoFrame } from "@/components/logo-frames";
import { resolvePrimaryCta } from "@/lib/marketing";

// Plain marketing nav for a logged-out visitor (no app-module links — those live in the
// FeatureGrid/Hero CTA below, this bar is just wayfinding). A logged-in visitor gets a
// quiet "Back to Dashboard" instead — the real navigation for them is the SidebarPeek.
export function TopBar() {
  const { isAuthenticated, currentUser } = useAuth();

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-gray-100 bg-white/90 px-6 backdrop-blur sm:px-10">
      <Link href="/" className="flex items-center gap-2">
        <Image src={logoFrame(13)} alt="" className="h-7 w-7" />
        <span className="text-base font-bold text-gray-900">BuildSmart</span>
      </Link>
      {isAuthenticated ? (
        <Link href={resolvePrimaryCta(isAuthenticated, currentUser)} className="text-sm font-semibold text-gray-600 transition hover:text-primary">
          Back to Dashboard
        </Link>
      ) : (
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm font-semibold text-gray-600 transition hover:text-primary">
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover)"
          >
            Get Started
          </Link>
        </div>
      )}
    </header>
  );
}
