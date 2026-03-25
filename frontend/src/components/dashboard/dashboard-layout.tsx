"use client";

import { Children, type ReactNode } from "react";

interface DashboardLayoutProps {
  topWidgets?: ReactNode;
  chartWidget?: ReactNode;
  bottomWidgets?: ReactNode;
  bottomLeftWidgets?: ReactNode;
  bottomRightWidgets?: ReactNode;
  dataWidgets?: ReactNode;
  agentPanel: ReactNode;
}

export default function DashboardLayout({
  topWidgets,
  chartWidget,
  bottomWidgets,
  bottomLeftWidgets,
  bottomRightWidgets,
  dataWidgets,
  agentPanel,
}: DashboardLayoutProps) {
  const topWidgetNodes = Children.toArray(topWidgets);
  const bottomWidgetNodes = Children.toArray(bottomWidgets);
  const bottomLeftWidgetNodes = Children.toArray(bottomLeftWidgets);
  const bottomRightWidgetNodes = Children.toArray(bottomRightWidgets);
  const dataWidgetNodes = Children.toArray(dataWidgets);
  const hasStructuredLayout =
    topWidgetNodes.length > 0 ||
    chartWidget != null ||
    bottomWidgetNodes.length > 0;
  const hasSplitBottomLayout =
    bottomLeftWidgetNodes.length > 0 || bottomRightWidgetNodes.length > 0;

  return (
    <>
      <div className="hidden xl:block space-y-6">
        <div className="flex items-start gap-6">
          <div className="min-w-0 flex-1">
            {hasStructuredLayout ? (
              <div className="space-y-6">
                <div className="grid h-[calc(100vh-8rem)] min-h-[540px] grid-rows-[auto_minmax(0,1fr)] gap-5">
                  <div className="space-y-5">{topWidgetNodes}</div>
                  {chartWidget ? <div className="min-h-0">{chartWidget}</div> : null}
                </div>
                {!hasSplitBottomLayout ? bottomWidgetNodes : null}
              </div>
            ) : (
              <div className="space-y-6">{dataWidgetNodes}</div>
            )}
          </div>

          <aside className="w-[360px] shrink-0 2xl:w-[380px]">
            <div className="sticky top-24">
              <div className="flex h-[calc(100vh-8rem)] min-h-0 flex-col">
                {agentPanel}
              </div>
            </div>
          </aside>
        </div>

        {hasSplitBottomLayout ? (
          <div className="grid items-stretch gap-6 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-6">{bottomLeftWidgetNodes}</div>
            <div className="min-w-0 space-y-6">{bottomRightWidgetNodes}</div>
          </div>
        ) : null}
      </div>

      <div className="space-y-6 xl:hidden">
        {hasStructuredLayout ? (
          <>
            {topWidgetNodes}
            {chartWidget}
            {bottomWidgetNodes}
            {bottomLeftWidgetNodes}
            {bottomRightWidgetNodes}
          </>
        ) : (
          dataWidgetNodes
        )}
        {agentPanel}
      </div>
    </>
  );
}
