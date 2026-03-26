const UTC_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function formatUtcDate(value: string | number | Date): string {
  return UTC_DATE_FORMATTER.format(new Date(value));
}

export function formatRelativeTimeFromNow(value: string | number | Date): string {
  const diffMs = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diffMs / 60_000);

  if (mins < 60) {
    return `${Math.max(0, mins)}m ago`;
  }

  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
