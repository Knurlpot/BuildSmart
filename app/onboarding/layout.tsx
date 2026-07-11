import { RequireAuth } from "@/components/auth/RequireAuth";
import { RedirectIfOnboarded } from "@/components/auth/RedirectIfOnboarded";
import { AppShell } from "@/components/layout";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <RedirectIfOnboarded>
        <AppShell>{children}</AppShell>
      </RedirectIfOnboarded>
    </RequireAuth>
  );
}
