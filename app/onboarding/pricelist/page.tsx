"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Tag } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { resolveOnboardingRoute } from "@/lib/onboarding";
import { ContentSpinner } from "@/components/auth/ContentSpinner";

const EXPECTED_STEP = 0;

// Part D — this page no longer advances the step itself: Step 0 -> 1 now advances the
// moment a real Pricelist action (upload or fetch) succeeds on /pricelist (see
// app/(app)/pricelist/page.tsx + lib/onboarding.ts's hasCompletedPricelistStep). This is
// just the gate/CTA message — it only navigates.
export default function OnboardingPricelistPage() {
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
    // Part C — centered in the available content space, not pinned to one side.
    <div className="flex min-h-full items-center justify-center">
      <div className="flex w-full max-w-xl flex-col gap-4 rounded-2xl border-2 border-primary bg-[#fff7f0] p-8">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#10b98118]">
          <Tag className="h-7 w-7 text-[#10b981]" />
        </div>
        <p className="text-sm text-gray-600">
          Every quotation BuildSmart generates is priced against your pricelist. Upload or
          configure your regional pricelist baseline now — this is required before you can
          generate quotations.
        </p>
        <Link
          href="/pricelist"
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover)"
        >
          Continue to Pricelist Management <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
