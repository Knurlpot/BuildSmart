"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { FullScreenSpinner } from "./FullScreenSpinner";

export function RedirectIfOnboarded({ children }: { children: React.ReactNode }) {
  const { currentUser, isLoading } = useAuth();
  const router = useRouter();
  const onboarded = !isLoading && !!currentUser && currentUser.onboardingStep >= 2;

  useEffect(() => {
    if (onboarded) {
      router.replace("/dashboard");
    }
  }, [onboarded, router]);

  if (isLoading || !currentUser || onboarded) {
    return <FullScreenSpinner />;
  }

  return <>{children}</>;
}
