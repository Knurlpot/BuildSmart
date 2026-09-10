"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { WorkflowHeaderProvider, useWorkflowHeaderValue } from "@/providers/WorkflowHeaderProvider";

function AppShellBody({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const workflow = useWorkflowHeaderValue();
  const [sidebarVisible, setSidebarVisible] = useState(false);

  const toggleSidebar = () => setSidebarVisible((visible) => !visible);

  const isDashboard = pathname === "/dashboard";

  return (
    <div className={isDashboard ? "min-h-screen w-full bg-gray-50 pl-16" : "flex h-screen w-full overflow-hidden bg-gray-50 pl-16"}>
      <div className="fixed inset-y-0 left-0 z-50 w-16">
        <Sidebar collapsed={!sidebarVisible} onToggle={toggleSidebar} />
      </div>
      <div className={isDashboard ? "min-w-0" : "flex min-w-0 flex-1 flex-col overflow-hidden"}>
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
