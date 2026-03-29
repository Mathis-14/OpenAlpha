"use client";

import { useEffect } from "react";
import { sendGAEvent } from "@next/third-parties/google";

export default function DashboardOpenedTracker({
  type,
}: {
  type: "stocks" | "macro" | "commodities" | "crypto";
}) {
  useEffect(() => {
    sendGAEvent("event", "dashboard_opened", { type });
  }, [type]);

  return null;
}
