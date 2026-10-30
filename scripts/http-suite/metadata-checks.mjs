import { check, checkEqual, request } from "./harness.mjs";
import { auditSocialMetadata, readMetaTags } from "./metadata.mjs";

/**
 * Every public page must carry a complete social card, and the image it names
 * must actually serve. FID-2026-1030-063 found the site emitting no card
 * metadata at all; nothing in the previous gates inspected the head of a
 * rendered page, so this closes that blind spot for the pages people share.
 */
const PAGES = [
  "/",
  "/models",
  "/compare",
  "/docs",
  "/plans",
  "/signup",
  "/login",
  "/support",
  "/terms",
  "/privacy",
  "/refunds",
  "/acceptable-use",
  "/legal",
  "/legal/v1/terms",
  "/legal/v1.1/terms",
];

/** Pages that replaced the site-wide card with one generated from their data. */
const OWN_CARD = ["/models", "/docs"];

const SITE_CARD = "/images/og.png";

export async function runMetadataChecks({ baseUrl }) {
  const images = new Map();

  for (const page of PAGES) {
    const response = await request(baseUrl, page);

    checkEqual(`metadata ${page} serves`, response.status, 200);

    const issues = auditSocialMetadata(response.text);

    check(`metadata ${page} carries a social card`, issues.length === 0, issues.join("; "));

    const image = readMetaTags(response.text).get("og:image");
    // The declared url carries the deployment origin, not this suite's random
    // port, so the path is what gets fetched back.
    const target = new URL(image);
    const path = `${target.pathname}${target.search}`;

    if (!images.has(path)) images.set(path, page);

    if (OWN_CARD.includes(page)) {
      check(
        `metadata ${page} generates its own card`,
        target.pathname !== SITE_CARD,
        `still shares ${SITE_CARD}`,
      );
    }
  }

  for (const [path, page] of images) {
    const response = await request(baseUrl, path);
    const contentType = response.headers.get("content-type") ?? "missing";

    checkEqual(`metadata ${page} card image serves`, response.status, 200);
    check(
      `metadata ${page} card image is an image`,
      contentType.startsWith("image/"),
      contentType,
    );
  }
}
