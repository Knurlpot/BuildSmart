"use client";

import Sidebar from "./Sidebar";
import Header from "./Header";
import { WorkflowHeaderProvider, useWorkflowHeaderValue } from "@/providers/WorkflowHeaderProvider";

// Split so `useWorkflowHeaderValue` has a Provider above it — AppShell itself owns that
// Provider (see below) rather than requiring every page to set one up.
function AppShellBody({ children }: { children: React.ReactNode }) {
  const workflow = useWorkflowHeaderValue();
  return (
    <div className="flex h-screen w-full overflow-hidden bg-gray-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header workflow={workflow} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}

// Bridges a deeply-nested workflow's registered step state (see
// providers/WorkflowHeaderProvider.tsx) up to the layout-level Header, without every page in
// between needing to know this exists. Pages that never call useWorkflowHeader() render
// exactly as before — `workflow` just stays null and Header falls back to its normal props.
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <WorkflowHeaderProvider>
      <AppShellBody>{children}</AppShellBody>
    </WorkflowHeaderProvider>
  );
}
