"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight, SlidersHorizontal } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { resolveOnboardingRoute } from "@/lib/onboarding";
import { ContentSpinner } from "@/components/auth/ContentSpinner";

const EXPECTED_STEP = 1;

export default function OnboardingPreferencesPage() {
  const { currentUser } = useAuth();
  const router = useRouter();
  const onTrack = currentUser?.onboardingStep === EXPECTED_STEP;

  useEffect(() => {
    if (currentUser && !onTrack) {
      router.replace(resolveOnboardingRoute(currentUser.onboardingStep));
    }
  }, [currentUser, onTrack, router]);

  if (!currentUser || !onTrack) {
    return <ContentSpinner />;
  }

  return (
    <div className="flex min-h-full items-center justify-center">
      <div className="flex w-full max-w-xl flex-col gap-4 rounded-2xl border-2 border-primary bg-[#fff7f0] p-8">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#4f46e518]">
          <SlidersHorizontal className="h-7 w-7 text-[#4f46e5]" />
        </div>
        <p className="text-sm text-gray-600">
          Configure your company&apos;s rules and pricing standards — material preferences,
          labor rates, and pricing strategies — so every quotation applies your markups and
          supplier preferences correctly.
        </p>
        <Link
          href="/management"
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover)"
        >
          Continue to Company Preferences &amp; Rules <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}