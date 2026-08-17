"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { WorkflowHeaderProvider, useWorkflowHeaderValue } from "@/providers/WorkflowHeaderProvider";

function AppShellBody({ children }: { children: React.ReactNode }) {
  const workflow = useWorkflowHeaderValue();
  const [sidebarVisible, setSidebarVisible] = useState(true);

  const toggleSidebar = () => setSidebarVisible((visible) => !visible);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-gray-50">
      <Sidebar collapsed={!sidebarVisible} onToggle={toggleSidebar} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header workflow={workflow} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
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
