"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { resolveOnboardingRoute } from "@/lib/onboarding";
import { ContentSpinner } from "@/components/auth/ContentSpinner";

const EXPECTED_STEP = 1;

export default function OnboardingPreferencesPage() {
  const { currentUser, updateOnboardingStep } = useAuth();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const onTrack = currentUser?.onboardingStep === EXPECTED_STEP;

  useEffect(() => {
    if (currentUser && !onTrack) {
      router.replace(resolveOnboardingRoute(currentUser.onboardingStep));
    }
  }, [currentUser, onTrack, router]);

  if (!currentUser || !onTrack) {
    return <ContentSpinner />;
  }

  const handleContinue = async () => {
    setSubmitting(true);
    await updateOnboardingStep(2);
    router.push("/dashboard");
  };

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 rounded-2xl border-2 border-primary bg-[#fff7f0] p-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#4f46e518]">
        <SlidersHorizontal className="h-7 w-7 text-[#4f46e5]" />
      </div>
      <p className="text-sm text-gray-600">
        Configure your company rules — material preferences, labor rates, and pricing
        strategies — so every quotation applies your markups and supplier preferences correctly.
      </p>
      <button
        type="button"
        disabled={submitting}
        onClick={handleContinue}
        className="mt-2 w-fit rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60"
      >
        {submitting ? "Saving…" : "Complete Setup"}
      </button>
    </div>
  );
}
