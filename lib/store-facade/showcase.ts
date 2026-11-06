import * as builds from "../storage/store/showcase-builds.ts";
import * as publicReads from "../storage/store/showcase-public.ts";
import * as sources from "../storage/store/showcase-sources.ts";

import { bound } from "./bound.ts";

/**
 * Showcase façade (FID-2026-1104-013A). Sources, rights and writes stay in the
 * admin surface; public reads have no reference to a mutation helper.
 */

export const upsertShowcaseSource = bound(sources.upsertShowcaseSource);
export const getShowcaseSource = bound(sources.getShowcaseSource);
export const listShowcaseSources = bound(sources.listShowcaseSources);
export const setShowcaseSourceEnabled = bound(sources.setShowcaseSourceEnabled);
export const currentShowcaseRights = bound(sources.currentShowcaseRights);
export const listShowcaseRights = bound(sources.listShowcaseRights);
export const appendShowcaseRights = bound(sources.appendShowcaseRights);
export const claimShowcaseImport = bound(sources.claimShowcaseImport);
export const finishShowcaseImport = bound(sources.finishShowcaseImport);
export const putShowcaseAsset = bound(sources.putShowcaseAsset);
export const readShowcaseAsset = bound(sources.readShowcaseAsset);
export const showcaseStorageUsage = bound(sources.showcaseStorageUsage);

export const persistShowcaseSnapshot = bound(builds.persistShowcaseSnapshot);
export const getShowcaseBinding = bound(builds.getShowcaseBinding);
export const acceptShowcaseBinding = bound(builds.acceptShowcaseBinding);
export const rejectShowcaseBinding = bound(builds.rejectShowcaseBinding);
export const listAdminShowcaseBuilds = bound(builds.listAdminShowcaseBuilds);
export const getAdminShowcaseBuild = bound(builds.getAdminShowcaseBuild);
export const publishShowcaseBuild = bound(builds.publishShowcaseBuild);
export const withdrawShowcaseBuild = bound(builds.withdrawShowcaseBuild);

export const listPublishedVisualBuilds = bound(
  publicReads.listPublishedVisualBuilds,
);
export const getPublishedVisualBuild = bound(
  publicReads.getPublishedVisualBuild,
);
export const getPublishedVisualBundle = bound(
  publicReads.getPublishedVisualBundle,
);
export const getPublishedVisualThumbnail = bound(
  publicReads.getPublishedVisualThumbnail,
);
