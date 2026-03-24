"use client";

import { type ReactNode } from "react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

interface DashboardLayoutProps {
  dataWidgets: ReactNode;
  agentPanel: ReactNode;
}

export default function DashboardLayout({
  dataWidgets,
  agentPanel,
}: DashboardLayoutProps) {
  return (
    <>
      {/* Desktop: resizable horizontal panels */}
      <div className="hidden xl:block">
        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-[calc(100vh-5rem)]"
        >
          <ResizablePanel defaultSize={68} minSize={40}>
            <div className="space-y-6 pr-2">{dataWidgets}</div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel
            defaultSize={32}
            minSize={20}
            maxSize={50}
            collapsible
            collapsedSize={0}
          >
            <div className="sticky top-20 pl-2">
              <div className="flex h-[calc(100vh-6rem)] flex-col">
                {agentPanel}
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Mobile: stacked layout */}
      <div className="space-y-6 xl:hidden">
        {dataWidgets}
        {agentPanel}
      </div>
    </>
  );
}
