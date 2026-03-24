"use client";

import { type ReactNode } from "react";

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
      <div className="hidden xl:block">
        <div className="flex items-start gap-6">
          <div className="min-w-0 flex-1 space-y-6">{dataWidgets}</div>

          <aside className="w-[360px] shrink-0 2xl:w-[380px]">
            <div className="sticky top-24">
              <div className="flex h-[calc(100vh-6rem)] flex-col">
                {agentPanel}
              </div>
            </div>
          </aside>
        </div>
      </div>

      <div className="space-y-6 xl:hidden">
        {dataWidgets}
        {agentPanel}
      </div>
    </>
  );
}
