"use client";

import { useState } from "react";

/**
 * The bundle is already gated by the server. `allow-scripts` without
 * `allow-same-origin` keeps the artifact in an opaque origin: it can draw, but
 * it cannot read the host page, cookies or storage.
 */
export function VisualBuildViewer({
  html,
  title,
}: {
  html: string;
  title: string;
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#071018]">
      <div className="aspect-video w-full">
        <iframe
          className="h-full w-full border-0"
          sandbox="allow-scripts"
          srcDoc={html}
          title={`${title} interactive visual build`}
          onLoad={() => setLoaded(true)}
        />
      </div>
      {!loaded ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[#071018] text-xs text-muted">
          Preparing the canvas…
        </div>
      ) : null}
      <p className="border-t border-white/10 px-3 py-2 text-[11px] text-muted">
        Sandboxed WebGL2 artifact · drag to orbit, wheel to zoom, arrow keys to
        pan. The build runs only in this browser.
      </p>
    </div>
  );
}
