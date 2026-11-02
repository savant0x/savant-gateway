/** Shared content types. No server-only import: the pure helpers are testable. */

export const CONTENT_KINDS = [
  "article",
  "video",
  "paper",
  "repo",
  "discussion",
] as const;

export type ContentKind = (typeof CONTENT_KINDS)[number];

export const SOURCE_KINDS = ["rss", "youtube"] as const;

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
};

export type ContentItem = {
  id: string;
  sourceId: string;
  sourceLabel: string;
  kind: ContentKind;
  title: string;
  url: string;
  excerpt: string;
  bodyHtml: string | null;
  author: string | null;
  publishedAt: string;
  fetchedAt: string;
  thumbnailUrl: string | null;
  videoId: string | null;
  externalId: string | null;
  tags: string[];
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
  excerpt: string;
  bodyHtml: string | null;
  author: string | null;
  publishedAt: string;
  thumbnailUrl: string | null;
  videoId: string | null;
  tags: string[];
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
