'use client';

import { useEffect, useState } from 'react';

/**
 * Dismissible warning banner for refused activation attempts.
 *
 * The server passes the count + the timestamp of the most recent rejection.
 * "Seen" state lives in localStorage (keyed on that timestamp): clicking the ✕
 * marks the current latest as seen, so the banner stays gone across reloads and
 * only reappears when a NEWER rejection arrives. No server round-trip needed.
 */
const SEEN_KEY = 'le_rejects_seen_until';

export function DashboardRejectsBanner({
  count,
  latestRejectedAt,
  href,
  message,
  closeLabel,
}: {
  count: number;
  latestRejectedAt: string | null;
  href: string;
  message: string;
  closeLabel: string;
}) {
  // Start hidden to avoid a flash before localStorage is read on the client.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (count <= 0 || !latestRejectedAt) {
      setVisible(false);
      return;
    }
    const seen = window.localStorage.getItem(SEEN_KEY);
    // ISO-8601 UTC strings compare lexicographically in chronological order.
    setVisible(seen === null || seen < latestRejectedAt);
  }, [count, latestRejectedAt]);

  if (!visible) return null;

  function dismiss() {
    if (latestRejectedAt) window.localStorage.setItem(SEEN_KEY, latestRejectedAt);
    setVisible(false);
  }

  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <a href={href} className="flex items-center gap-2 font-medium hover:underline">
        <span aria-hidden>⚠</span>
        {message}
      </a>
      <button
        type="button"
        onClick={dismiss}
        aria-label={closeLabel}
        className="rounded p-1 text-amber-700 hover:bg-amber-100"
      >
        ✕
      </button>
    </div>
  );
}
