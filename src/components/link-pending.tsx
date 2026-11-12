"use client";

import { useLinkStatus } from "next/link";

// A dot that fades in while the parent <Link> is navigating. Dashboard pages
// wait on the server, so without it a click gives no sign that it registered.
// The link needs `relative`. The short delay keeps quick navigations from flashing.
export function LinkPending() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      data-pending={pending ? "" : undefined}
      className="pointer-events-none absolute top-1/2 right-1 size-1.5 -translate-y-1/2 rounded-full bg-current opacity-0 transition-opacity delay-100 data-pending:opacity-70"
    />
  );
}
