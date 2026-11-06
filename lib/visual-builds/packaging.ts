import { VISUAL_BUILD_LIMITS, sha256Hex } from "./types.ts";

/**
 * Thin wrapper for a Pelican artifact (FID-2026-1104-013A).
 *
 * The artifact is stored as an ES module and injected as a Blob URL. The wrapper
 * has no network permission, no navigation, no eval, and no access to the host
 * document. A runtime error is shown inside the frame instead of silently
 * leaving a blank canvas.
 */

const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' blob:",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "connect-src 'none'",
  "font-src 'none'",
  "media-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
].join("; ");

function safeJson(value: string): string {
  // JSON.stringify does not escape `</script>`. Escaping every `<` keeps the
  // module text inside its script element without changing its meaning.
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function packagePelicanArtifact(artifact: string): {
  html: string;
  sha256: string;
} {
  if (Buffer.byteLength(artifact, "utf8") > VISUAL_BUILD_LIMITS.artifactBytes) {
    throw new Error("The visual-build artifact exceeds its byte ceiling.");
  }
  if (!/^\s*export\s+function\s+createPelicanSdf\s*\(/m.test(artifact)) {
    throw new Error(
      "The visual-build artifact does not export createPelicanSdf.",
    );
  }

  const moduleSource = safeJson(artifact);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<title>Visual build</title>
<style>
html,body{height:100%;margin:0;background:#071018;color:#dbe9ef;font:13px ui-sans-serif,system-ui,sans-serif;overflow:hidden}
canvas{display:block;width:100%;height:100%;outline:none;cursor:grab;touch-action:none}
#error{display:none;padding:24px;line-height:1.5;color:#ffd2c7}
#note{position:absolute;left:12px;bottom:10px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#7e9aa6;pointer-events:none}
</style>
</head>
<body>
<canvas id="pelican" tabindex="0" aria-label="Interactive 3D pelican visual build"></canvas>
<div id="error" role="alert"></div>
<div id="note">drag to orbit · wheel to zoom · arrow keys to pan</div>
<script type="module">
const canvas = document.getElementById("pelican");
const errorBox = document.getElementById("error");
try {
  const blob = new Blob([${moduleSource}], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  try {
    const mod = await import(url);
    if (typeof mod.createPelicanSdf !== "function") {
      throw new Error("The artifact did not export createPelicanSdf.");
    }
    mod.createPelicanSdf(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
} catch (error) {
  canvas.hidden = true;
  errorBox.style.display = "block";
  errorBox.textContent = "This visual build could not start in this browser. " +
    (error instanceof Error ? error.message : String(error));
}
</script>
</body>
</html>`;

  if (Buffer.byteLength(html, "utf8") > VISUAL_BUILD_LIMITS.htmlBytes) {
    throw new Error("The packaged visual build exceeds its byte ceiling.");
  }

  return { html, sha256: sha256Hex(html) };
}

export function packageOpenRouterArtifact(html: string): {
  html: string;
  sha256: string;
} {
  if (Buffer.byteLength(html, "utf8") > VISUAL_BUILD_LIMITS.htmlBytes) {
    throw new Error("The OpenRouter artifact exceeds its byte ceiling.");
  }
  if (!/^\s*<!doctype html/i.test(html)) {
    throw new Error("The OpenRouter artifact is not an HTML document.");
  }
  if (!/<canvas[\s>]/i.test(html) || !/<script[\s>]/i.test(html)) {
    throw new Error("The OpenRouter artifact has no executable canvas.");
  }
  if (!/default-src 'none'/i.test(html) || !/connect-src 'none'/i.test(html)) {
    throw new Error("The OpenRouter artifact is missing its offline CSP.");
  }
  if (/(?:src|href)\s*=\s*["']\s*(?:https?:)?\/\//i.test(html)) {
    throw new Error("The OpenRouter artifact references a remote asset.");
  }
  if (/<\s*(?:iframe|object|embed|base|form)\b/i.test(html)) {
    throw new Error("The OpenRouter artifact contains a forbidden element.");
  }

  return { html, sha256: sha256Hex(html) };
}

export function packageVisualArtifact(
  mime: string,
  bytes: Uint8Array,
): { html: string; sha256: string } {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);

  return mime.startsWith("text/html")
    ? packageOpenRouterArtifact(text)
    : packagePelicanArtifact(text);
}

export function visualBuildBundleEtag(sha256: string): string {
  return `"vb-${sha256.slice(0, 32)}"`;
}
