"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { WorkflowHeaderProvider, useWorkflowHeaderValue } from "@/providers/WorkflowHeaderProvider";

function AppShellBody({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const workflow = useWorkflowHeaderValue();
  const isDashboard = pathname === "/dashboard";
  const [sidebarState, setSidebarState] = useState({ pathname, visible: !isDashboard });
  // Reset the default on navigation, while keeping manual toggles on this page.
  if (sidebarState.pathname !== pathname) {
    setSidebarState({ pathname, visible: !isDashboard });
  }
  const sidebarVisible = sidebarState.pathname === pathname ? sidebarState.visible : !isDashboard;
  const toggleSidebar = () => setSidebarState({ pathname, visible: !sidebarVisible });

  return (
    <div className={isDashboard ? "flex min-h-screen w-full bg-gray-50" : "flex h-screen w-full overflow-hidden bg-gray-50"}>
      <Sidebar collapsed={!sidebarVisible} onToggle={toggleSidebar} />
      <div className={isDashboard ? "min-w-0 flex-1" : "flex min-w-0 flex-1 flex-col overflow-hidden"}>
        <Header workflow={workflow} />
        {/* Keep the welcome scene on document scroll; workspace pages own their scroller. */}
        {isDashboard ? children : <main className="flex-1 overflow-y-auto p-6">{children}</main>}
      </div>
    </div>
  );
}

// 
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <WorkflowHeaderProvider>
      <AppShellBody>{children}</AppShellBody>
    </WorkflowHeaderProvider>
  );
}
