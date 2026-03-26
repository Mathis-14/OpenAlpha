"use client";

import { useEffect, useState } from "react";
import { formatRelativeTimeFromNow, formatUtcDate } from "@/lib/date-format";

export default function RelativeTime({
  value,
}: {
  value: string | number | Date;
}) {
  const absoluteLabel = formatUtcDate(value);
  const [label, setLabel] = useState(absoluteLabel);

  useEffect(() => {
    const update = () => {
      setLabel(formatRelativeTimeFromNow(value));
    };

    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, [value]);

  return <span title={absoluteLabel}>{label}</span>;
}
