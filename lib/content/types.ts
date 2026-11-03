/** Shared content types. No server-only import: the pure helpers are testable. */

export const CONTENT_KINDS = [
  "article",
  "video",
  "paper",
  "repo",
  "discussion",
] as const;

export type ContentKind = (typeof CONTENT_KINDS)[number];

export const SOURCE_KINDS = [
  "rss",
  "youtube",
  "huggingface",
  "trendshift",
  "hackernews",
] as const;

export type SourceKind = (typeof SOURCE_KINDS)[number];

export type SourceStatus = "active" | "error" | "disabled";

export type ContentSource = {
  id: string;
  kind: SourceKind;
  label: string;
  url: string;
  config: SourceConfig;
  enabled: boolean;
  fetchIntervalMinutes: number;
  maxItems: number;
  status: SourceStatus;
  failureStreak: number;
  lastFetchedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SourceConfig = {
  tags: string[];
  channelId?: string;
  /** Extra Hacker News include terms; the built-in AI vocabulary still applies. */
  includeTerms?: string[];
  /** Hacker News terms that veto a match even when an include term is present. */
  excludeTerms?: string[];
};

/**
 * Upstream engagement, when the source publishes it. YouTube feeds carry views
 * and a star average; the Data API adds likes and the YouTube comment count.
 * A zero is "not reported", never an asserted zero, so the UI omits it.
 */
export type ContentMetrics = {
  views: number;
  likes: number;
  youtubeComments: number;
  rating: number | null;
};

/**
 * GitHub facts denormalized at fetch time (FID-2026-1102-096). A render never
 * calls GitHub; a missing token leaves this null rather than guessing.
 */
export type GitHubRepo = {
  slug: string;
  description: string | null;
  stars: number;
  forks: number;
  language: string | null;
  topics: string[];
  license: string | null;
  homepage: string | null;
  pushedAt: string | null;
  ogImageUrl: string;
  /** Sanitized GitHub README, or "" when the repository publishes none. */
  readmeHtml: string | null;
};

export type ContentItem = {
  id: string;
  sourceId: string;
  sourceLabel: string;
  kind: ContentKind;
  title: string;
  /** Discussion/identity URL. For Hacker News this is the item thread. */
  url: string;
  /** Publisher URL when the source reports one separately from its identity. */
  externalUrl: string | null;
  excerpt: string;
  bodyHtml: string | null;
  author: string | null;
  publishedAt: string;
  fetchedAt: string;
  thumbnailUrl: string | null;
  videoId: string | null;
  externalId: string | null;
  tags: string[];
  metrics: ContentMetrics;
  github: GitHubRepo | null;
};

export type ContentComment = {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
  /** Null for a top-level comment; one level of replies is allowed. */
  parentId: string | null;
};

export const CONTENT_REACTIONS = ["useful", "insightful"] as const;

export type ContentReaction = (typeof CONTENT_REACTIONS)[number];

export type ContentReactionSummary = {
  reaction: ContentReaction;
  count: number;
  mine: boolean;
};

/** Health fields safe to publish; never includes the URL, config or error. */
export type PublicContentSource = {
  id: string;
  label: string;
  kind: SourceKind;
  enabled: boolean;
  status: SourceStatus;
  failureStreak: number;
  lastFetchedAt: string | null;
  fetchIntervalMinutes: number;
};

export type ContentModelLink = {
  modelId: string;
  relation: ContentRelation;
  relationSource: "auto" | "operator";
  confidence: number;
  reason: string;
  reviewed: boolean;
};

export type ContentRelation =
  | "release"
  | "benchmark"
  | "hands_on"
  | "discussion"
  | "repository"
  | "paper"
  | "mention";

export const CONTENT_RELATIONS: ContentRelation[] = [
  "release",
  "benchmark",
  "hands_on",
  "discussion",
  "repository",
  "paper",
  "mention",
];

export type LinkableModel = {
  id: string;
  name: string;
  family: string;
  upstreamId: string;
};

export type LinkSuggestion = {
  modelId: string;
  relation: ContentRelation;
  confidence: number;
  reason: string;
  reviewed: boolean;
};

export type ParsedItem = {
  externalId: string | null;
  kind: ContentKind;
  title: string;
  url: string;
  externalUrl?: string | null;
  excerpt: string;
  bodyHtml: string | null;
  author: string | null;
  publishedAt: string;
  thumbnailUrl: string | null;
  videoId: string | null;
  tags: string[];
  metrics?: ContentMetrics;
  github?: GitHubRepo | null;
};

export type FetchCycle = {
  id: string;
  sourceId: string;
  status: "running" | "ok" | "error";
  startedAt: string;
  finishedAt: string | null;
  itemsSeen: number;
  itemsUpserted: number;
  error: string | null;
};

export type ContentPage = {
  items: ContentItem[];
  total: number;
};

export type ContentTag = {
  slug: string;
  label: string;
  count: number;
};

export type ContentStats = {
  sources: number;
  enabledSources: number;
  items: number;
  linkedItems: number;
  lastFetchedAt: string | null;
};

export type CoverageItem = ContentItem & {
  relation: ContentRelation;
  reason: string;
  confidence: number;
};

export type Coverage = {
  modelId: string;
  total: number;
  counts: Record<ContentRelation, number>;
  items: CoverageItem[];
};
