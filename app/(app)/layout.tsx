import { RequireAuth } from "@/components/auth/RequireAuth";
import { AppShell } from "@/components/layout";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
