"use client";

import { RecoveryScreen } from "@/components/feedback/RecoveryScreen";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RecoveryScreen retry={reset} />;
}
