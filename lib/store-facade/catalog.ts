import * as banner from "../storage/store/banner.ts";
import * as catalog from "../storage/store/catalog.ts";
import * as eligibility from "../storage/store/eligibility.ts";
import * as groups from "../storage/store/groups.ts";
import * as modelSync from "../storage/store/model-sync.ts";
import * as models from "../storage/store/models.ts";
import * as pricing from "../storage/store/pricing.ts";
import * as pricingDecisions from "../storage/store/pricing-decisions.ts";
import * as providerCatalog from "../storage/store/provider-catalog.ts";
import * as providers from "../storage/store/providers.ts";
import * as routes from "../storage/store/routes.ts";
import * as settings from "../storage/store/settings.ts";
import * as trialOfferModule from "../storage/store/trial-offer.ts";

import { bound } from "./bound.ts";

/**
 * Catalog and provider façade (FID-086, step 4).
 *
 * These wrappers keep the names the synchronous barrel exported, so the caller
 * sweep is an `await` insertion rather than a rewrite. Two things are deliberate:
 *
 * 1. **No renamed aliases.** A wrapper is exported under the ported function's
 *    own name. Where the legacy name differs — `getPricingData` versus
 *    `getPricingSummary` — the caller keeps using the old name only until it is
 *    converted, and the typechecker names the mismatch instead of a silent
 *    shape change hiding behind an alias.
 * 2. **A cache clearer is still a store call.** `clearPublicCatalogCache` takes
 *    the handle (it keys the cache by it), so it is bound like everything else
 *    and a caller must await it before the next render. Treating it as a
 *    no-argument helper threw `Invalid value used as weak map key`, which is why
 *    the façade exports it through `bound` rather than re-exporting it raw.
 */

export const getBannerConfig = bound(banner.getBannerConfig);
export const saveBannerConfig = bound(banner.saveBannerConfig);

export const listModels = bound(catalog.listModels);
export const clearPublicCatalogCache = bound(catalog.clearPublicCatalogCache);

export const listModelGroups = bound(groups.listModelGroups);
export const getModelGroup = bound(groups.getModelGroup);
export const createModelGroup = bound(groups.createModelGroup);
export const updateModelGroup = bound(groups.updateModelGroup);
export const assignModelGroup = bound(groups.assignModelGroup);
export const deleteModelGroup = bound(groups.deleteModelGroup);

export const listAllModels = bound(models.listAllModels);
export const getModelForGateway = bound(models.getModelForGateway);
export const getModelByUpstreamId = bound(models.getModelByUpstreamId);
export const applyCatalogMarkup = bound(models.applyCatalogMarkup);
export const replaceModels = bound(modelSync.replaceModels);
export const setModelCost = bound(models.setModelCost);
export const setModelPricing = bound(models.setModelPricing);
export const setModelStatus = bound(models.setModelStatus);

export const listProviderReviewModels = bound(
  eligibility.listProviderReviewModels,
);
export const setModelEligibility = bound(eligibility.setModelEligibility);

export const getMarkupBps = bound(settings.getMarkupBps);
export const saveMarkupBps = bound(settings.saveMarkupBps);

export const getPricingSummary = bound(pricing.getPricingSummary);
export const listPricingDecisions = bound(
  pricingDecisions.listPricingDecisions,
);

export const listProviderCatalogSummary = bound(
  providerCatalog.listProviderCatalogSummary,
);

export const listProviders = bound(providers.listProviders);
export const getProvider = bound(providers.getProvider);
export const getDefaultProvider = bound(providers.getDefaultProvider);
export const getProviderStatusBySlug = bound(providers.getProviderStatusBySlug);
export const createProvider = bound(providers.createProvider);
export const updateProvider = bound(providers.updateProvider);
export const setProviderEnabled = bound(providers.setProviderEnabled);
export const deleteProvider = bound(providers.deleteProvider);

export const reconcileRoutes = bound(routes.reconcileRoutes);

/** Published next to every catalog row, so it belongs with the catalog reads. */
export const trialOffer = bound(trialOfferModule.trialOffer);
