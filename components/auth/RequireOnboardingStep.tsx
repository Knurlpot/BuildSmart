"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { resolveOnboardingRoute } from "@/lib/onboarding";
import { ContentSpinner } from "./ContentSpinner";

interface RequireOnboardingStepProps {
  minStep: number;
  children: React.ReactNode;
}

export function RequireOnboardingStep({ minStep, children }: RequireOnboardingStepProps) {
  const { currentUser, isLoading } = useAuth();
  const router = useRouter();
  const incomplete = !isLoading && !!currentUser && currentUser.onboardingStep < minStep;

  useEffect(() => {
    if (incomplete && currentUser) {
      router.replace(resolveOnboardingRoute(currentUser.onboardingStep));
    }
  }, [incomplete, currentUser, router]);

  if (isLoading || !currentUser || incomplete) {
    return <ContentSpinner />;
  }

  return <>{children}</>;
}
