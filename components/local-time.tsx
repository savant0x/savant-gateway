"use client";

import { useEffect, useState } from "react";

/**
 * A timestamp in the viewer's own timezone.
 *
 * The server has no idea where the reader is, so the first render is UTC — the
 * one zone both sides can agree on — and the browser's zone is applied after
 * mount. That keeps server HTML and the hydrated tree identical while showing
 * local time to the person who actually reads it. The ISO value travels in
 * `datetime` and `title` so the exact instant is never lost.
 *
 * Date-only strings ("2026-09-22") must not come through here: they parse as UTC
 * midnight and would slide to the previous day for readers west of Greenwich.
 * Use `formatCalendarDay` for those.
 */
const UTC_TEXT = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  hour: "numeric",
  hour12: true,
  minute: "2-digit",
  month: "short",
  timeZone: "UTC",
});

const LOCAL_TEXT = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  hour: "numeric",
  hour12: true,
  minute: "2-digit",
  month: "short",
  timeZoneName: "short",
});

function parse(value: string | null | undefined) {
  const date = value ? new Date(value) : null;

  return date && !Number.isNaN(date.getTime()) ? date : null;
}

export function LocalTime({
  className,
  value,
}: {
  className?: string;
  value: string | null | undefined;
}) {
  const [text, setText] = useState(() => {
    const date = parse(value);

    return date ? `${UTC_TEXT.format(date)} UTC` : (value ?? "—");
  });

  useEffect(() => {
    const date = parse(value);

    setText(date ? LOCAL_TEXT.format(date) : (value ?? "—"));
  }, [value]);

  const date = parse(value);

  if (!date) {
    return <span className={className}>{value ?? "—"}</span>;
  }

  return (
    <time
      className={className}
      dateTime={date.toISOString()}
      title={value ?? undefined}
    >
      {text}
    </time>
  );
}
