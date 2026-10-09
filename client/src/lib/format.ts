const shortFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
});

export function formatShortDate(value: string | null | undefined): string {
  if (!value) return "Not yet";
  return shortFormatter.format(new Date(value));
}

/** Compact relative time for dense lists: "just now", "4h ago", "3d ago". */
export function formatRelative(value: string | null | undefined): string {
  if (!value) return "Never";

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "Unknown";

  const diff = Date.now() - timestamp;
  const minutes = Math.round(diff / 60_000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;

  return formatShortDate(value);
}
