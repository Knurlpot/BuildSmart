"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { LogOut, Lock } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { logoFrame } from "@/components/logo-frames";
import { NAV_ITEMS, type NavItem } from "./nav-items";

function NavRow({ item, onboardingStep, active }: { item: NavItem; onboardingStep: number; active: boolean }) {
  const Icon = item.icon;
  const locked = onboardingStep < item.minStep;

  if (locked) {
    return (
      <div
        className="flex cursor-not-allowed select-none items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium text-gray-300"
        title={`Complete setup to unlock ${item.label}`}
      >
        <Lock className="h-4 w-4 flex-shrink-0" />
        <span>{item.label}</span>
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      className={`flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-gray-600 hover:bg-orange-50 hover:text-primary"
      }`}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span>{item.label}</span>
    </Link>
  );
}

export default function Sidebar() {
  const { currentUser, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const onboardingStep = currentUser?.onboardingStep ?? 0;

  const initials = currentUser?.email ? currentUser.email.slice(0, 2).toUpperCase() : "BS";

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <aside className="flex h-screen w-64 flex-shrink-0 flex-col bg-white shadow-[2px_0_8px_rgba(0,0,0,0.08)]">
      <div className="flex h-16 items-center gap-2 border-b border-gray-100 px-4">
        <Image src={logoFrame(13)} alt="" className="h-7 w-7" />
        <span className="text-base font-bold text-gray-900">BuildSmart</span>
      </div>

      {onboardingStep < 2 && (
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

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-3">
        {NAV_ITEMS.map((item) => (
          <NavRow key={item.href} item={item} onboardingStep={onboardingStep} active={pathname === item.href} />
        ))}
      </nav>

      <div className="border-t border-gray-100 px-3 py-2">
        <div className="flex items-center gap-2 rounded-lg px-2 py-2">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-gray-700">
              {currentUser?.email?.split("@")[0] ?? "User"}
            </p>
            <p className="truncate text-[10px] text-gray-400">
              {onboardingStep >= 2 ? "Active" : "Setting up…"}
            </p>
          </div>
          <button
            onClick={handleLogout}
            title="Log out"
            className="flex-shrink-0 rounded p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-500"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
